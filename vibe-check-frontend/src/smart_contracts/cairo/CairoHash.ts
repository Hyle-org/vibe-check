import { ec } from "starknet";
import { ByteArray, serByteArray } from "hyle-js";

export function hashBalance(balances: { name: ByteArray; amount: number }[]): string {
    const serializedBalances = balances
        .map((x) => `${serByteArray(x.name)} ${x.amount}`)
        .join(" ")
        .split(" ");

    return BigInt(
        ["0", String(balances.length), ...serializedBalances, String(serializedBalances.length + 1)].reduce((acc, x) =>
            ec.starkCurve.pedersen(acc, BigInt(x)),
        ),
    ).toString();
}
