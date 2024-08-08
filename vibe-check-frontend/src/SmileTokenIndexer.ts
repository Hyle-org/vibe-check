import { computed, reactive, ref, watch, watchEffect } from "vue";
import { Erc20Parser, TransactionsStore } from "hyle-js";
import { network } from "./network";

export function getBalances(): { name: string; amount: number }[] {
    return Object.entries(state.value.balancesSettled).map(([name, amount]) => ({ name, amount }));
}

export function getBalancesAtTx(txHash: string) {
    const lastIndex = allTransactions.value.findIndex((tx) => tx.hash === txHash);
    if (lastIndex === -1) return [];
    const txs = allTransactions.value.slice(0, lastIndex);
    const contract = new Erc20Parser("smile_token");
    contract.balancesPending["faucet"] = 1000000;
    txs.forEach((tx) => {
        if (!tx.type) return;
        contract.consumeTx(tx);
    });
    return Object.entries(contract.balancesPending).map(([name, amount]) => ({ name, amount }));
}

export type BalanceChange = {
    from: string;
    to: string;
    value: number;
};

const txData = reactive(new TransactionsStore(network));
const state = ref(new Erc20Parser("smile_token"));

export const allTransactions = computed(() => {
    const txs = Object.values(txData.transactionData).filter((tx) => tx.contracts?.includes("smile_token"));
    return txs.sort((a, b) => a.height - b.height + a.index - b.index);
});

watchEffect(() => {
    allTransactions.value.forEach((tx) => {
        if (!tx.type) {
            txData.loadTransactionData(tx.hash);
            return;
        }
    });
});

watchEffect(() => {
    state.value = reactive(new Erc20Parser("smile_token"));
    state.value.balancesSettled["faucet"] = 1000000;
    const transactions = allTransactions.value.filter((tx) => tx.status !== "sequenced");
    transactions.forEach((tx) => {
        if (!tx.type) return;
        state.value.consumeTx(tx);
        state.value.settleTx(tx.hash, tx.status === "success");
    });
});

txData.loadContractTxs("smile_token");
