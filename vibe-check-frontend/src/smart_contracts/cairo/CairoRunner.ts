// Cairo Wasm
import smileTokenSierra from "./programs/smile-token-sierra.json";
import smileSierra from "./programs/smile-sierra.json";
import runnerInit, { wasm_cairo_run } from "./runner-pkg/cairo_runner";
import proverInit from "./prover-pkg/cairo_verifier";
import JSZip from "jszip";

import { getCairoProverUrl } from "../../network";
import { base64ToUint8Array } from "hyle-js";
import { computeSmileTokenArgs, computeSmileArgs } from "@/smart_contracts/SmartContract";

interface CairoRunOutputs {
    output: string;
    memory: ArrayBuffer;
    trace: ArrayBuffer;
}

var setupSmileToken: Promise<CairoRunOutputs>;
var setupSmile: Promise<CairoRunOutputs>;

onmessage = function (e) {
    if (e.data[0] === "run-smile-token") {
        console.log("ERC20 Worker started");
        // TODO: change argument to only keep id and computedBlob
        setupSmileToken = runSmileToken(computeSmileTokenArgs(e.data[1]));
    } else if (e.data[0] === "prove-smile-token") {
        console.log("Proving ERC20...");
        proveCairoRun(setupSmileToken).then((result) => {
            console.log("ERC20 Worker job done");
            postMessage(result);
        });
    } else if (e.data[0] === "run-smile") {
        console.log("Smile Worker started");
        setupSmile = runSmile(computeSmileArgs(e.data[1]));
        setupSmile.then((result) => postMessage(["smile-ran", result]));
    } else if (e.data[0] === "prove-smile") {
        console.log("Proving Smile...");
        proveCairoRun(setupSmile).then((result) => {
            console.log("Smile Worker job done");
            postMessage(["smile-proof", result]);
        });
    }
};

async function runSmileToken(programInputs: string) {
    await runnerInit();
    await proverInit();

    return wasm_cairo_run(JSON.stringify(smileTokenSierra), programInputs);
}

export async function runSmile(programInputs: string) {
    await runnerInit();
    await proverInit();

    return wasm_cairo_run(JSON.stringify(smileSierra), programInputs);
}

async function proveCairoRun(run: Promise<CairoRunOutputs>) {
    const cairoRunOutputs = await run;
    const form = new FormData();

    const memoryZip = new JSZip();
    memoryZip.file("memory", cairoRunOutputs.memory);
    const memoryZipData = await memoryZip.generateAsync({ type: "blob" });

    const traceZip = new JSZip();
    traceZip.file("trace", new Uint8Array(cairoRunOutputs.trace));
    const traceZipData = await traceZip.generateAsync({ type: "blob" });

    form.append("memory", memoryZipData);
    form.append("trace", traceZipData);
    form.append("output", cairoRunOutputs.output);

    const requestOptions: RequestInit = {
        method: "POST",
        body: form,
    };

    let proveResponse = await fetch(getCairoProverUrl() + "/prove", requestOptions);
    let proof = await proveResponse.text();

    return {
        output: cairoRunOutputs.output,
        proof: base64ToUint8Array(proof),
    };
}
