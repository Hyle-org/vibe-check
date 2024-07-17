import { broadcastTx, ensureContractsRegistered, setupCosmos } from "../src/cosmos";
import { proveERC20Transfer } from "../src/prover";
import * as fs from "fs";

const cosmos = setupCosmos("http://localhost:26657");

async function checkDigest() {
    const checkExists = await fetch("http://localhost:1317/hyle/zktx/v1/contract/smile_token");
    console.log("state digest is now", (await checkExists.json()).contract.state_digest);
}

let data;
try {
    if (true) throw new Error("Force catch");
    data = new Uint8Array(fs.readFileSync("proof.json", "utf-8").split(","));
} catch (e) {
    data = await proveERC20Transfer({
        balances: [
            {
                name: "faucet",
                amount: 1000000,
            },
        ],
        amount: 1,
        from: "faucet",
        to: "bryan.ecdsa_secp256r1",
    });

    console.log("Proof generated:");

    fs.writeFileSync("proof.json", data);
}

await cosmos;
await ensureContractsRegistered();

await checkDigest();

await new Promise((resolve) => setTimeout(resolve, 1000));
console.log("Ready for broadcast.", data.length);

console.log(await broadcastTx("", "", data));

await checkDigest();

// Bonus TX
if (true) {
    data = await proveERC20Transfer({
        balances: [
            {
                name: "faucet",
                amount: 999999,
            },
            {
                name: "bryan.ecdsa_secp256r1",
                amount: 1,
            },
        ],
        amount: 1000,
        from: "faucet",
        to: "jenny.ecdsa_secp256r1",
    });

    console.log("Ready for broadcast.");
    console.log(await broadcastTx("", "", data));

    await checkDigest();
}
