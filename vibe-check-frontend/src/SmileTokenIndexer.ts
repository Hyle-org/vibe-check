import { ref, watchEffect } from "vue";
import { GetAllStateChanges } from "./indexer";

export const SmileTokenBalances = ref({} as Record<string, number>);

export function getBalances(): { name: string; amount: number }[] {
    return Object.entries(SmileTokenBalances.value).map(([name, amount]) => ({ name, amount }));
}

const state_changes = GetAllStateChanges();

export type BalanceChange = {
    from: string;
    to: string;
    value: number;
};

watchEffect(async () => {
    const changes: BalanceChange[] = state_changes.value
    .map((transaction) => {
        const transactionStateChange = transaction.messages.stateChanges
        .filter((stateChange) => stateChange.contractName == "smile_token")
        .map((stateChange) => GetErc20Output(stateChange.proof));
        // There can only be one state change for one contract
        return transactionStateChange[0]
    });
    SmileTokenBalances.value = processChanges(changes);
});

// Compute the current state
function processChanges(changes: BalanceChange[]) {
    const newBalances = {} as Record<string, number>;
    newBalances["faucet"] = 1000000;
    changes.forEach((change) => {
        newBalances[change.from] -= change.value;
        if (newBalances[change.to]) newBalances[change.to] += change.value;
        else newBalances[change.to] = change.value;
    });
    return newBalances;
}

const GetErc20Output = (rawProof: Uint8Array): BalanceChange => {
    const proof = new DataView(rawProof.buffer, rawProof.byteOffset, rawProof.byteLength);
    const proofSize = proof.getUint32(0, true);
    const inputsSize = proof.getUint32(proofSize + 4, true);
    const outputs = proof.buffer.slice(proofSize + 8 + inputsSize);
    const hexOutputs = Array.from(new Uint8Array(outputs))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
    // Horrible
    // This corresponds to "0 112568767309172 6" which is the cairo-ByteArray encoding of "faucet"
    const faucetPos = hexOutputs.search("3020313132353638373637333039313732203620");
    const programOutputLength = parseInt(hexOutputs.slice(faucetPos - 2, faucetPos), 16);
    var serializeProgramOutput: any = '';
    for (var i = 0; i < programOutputLength*2; i += 2) {
        // console.log("i=", i, parseInt(hexOutputs.slice(faucetPos + i, faucetPos + i + 2), 16));
        serializeProgramOutput += hex2a(hexOutputs.slice(faucetPos + i, faucetPos + i + 2));
    }
    serializeProgramOutput = serializeProgramOutput.split(" ");

    var [from, serializeProgramOutput] = deserialize_cairo_bytesarray(serializeProgramOutput);
    var [to, serializeProgramOutput] = deserialize_cairo_bytesarray(serializeProgramOutput);
    var amount = parseInt(serializeProgramOutput[0]);

    return {
        from: from as string,
        to: to as string,
        value: amount,
    };
};

const deserialize_cairo_bytesarray = (data: string[]) => {
    // let pending_word = data.shift();
    let pending_word = parseInt(data.splice(0, 1)[0]);
    let word_list = data.splice(0, pending_word + 1);
    let _pending_word_len = parseInt(data.splice(0, 1)[0]);

    let word: string = "";
    for (let i = 0; i < word_list.length; i += 1) {
        word += hex2a(BigInt(word_list[i]).toString(16));
    }
    return [word, data]
}

const hex2a = (hexx: number | string) => {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}