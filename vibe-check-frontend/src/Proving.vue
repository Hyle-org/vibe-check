<script setup lang="ts">
import Socials from "./components/Socials.vue";
import { computed, reactive, ref } from "vue";
import { network } from "./network";
import { MsgPublishPayloads, getParsedTx, deserByteArray, getNetworkRpcUrl } from "hyle-js";
import { allTransactions, getBalances, getBalancesAtTx } from "./SmileTokenIndexer";

const parsedTransactions = computed(() => {
    const ret = {} as Record<string, MsgPublishPayloads>;
    for (const tx of allTransactions.value) {
        if (tx.type)
            ret[tx.hash] = getParsedTx(tx);
    }
    return ret;
})

function getPayload(txHash: string, contract: string) {
    const data = parsedTransactions.value?.[txHash] as MsgPublishPayloads | undefined;
    if (!data)
        return undefined;
    return data.payloads.find(x => x.contractName === contract)?.data;
}


function parseECDSAPayload(data?: Uint8Array) {
    if (!data)
        return "Unknown";
    return JSON.parse(window.atob(uint8ArrayToBase64(data)));
}

function parseErc20Payload(data?: Uint8Array) {
    if (!data)
        return "Unknown";
    const parsed = new TextDecoder().decode(data);
    const felts = parsed.slice(1, -1).split(" ");
    const fromSize = parseInt(felts[0]);
    const from = deserByteArray(felts.slice(0, fromSize + 3));
    const toSize = parseInt(felts[3 + fromSize]);
    const to = deserByteArray(felts.slice(3 + fromSize, 3 + fromSize + toSize + 3));
    const amount = parseInt(felts.slice(-1)[0]);
    return `${from} => ${to} (${amount} hylé)`;
}

function parseMLPayload(data?: Uint8Array) {
    if (!data)
        return [];
    const asb64 = uint8ArrayToBase64(data);
    // Parse base64 into ascii
    const ascii = atob(asb64);
    // At this point it's a list of numbers separated by spaces
    const numbers = ascii.slice(1, -1).split(" ");
    return numbers;
}

