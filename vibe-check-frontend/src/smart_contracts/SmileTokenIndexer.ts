import { reactive } from "vue";
import { Erc20Parser, TransactionsStore } from "hyle-js";
import { network } from "../network";

export function getBalances(): { name: string; amount: number }[] {
    return Object.entries(state.balancesSettled).map(([name, amount]) => ({ name, amount }));
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

export const txData = reactive(new TransactionsStore(network));
const state = reactive(new Erc20Parser("smile_token",  {"faucet": 1000000}));

txData.loadBlobTxsLinkedWithContract("smile_token");
txData.addListenerOnContract("smile_token");