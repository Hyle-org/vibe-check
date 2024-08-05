import { reactive, ref, watchEffect } from "vue";

export function getBalances(): { name: string; amount: number }[] {
    return Object.entries(state.value.balancesSettled).map(([name, amount]) => ({ name, amount }));
}

export type BalanceChange = {
    from: string;
    to: string;
    value: number;
};

import { Erc20Parser, TransactionData } from "hyle-js";
import { network } from "./network";

const txData = reactive(new TransactionData());
const state = ref(new Erc20Parser("smile_token"));

watchEffect(() => {
    state.value = reactive(new Erc20Parser("smile_token"));
    state.value.balancesSettled["faucet"] = 1000000;
    const transactions = Object.values(txData.transactionData).filter((tx) => tx.contracts?.includes("smile_token"));
    transactions.sort((a, b) => a.height - b.height + a.index - b.index);
    transactions.forEach((tx) => {
        if (!tx.type) {
            txData.loadTransactionData(tx.hash); // inefficient if we do this many times.
            return;
        }
        state.value.consumeTx(tx);
        if (tx.status !== "sequenced") state.value.settleTx(tx.hash, tx.status === "success");
    });
});

txData.loadContractTxs(network, "smile_token");