function createMlImage(numbers: string[]) {
    // Create a 48x48 image
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return "";
    const imgData = ctx.createImageData(48, 48);
    for (let i = 0; i < 48; i++) {
        for (let j = 0; j < 48; j++) {
            const idx = (i * 48 + j) * 4;
            const val = parseInt(numbers[i * 48 + j]);
            imgData.data[idx] = val / 100000 * 255;
            imgData.data[idx + 1] = val / 100000 * 255;
            imgData.data[idx + 2] = val / 100000 * 255;
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
}

import { proveERC20Transfer } from "./cairo/prover";
import { CairoArgs, CairoSmileArgs } from "./cairo/CairoHash";
import { proveECDSA } from "./noir/prover";
import { setupCosmos, broadcastProofTx, checkTxStatuses, checkTxStatus } from "./cosmos";
import { uint8ArrayToBase64 } from "./utils";

const ecdsaPromiseDone = ref(false);
const smilePromiseDone = ref(false);
const erc20PromiseDone = ref(false);

const status = ref("idle" as "idle" | "proving" | "checking_tx" | "tx_success" | "tx_failure" | "failed_at_proving");

const error = ref<string | null>(null);
const sentTxHash = ref<string | null>(null);

const ProveAndSendProofsTx = async (txHash: string) => {
    const setup = setupCosmos(getNetworkRpcUrl(network)!);

    const webAuthnValues = parseECDSAPayload(getPayload(txHash, "ecdsa_secp256r1"));

    const data = getPayload(txHash, "smile_token");
    const parsed = new TextDecoder().decode(data);
    const felts = parsed.slice(1, -1).split(" ");
    const fromSize = parseInt(felts[0]);
    const from = deserByteArray(felts.slice(0, fromSize + 3));
    const toSize = parseInt(felts[3 + fromSize]);
    const to = deserByteArray(felts.slice(3 + fromSize, 3 + fromSize + toSize + 3));
    const amount = parseInt(felts.slice(-1)[0]);

    const erc20Args = {
        balances: getBalancesAtTx(txHash),
        from: from,
        to: to,
        amount: amount,
    } as CairoArgs;

    const smileArgs = {
        identity: erc20Args.to, // Mild hack
        image: parseMLPayload(getPayload(txHash, "smile")).map(x => parseInt(x)),
    } as CairoSmileArgs;

    ecdsaPromiseDone.value = false;
    smilePromiseDone.value = false;
    erc20PromiseDone.value = false;
    status.value = "proving";
    try {
        const ecdsaPromise = proveECDSA(webAuthnValues);
        const erc20Promise = proveERC20Transfer(erc20Args);
        // const smilePromise = proveSmile(smileArgs);

        ecdsaPromise.then(() => ecdsaPromiseDone.value = true);
        erc20Promise.then(() => erc20PromiseDone.value = true);
        // smilePromise.then(() => smilePromiseDone.value = true);

        await setup;

        // Send the proofs transactions
        const ecdsaResp = await broadcastProofTx(
            txHash,
            0,
            "ecdsa_secp256r1",
            window.btoa(await ecdsaPromise)
        );
        // const smileResp = await broadcastProofTx(
        //     txHash,
        //     1,
        //     "smile",
        //     uint8ArrayToBase64(await smilePromise)
        // );
        const erc20Resp = await broadcastProofTx(
            txHash,
            2,
            "smile_token",
            uint8ArrayToBase64(await erc20Promise)
        );
        console.log("ecdsaProofTx: ", ecdsaResp.transactionHash)
        // console.log("smileProofTx: ", smileResp.transactionHash)
        console.log("erc20ProofTx: ", erc20Resp.transactionHash)
        // Switch to waiter view
        status.value = "checking_tx";

        // Wait a bit and assume TX will be processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check the status of the TX
        const txStatus = await checkTxStatuses([
            ecdsaResp.transactionHash,
            // smileResp.transactionHash,
            erc20Resp.transactionHash,
        ]);
        if (txStatus.status === "success") {
            status.value = "tx_success";
            sentTxHash.value = erc20Resp.transactionHash;
        } else {
            status.value = "tx_failure";
            error.value = txStatus.error || "Unknown error";
        }
    } catch (e) {
        console.error(e);
        error.value = `${e}`;
        status.value = "failed_at_proving";
    }
}
</script>

<template>
    <div class="container m-auto">
        <Socials />
        <hr />
        <h1 class="text-center my-4">Proving Vibe Check</h1>
        <hr />
        <div class="my-4">
            <p>This shows all transactions sent to the vibe check contracts.</p>
            <p>Some of these transactions may not be proven yet, feel free to do it now !</p>
        </div>
        <div class="flex flex-col gap-2 mb-8">
            <div class="tx" v-for="tx in allTransactions" :key="tx.hash">
                <div class="w-16 px-4 py-1 border-r-2">
                    <p>{{ tx.height }}</p>
                </div>
                <div class="w-16 px-4 py-1 border-r-2">
                    <template v-if="tx.status === 'sequenced'">
                        <p>⏳</p>
                    </template>
                    <template v-else-if="tx.status === 'failure'">
                        <p>❌</p>
                    </template>
                    <template v-else-if="tx.status === 'success'">
                        <p>✅</p>
                    </template>
                    <template v-else>
                        <p><i class="spinner"></i></p>
                    </template>
                </div>
                <div class="flex-1 px-4 py-1">
                    <img v-if="tx.type" class="min-w-12"
                        :src="createMlImage(parseMLPayload(getPayload(tx.hash, 'smile')))" />
                    <div class="ml-4 inline-flex flex-col flex-1">
                        <p>Transaction hash: <span class="font-mono text-sm">0x{{ tx.hash }}</span></p>
                        <p>{{ parseErc20Payload(getPayload(tx.hash, "smile_token")) }}</p>
                    </div>
                </div>
                <div class="w-24 px-4 border-l-2" v-if="tx.status === 'sequenced'">
                    <button @click="ProveAndSendProofsTx(tx.hash)">Prove</button>
                </div>
            </div>
        </div>
    </div>
    <div class="provingOverlay" v-if="status !== 'idle'">
        <div class="max-w-[600px] max-h-[400px] p-4 bg-primary rounded-xl text-secondary shadow-xl flex flex-col gap-2">
            <template v-if="status === 'proving' || status === 'checking_tx' || status === 'tx_success'">
                <p class="flex items-center">Generating ECDSA signature proof:
                    <i v-if="!ecdsaPromiseDone" class="spinner"></i>
                    <span v-else>✅</span>
                </p>
                <p class="text-sm mb-1 text-opacity-80 italic">(This is actually done
                    client-side so it takes a while)</p>
                <p class="flex items-center">Generating proof of smile: <i v-if="!smilePromiseDone"
                        class="spinner"></i><span v-else>✅</span></p>
                <p class="flex items-center">Generating ERC20 claim proof: <i v-if="!erc20PromiseDone"
                        class="spinner"></i><span v-else>✅</span></p>
                <p class="flex items-center gap-1">Sending Proofs: <i v-if="status === 'proving'"
                        class="spinner"></i><span v-else>✅</span></p>
                <div v-if="status === 'checking_tx'" class="flex flex-col justify-center items-center my-8">
                    <i class="spinner"></i>
                    <p class="italic">...TX sent, checking status...</p>
                </div>
                <button v-if="status === 'tx_success'" @click="status = 'idle'"
                    class="bg-secondary text-primary p-2 rounded-xl">Close</button>
            </template>
            <template v-else>
                <p>Transaction failed: {{ error }}</p>
                <button @click="status = 'idle'" class="bg-secondary text-primary p-2 rounded-xl">Close</button>
            </template>
        </div>
    </div>
</template>

<style scoped>
.tx {
    @apply bg-secondary bg-opacity-20 flex content-stretch;
}

.tx>div {
    @apply border-secondary border-opacity-20 inline-flex items-center justify-center;
}

.provingOverlay {
    @apply fixed inset-0 flex justify-center items-center bg-black bg-opacity-40;
}
</style>