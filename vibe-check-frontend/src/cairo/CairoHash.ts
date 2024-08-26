import { ec } from "starknet";

export type ByteArray = string;
export type CairoArgs = {
    balances: { name: ByteArray; amount: number }[];
    amount: number;
    from: ByteArray;
    to: ByteArray;
    // Recalculated: hash: string;
};

export type CairoSmileArgs = {
    identity: string;
    image: number[];
};

export function serByteArray(arr: ByteArray): string {
    // Get quotient of euclidian division
    const pending_word = (arr.length / 31) >> 0;
    let words = [];
    for (let i = 0; i < pending_word; i += 1) {
        // Take each letter, encode as hex
        words.push(
            BigInt(
                "0x" +
                    arr
                        .slice(0, 31)
                        .split("")
                        .map((x) => x.charCodeAt(0).toString(16))
                        .join(""),
            ).toString(),
        );
        arr = arr.substring(31);
    }
    // Add the rest of arr to words
    const pending_word_len = arr.length;
    words.push(
        BigInt(
            "0x" +
                arr
                    .split("")
                    .map((x) => x.charCodeAt(0).toString(16))
                    .join(""),
        ).toString(),
    );

    return `${pending_word} ${words.join(" ")} ${pending_word_len}`;
}

export function hashBalance(balances: { name: ByteArray; amount: number }[]): string {
    const serializedBalances = balances.map((x) => `${serByteArray(x.name)} ${x.amount}`).join(" ").split(" ")

    return BigInt([
        "0",
        String(balances.length),
         ...serializedBalances,
          String(serializedBalances.length + 1)
        ].reduce((acc, x) => ec.starkCurve.pedersen(acc, BigInt(x)))).toString();
}
