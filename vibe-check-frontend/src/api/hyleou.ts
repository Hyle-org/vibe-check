
export module HyleouApi {
    export const transactionDetails = (txId: string) => `https://hyleou.hyle.eu/transaction/${encodeURI(txId)}`;
}