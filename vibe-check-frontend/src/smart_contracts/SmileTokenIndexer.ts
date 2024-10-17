import { computed, reactive, ref, watch } from "vue";
import { Erc20Parser, TransactionsStore } from "hyle-js";
import { network } from "../network";

export function getBalances(): { name: string; amount: number }[] {
    return Object.entries(state.value.balancesSettled).map(([name, amount]) => ({ name, amount }));
}

export function getBalancesAtTx(txHash: string) {
    const contract = new Erc20Parser("smile_token", {"faucet": 1000000});

    const lastIndex = txData.blobTransactions.findIndex((tx) => tx.txHash === txHash);
    if (lastIndex === -1) return [];

    const txs = txData.blobTransactions
        .slice(0, lastIndex + 1)
        .filter((tx) => tx.transactionStatus === "Success" || tx.transactionStatus === "Sequenced");
    txs.forEach((tx) => {
        contract.consumeTx(tx);
    });
    return Object.entries(contract.balancesPending).map(([name, amount]) => ({ name, amount }));
}

const txData = reactive(new TransactionsStore(network));
const state = ref(new Erc20Parser("smile_token"));

export const allSmileTokenBlobTransactions = computed(() => {
    txData.loadBlobTxsLinkedWithContract("smile_token");
    return txData.blobTransactions;
});


export function initialize() {
    state.value = reactive(new Erc20Parser("smile_token", {"faucet": 1000000}));

    watch(
        allSmileTokenBlobTransactions,
        (newTransactions, oldTransactions) => {
            const newTxs = newTransactions.filter(tx => !oldTransactions.includes(tx));
            newTxs.forEach(tx => {
                state.value.consumeTx(tx);
                if (tx.transactionStatus === "Success") {
                    state.value.settleTx(tx.txHash, true);
                }
            });
        },
        { deep: true }
    );
}

initialize();
