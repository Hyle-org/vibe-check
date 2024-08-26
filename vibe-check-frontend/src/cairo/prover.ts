import { CairoArgs } from "./CairoHash";

export const proveERC20Transfer = async (args: CairoArgs): Promise<Uint8Array> => {
    const worker = new Worker(new URL("./CairoRunner.ts", import.meta.url), {
        type: "module",
    });
    return await new Promise((resolve, reject) => {
        worker.onerror = (e) => {
            console.error(e);
            worker.terminate();
            reject(e);
        };
        worker.onmessage = (e) => {
            resolve(e.data.proof);
            worker.terminate();
        };
        worker.postMessage(["run-erc20", args]);
        worker.postMessage(["prove-erc20"]);
    });
};

// export const runSmile = async (args: CairoSmileArgs): Promise<string> => {
//     const worker = new Worker(new URL("./CairoRunner.ts", import.meta.url), {
//         type: "module",
//     });
//     return await new Promise((resolve, reject) => {
//         worker.onerror = (e) => {
//             console.error(e);
//             worker.terminate();
//             reject(e);
//         };
//         worker.onmessage = (e) => {
//             if (e.data[0] === "smile-ran") {
//                 resolve(e.data[1].output);
//             }
//             worker.terminate();
//         };
//         worker.postMessage(["run-smile", args]);
//     });
// };

// export const proveSmile = async (args: CairoSmileArgs): Promise<Uint8Array> => {
//     const worker = new Worker(new URL("./CairoRunner.ts", import.meta.url), {
//         type: "module",
//     });
//     return await new Promise((resolve, reject) => {
//         worker.onerror = (e) => {
//             console.error(e);
//             worker.terminate();
//             reject(e);
//         };
//         worker.onmessage = (e) => {
//             if (e.data[0] === "smile-proof") {
//                 resolve(e.data[1].proof);
//                 worker.terminate();
//             }
//         };
//         worker.postMessage(["run-smile", args]);
//         worker.postMessage(["prove-smile"]);
//     });
// };
