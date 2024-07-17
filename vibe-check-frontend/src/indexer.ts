class WebSocketConnection {
    protected ws!: WebSocket;
    private url: string;

    private reconnectAttempts: number = 0;

    opened!: Promise<void>;

    static async connect(url: string) {
        const client = new JSONRpcClient(url);
        await client.opened;
        return client;
    }

    protected constructor(url: string) {
        this.url = url;
        this.connectWebSocket();
    }

    private async connectWebSocket() {
        this.opened = new Promise(async (resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onerror = () => {
                this.attemptReconnect().catch(reject);
            };

            this.ws.onclose = () => {
                this.attemptReconnect().catch(reject);
            };

            this.ws.onopen = () => {
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                resolve();
            };
        });
        await this.opened;

        this.ws.onmessage = (event) => this.onMessage(event);
    }

    private async attemptReconnect() {
        if (this.reconnectAttempts < 3) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, this.reconnectAttempts) * 1000));
            this.reconnectAttempts++;
            await this.connectWebSocket();
        } else {
            throw new Error("Maximum reconnect attempts reached.");
        }
    }

    protected onMessage(_event: MessageEvent) {
        // This method should be overridden by subclasses
        console.error("onMessage not implemented");
    }

    protected sendMessage(message: string) {
        this.ws.send(message);
    }
}

export type Tx = {
    height: number;
    txhash: string;
    tx: any;
};

class JSONRpcClient extends WebSocketConnection {
    private idCounter: number = 1;
    private queuedResults: Tx[] = [];
    private messageHandlers: { [id: number]: (result: any) => void } = {};

    private MAX_PAGE_SIZE = 40;

    // Custom handler for transaction updates
    private onNewTx: (client: JSONRpcClient) => void = () => {};

    protected onMessage(event: MessageEvent) {
        const message = JSON.parse(event.data);
        // console.log('Received message for', message.id);
        if (message.result) {
            this.messageHandlers[message.id]?.(message.result);
        }
    }

    private async call(method: string, params: any, handler: (result: any) => void) {
        const id = this.idCounter++;
        const payload = JSON.stringify({ jsonrpc: "2.0", method, params, id });
        this.messageHandlers[id] = handler;
        this.sendMessage(payload);
    }

    private async search(query: string, handler: (result: any) => void) {
        const total_count = await new Promise<number>((resolve) => {
            this.call("tx_search", { query, per_page: `${this.MAX_PAGE_SIZE}`, order_by: "desc" }, (result) => {
                handler(result);
                this.onNewTx(this);
                resolve(+result.total_count);
            });
        });
        // Search results are paginated, so we need to fetch all pages
        for (let i = 1; i * this.MAX_PAGE_SIZE < total_count; i++) {
            // await new Promise((resolve) => setTimeout(resolve, 1000));
            this.call(
                "tx_search",
                { query, page: `${i + 1}`, per_page: `${this.MAX_PAGE_SIZE}`, order_by: "desc" },
                async (result) => {
                    handler(result);
                    // This is pessimistic but whatever.
                    this.onNewTx(this);
                },
            );
        }
    }

    private subscribe(query: string) {
        return this.call("subscribe", { query }, (result) => {
            if (!result.data?.value?.TxResult) {
                this.onNewTx(this);
                return;
            }
            const tx = result.data.value.TxResult;
            this.queuedResults.push({
                height: tx.height,
                txhash: result.events["tx.hash"][0],
                tx: tx.tx,
            });
            this.onNewTx(this);
        });
    }

    async searchAndSubscribe(query: string, onNewTx: (client: JSONRpcClient) => void) {
        this.onNewTx = onNewTx;
        this.subscribe(query);
        // TODO: It's possible that we actually miss some TX between subscribe and search
        // but that's fine for now.
        this.search(query, (result) => {
            this.queuedResults.push(
                ...result.txs.map((tx: any) => ({
                    height: tx.height,
                    txhash: tx.hash,
                    tx: tx.tx,
                })),
            );
        });
    }

    getResults() {
        return this.queuedResults.sort((a, b) => a.height - b.height);
    }
}

export function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

import { ref } from "vue";
import { MsgExecuteStateChanges, MsgRegisterContract } from "./proto/tx.ts";
import { Tx as CosmosTx } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { getNetworkWebsocketUrl } from "./network.ts";

export function GetAllStateChanges() {
    let messages = ref(
        [] as {
            height: number;
            txhash: string;
            messages: MsgExecuteStateChanges;
        }[],
    );

    JSONRpcClient.connect(getNetworkWebsocketUrl()).then((client) => {
        client.searchAndSubscribe("message.action='/hyle.zktx.v1.MsgExecuteStateChanges'", (client) => {
            messages.value = [];
            const results = client.getResults();
            results.map((tx) => {
                const txRaw = base64ToUint8Array(tx.tx);
                const txData = CosmosTx.decode(txRaw);
                txData.body?.messages?.map((msg) => {
                    messages.value.push({
                        height: tx.height,
                        txhash: tx.txhash,
                        messages: MsgExecuteStateChanges.decode(msg.value),
                    });
                });
            });
        });
    });

    return messages;
}

export function GetAllContractRegistrations() {
    let registerMsgs = ref(
        [] as {
            height: number;
            txhash: string;
            messages: MsgRegisterContract;
        }[],
    );

    (async () => {
        const client = await JSONRpcClient.connect(getNetworkWebsocketUrl());
        client.searchAndSubscribe("message.action='/hyle.zktx.v1.MsgRegisterContract'", (client) => {
            registerMsgs.value = [];
            const results = client.getResults();
            results.map((tx) => {
                const txRaw = base64ToUint8Array(tx.tx);
                const txData = CosmosTx.decode(txRaw);
                txData.body?.messages?.map((msg) => {
                    registerMsgs.value.push({
                        height: tx.height,
                        txhash: tx.txhash,
                        messages: MsgRegisterContract.decode(msg.value),
                    });
                });
            });
        });
    })();

    return registerMsgs;
}
