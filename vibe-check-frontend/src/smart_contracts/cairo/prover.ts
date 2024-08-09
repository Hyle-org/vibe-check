import { CairoArgs, CairoSmileArgs } from "@/smart_contracts/SmartContract";

function viaWorker(
    file: string,
    generator: (worker: Worker, resolve: (value: Uint8Array) => void) => void,
): Promise<any> {
    const worker = new Worker(new URL(file, import.meta.url), {
        type: "module",
    });
    return new Promise((resolve, reject) => {
        worker.onerror = (e) => {
            console.error(e);
            worker.terminate();
            reject(e);
        };
        generator(worker, resolve);
    });
}

export const proveERC20Transfer = (args: CairoArgs): Promise<Uint8Array> => {
    return viaWorker("./CairoRunner.ts", (worker, resolve) => {
        worker.onmessage = (e) => {
            resolve(e.data.proof);
            worker.terminate();
        };
        worker.postMessage(["run-erc20", args]);
        worker.postMessage(["prove-erc20"]);
    });
};

export const runSmile = (args: CairoSmileArgs): Promise<string> => {
    return viaWorker("./CairoRunner.ts", (worker, resolve) => {
        worker.onmessage = (e) => {
            resolve(e.data[1].output);
            worker.terminate();
        };
        worker.postMessage(["run-smile", args]);
    });
};

export const proveSmile = (args: CairoSmileArgs): Promise<Uint8Array> => {
    return viaWorker("./CairoRunner.ts", (worker, resolve) => {
        worker.onmessage = (e) => {
            if (e.data[0] === "smile-proof") {
                resolve(e.data[1].proof);
                worker.terminate();
            }
        };
        worker.postMessage(["run-smile", args]);
        worker.postMessage(["prove-smile"]);
    });
};
