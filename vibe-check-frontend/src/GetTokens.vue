<script setup lang="ts">
import * as faceApi from "face-api.js";
import { computed, nextTick, onMounted, ref, watch, watchEffect } from "vue";
import { needWebAuthnCredentials, registerWebAuthnIfNeeded, signChallengeWithWebAuthn, getWebAuthnIdentity } from "./webauthn";
import { proveERC20Transfer } from "./cairo/prover";
import { proveECDSA } from "./noir/prover";
import { setupCosmos, broadcastProofTx, checkTxStatuses, ensureContractsRegistered, broadcastPayloadTx, checkTxStatus } from "./cosmos";
import { getBalances } from "./SmileTokenIndexer";

import extLink from "./assets/external-link-svgrepo-com.vue";
import { getNetworkRpcUrl } from "./network";
import LeaderBoard from "./LeaderBoard.vue";
import Socials from "./components/Socials.vue";

import { HyleouApi } from "./api/hyleou";
import { computeErc20Payload, computeSmilePayload } from "./cairo/CairoRunner";
import { CairoArgs, CairoSmileArgs } from "./cairo/CairoHash";
import { uint8ArrayToBase64 } from "./utils";
import { DeliverTxResponse } from "@cosmjs/stargate";

// These are references to HTML elements
const canvasOutput = ref<HTMLCanvasElement | null>(null);
const videoFeed = ref<HTMLVideoElement | null>(null);
const screenshotOutput = ref<HTMLCanvasElement | null>(null);

// Inner state of the screenshotting logic
const screenshotData = ref<ImageBitmap | null>(null);
const detectionTimer = ref<unknown | null>(null);
const lastDetections = ref<faceApi.FaceDetection[]>([]);

const hasDetection = computed(() => lastDetections.value.length > 0);

const vibeCheckStatus = ref<"failed_vibe" | "success_vibe" | null>(null);
var grayScale: Float32Array;

const ecdsaPromiseDone = ref<boolean>(false);
const smilePromiseDone = ref<boolean>(false);
const erc20PromiseDone = ref<boolean>(false);

// General state machine state
const status = ref<string>("start");
const screen = ref<string>("start");
const error = ref<string | null>(null);
const identityRef = ref<string>();
const txHash = ref<string | null>(null);
const payloadsTxHash = ref<string | null>(null);


let erc20Args: CairoArgs;
let smileArgs: CairoSmileArgs;
let webAuthnValues: Record<string, any>;
let payloadResp: DeliverTxResponse;

// Match screen to status
watchEffect(() => {
    const statusToScreen = {
        start: "start",
        "pre-authenticating": "start",
        authenticating: "start",
        failed_authentication: "start",

        authenticated: "camera",
        camera_playing: "camera",
        failed_camera: "camera",

        screenshotting: "camera",
        processing: "screenshot", // This is the "zoom" step.

        checking_vibe: "screenshot",
        failed_vibe: "screenshot",
        success_vibe: "screenshot",

        payload: "payload",
        checking_payload_tx: "payload",
        failed_at_payload: "payload",
        payload_tx_success: "payload",
        payload_tx_failure: "payload",

        proving: "proving",
        checking_tx: "proving",
        failed_at_proving: "proving",
        tx_success: "proving",
        tx_failure: "proving",
    } as any;
    if (statusToScreen[status.value] !== screen.value)
        screen.value = statusToScreen[status.value];
});

onMounted(async () => {
    // For some reason this fails if done too early
    await faceApi.nets.tinyFaceDetector.loadFromUri("/models");
    await setupCosmos(getNetworkRpcUrl());
    await ensureContractsRegistered();
    identityRef.value = getWebAuthnIdentity();
});

const doWebAuthn = async () => {
    status.value = "pre-authenticating";
    if (needWebAuthnCredentials()) {
        // Wait 2s
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status.value = "authenticating";
        try {
            await registerWebAuthnIfNeeded();
            identityRef.value = getWebAuthnIdentity();
            status.value = "authenticated";
        } catch (e) {
            console.error(e);
            error.value = `${e}`;
            status.value = "failed_authentication";
        }
    } else {
        status.value = "authenticated";
    }

    await activateCamera();
}

const activateCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        await nextTick();
        videoFeed.value!.srcObject = stream;
        videoFeed.value!.play();
        nextTick(() => status.value = "camera_playing");
        detectionTimer.value = setInterval(async () => {
            const displaySize = { width: videoFeed.value!.clientWidth, height: videoFeed.value!.clientHeight }
            faceApi.matchDimensions(canvasOutput.value!, displaySize)
            lastDetections.value = await faceApi.detectAllFaces(videoFeed.value!, new faceApi.TinyFaceDetectorOptions())
            // We shall only process detection if at least one face has been detected
            if (lastDetections.value.length > 0) {
                var score = lastDetections.value[0].score.toFixed(2);
                var resizedDetections = faceApi.resizeResults(lastDetections.value, displaySize)

                var canvas = canvasOutput.value!;
                var context = canvas.getContext("2d")!;

                const box = {
                    x: resizedDetections[0].box.left,
                    y: resizedDetections[0].box.top,
                    width: resizedDetections[0].box.width,
                    height: resizedDetections[0].box.height,
                };
                faceApi.draw.drawDetections(canvas, box);
                context.scale(-1, 1);
                context.fillStyle = "blue";
                context.font = "bold 16px Arial";
                context.fillText(score, - canvas.width * 0.1, canvas.height * 0.1);
            }
        }, 1000);
    } catch (e) {
        console.error(e);
        error.value = `${e}`;
        status.value = "failed_camera";
    };
}

const takeScreenshot = async () => {
    clearInterval(detectionTimer.value as number);
    status.value = "screenshotting";
    const canvas = screenshotOutput.value!;
    canvas.width = videoFeed.value!.videoWidth;
    canvas.height = videoFeed.value!.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.drawImage(videoFeed.value!, 0, 0, canvas.width, canvas.height);
        screenshotData.value = await createImageBitmap(canvas);

        const displaySize = { width: canvas.width, height: canvas.height }
        const resizedDetections = faceApi.resizeResults(lastDetections.value, displaySize)
        faceApi.draw.drawDetections(canvas, resizedDetections);
        (videoFeed.value!.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        status.value = "processing";

        const zoomingPromise = zoomInOnBox(canvas, screenshotData.value!, resizedDetections[0].box.x, resizedDetections[0].box.y, resizedDetections[0].box.width, resizedDetections[0].box.height);
        checkVibe(screenshotData.value!, zoomingPromise, resizedDetections[0].box.x, resizedDetections[0].box.y, resizedDetections[0].box.width, resizedDetections[0].box.height);

        await zoomingPromise;
    }
};

const zoomInOnBox = async (canvas: HTMLCanvasElement, img: ImageBitmap, x: number, y: number, width: number, height: number) => {
    await new Promise((resolve) => {
        const steps = 5;
        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep >= steps + 1) {
                clearInterval(interval);
                resolve(null);
                return;
            }

            const newWidth = canvas.width * (1 - currentStep / steps) + width * (currentStep / steps);
            const newHeight = canvas.height * (1 - currentStep / steps) + height * (currentStep / steps);
            const newX = x * (currentStep / steps);
            const newY = y * (currentStep / steps);

            const ctx = canvas.getContext("2d")!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, newX, newY, newWidth, newHeight, 0, 0, canvas.width, canvas.height);

            currentStep++;
        }, 400);
    });
}

const checkVibe = async (image: ImageBitmap, zoomingPromise: Promise<any>, x: number, y: number, width: number, height: number) => {
    vibeCheckStatus.value = null;
    status.value = "checking_vibe";

    console.log("Face detection coordinates:", { x, y, width, height });

    const small = document.createElement("canvas");
    const smallCtx = small.getContext("2d")!;
    small.width = 48;
    small.height = 48;

    // Draw the entire face detection area
    smallCtx.drawImage(image, x, y, width, height, 0, 0, 48, 48);
    
    const imageData = smallCtx.getImageData(0, 0, 48, 48);
    const processedData = new Float32Array(48 * 48);

    // Apply Gaussian blur to reduce noise
    const blurredData = new Float32Array(48 * 48);
    const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ]; // Gaussian kernel for better blurring

    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
            let sum = 0;
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < 48 && ny >= 0 && ny < 48) {
                        const idx = (ny * 48 + nx) * 4;
                        const pixelValue = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;
                        sum += pixelValue * kernel[dy + 1][dx + 1]; // Apply kernel weight
                        count += kernel[dy + 1][dx + 1];
                    }
                }
            }
            blurredData[y * 48 + x] = sum / count; // Average for blur
        }
    }

    // Adaptive thresholding
    const blockSize = 5; // Increased block size for better averaging
    const C = 5; // Increased constant to reduce false positives

    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
            let sum = 0;
            let count = 0;
            for (let dy = -blockSize; dy <= blockSize; dy++) {
                for (let dx = -blockSize; dx <= blockSize; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < 48 && ny >= 0 && ny < 48) {
                        sum += blurredData[ny * 48 + nx];
                        count++;
                    }
                }
            }
            const threshold = sum / count - C;
            const pixelValue = blurredData[y * 48 + x];
            processedData[y * 48 + x] = pixelValue < threshold ? 1 : 0;
        }
    }

    // Focus on the mouth and lip region
    const mouthRegion = new Float32Array(48 * 48);
    const mouthY = Math.floor(height * 0.55); // Adjusted for better mouth detection
    const mouthHeight = Math.floor(height * 0.3); // Increased height of the mouth region

    for (let y = mouthY; y < mouthY + mouthHeight; y++) {
        for (let x = 0; x < 48; x++) {
            const index = y * 48 + x;
            if (index < mouthRegion.length) {
                mouthRegion[index] = processedData[index]; // Copy the processed data for the mouth region
            }
        }
    }

    // Morphological opening to reduce black spots
    const openedData = new Float32Array(48 * 48);
    for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
            if (mouthRegion[y * 48 + x] === 1) {
                openedData[y * 48 + x] = 1; // Keep the pixel
            } else {
                // Check surrounding pixels
                let isSurrounded = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < 48 && ny >= 0 && ny < 48 && mouthRegion[ny * 48 + nx] === 1) {
                            isSurrounded = true;
                        }
                    }
                }
                if (isSurrounded) {
                    openedData[y * 48 + x] = 0.5; // Lighten the pixel
                }
            }
        }
    }

    // Combine mouth and lip regions for final processing
    const lipRegion = new Float32Array(48 * 48);
    const lipY = Math.floor(height * 0.65); // Adjusted for better lip detection
    const lipHeight = Math.floor(height * 0.1); // Height of the lip region

    for (let y = lipY; y < lipY + lipHeight; y++) {
        for (let x = 0; x < 48; x++) {
            const index = y * 48 + x;
            if (index < lipRegion.length) {
                lipRegion[index] = processedData[index]; // Copy the processed data for the lip region
            }
        }
    }

    // Ensure lips are included in the processed data
    for (let i = 0; i < 48 * 48; i++) {
        if (lipRegion[i] === 1) {
            processedData[i] = 1; // Ensure lips are included in the processed data
        }
    }
   
    // Visualize the processed image
    // appendFloatArrayAsImage(processedData, "Processed Image"); // Debug

    try {
        const result = await callTeeApi(Array.from(processedData));
        console.log("TEE Result:", result);
        await zoomingPromise;

        if (result.prediction[0] === 1) {
            vibeCheckStatus.value = "success_vibe";
            status.value = "success_vibe";
        } else {
            vibeCheckStatus.value = "failed_vibe";
            status.value = "failed_vibe";
        }
    } catch (error) {
        console.error("Error calling TEE API:", error);
        status.value = "failed_vibe";
    }
}

// Update the appendFloatArrayAsImage function to handle grayscale values
const appendFloatArrayAsImage = (floatArray: number[], label: string) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = 48;
    canvas.height = 48;
    const imageData = ctx.createImageData(48, 48);

    for (let i = 0; i < floatArray.length; i++) {
        const value = Math.round((1 - floatArray[i]) * 255); // Invert and scale to 0-255
        imageData.data[i * 4] = value;
        imageData.data[i * 4 + 1] = value;
        imageData.data[i * 4 + 2] = value;
        imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    
    const container = document.createElement("div");
    container.style.display = "inline-block";
    container.style.margin = "10px";
    container.appendChild(canvas);
    
    const labelElement = document.createElement("p");
    labelElement.textContent = label;
    container.appendChild(labelElement);
    
    document.body.appendChild(container);
}

const retryScreenshot = () => {
    screenshotData.value = null;
    lastDetections.value = [];
    vibeCheckStatus.value = null;

    status.value = "authenticated";
    activateCamera();
}

const signAndSendPayloadTx = async () => {
    status.value = "payload";
    let identity: string;
    if (identityRef.value) {
        identity = identityRef.value;
    } else {
        identityRef.value = getWebAuthnIdentity();
        identity = identityRef.value;
    }

    try {
        const challenge = Uint8Array.from("0123456789abcdef0123456789abcdef", c => c.charCodeAt(0));
        webAuthnValues = await signChallengeWithWebAuthn(challenge);
        webAuthnValues.identity = identity;

        // Start locally proving that we are who we claim to be by signing the transaction hash
        // Send the proof of smile to Giza or something
        smileArgs = {
            identity: identity,
            image: [...grayScale]
        };
        const smilePayload = computeSmilePayload(smileArgs);

        // Locally or backend prove an erc20 transfer
        erc20Args = {
            balances: getBalances(),
            from: "faucet",
            to: identity,
            amount: 100,
        };
        const erc20Payload = computeErc20Payload(erc20Args);

        await new Promise((resolve, reject) => {
            const ok = window.confirm("Because of WASM limitations, Vibe Check isn't able to generate proofs client-side for Giza. Your image will be sent to Hylé. If you're not OK with that, ask a friend to smile instead !");
            if (ok) {
                resolve(null);
            } else {
                reject("User didn't want to send the image to Hylé");
            }
        });

        // Send the transaction
        payloadResp = await broadcastPayloadTx(
            identity,
            window.btoa(JSON.stringify(webAuthnValues)), // ATM we don't process noir payload. This value will change.
            window.btoa(smilePayload),
            window.btoa(erc20Payload),
        );

        console.log("PayloadTx: ", payloadResp.transactionHash)

        // Switch to waiter view
        status.value = "checking_payload_tx";

        // Wait a bit and assume TX will be processed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check the status of the TX
        const txStatus = await checkTxStatus(payloadResp.transactionHash);
        if (txStatus.status === "success") {
            status.value = "payload_tx_success";
            txHash.value = payloadResp.transactionHash;
        } else {
            status.value = "payload_tx_failure";
            error.value = txStatus.error || "Unknown error";
        }
    } catch (e) {
        console.error(e);
        error.value = `${e}`;
        status.value = "failed_at_payload";
    }
}

const callTeeApi = async (grayscaleImage: number[]): Promise<any> => {
    const url = `/api/prediction`; // Use the proxy path

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: grayscaleImage,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error occurred: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error calling TEE API:', error);
        throw error; // Re-throw the error for further handling if needed
    }
};

const ProveAndSendProofsTx = async () => {
    ecdsaPromiseDone.value = false;
    smilePromiseDone.value = false;
    erc20PromiseDone.value = false;
    status.value = "proving";
    try {
        const ecdsaPromise = proveECDSA(webAuthnValues);
        const erc20Promise = proveERC20Transfer(erc20Args);
        // const smilePromise = proveSmile(smileArgs);

        ecdsaPromise.then(() => ecdsaPromiseDone.value = true);
        erc20Promise.then(() => erc20PromiseDone.value = true);
        // smilePromise.then(() => smilePromiseDone.value = true);

        // Send the proofs transactions
        const ecdsaResp = await broadcastProofTx(
            payloadResp.transactionHash,
            0,
            "ecdsa_secp256r1",
            window.btoa(await ecdsaPromise)
        );
        const erc20Resp = await broadcastProofTx(
            payloadResp.transactionHash,
            1,
            "smile_token",
            uint8ArrayToBase64(await erc20Promise)
        );
        // const smileResp = await broadcastProofTx(
        //     payloadResp.transactionHash,
        //     2,
        //     "smile",
        //     uint8ArrayToBase64(await smilePromise)
        // );
        console.log("ecdsaProofTx: ", ecdsaResp.transactionHash)
        console.log("erc20ProofTx: ", erc20Resp.transactionHash)
        // console.log("smileProofTx: ", smileResp.transactionHash)
        // Switch to waiter view
        status.value = "checking_tx";

        // Wait a bit and assume TX will be processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check the status of the TX
        const txStatus = await checkTxStatuses([
            ecdsaResp.transactionHash,
            erc20Resp.transactionHash,
            // smileResp.transactionHash,
        ]);
        if (txStatus.status === "success") {
            status.value = "tx_success";
            txHash.value = erc20Resp.transactionHash;
        } else {
            status.value = "tx_failure";
            error.value = txStatus.error || "Unknown error";
        }
    } catch (e) {
        console.error(e);
        error.value = `${e}`;
        status.value = "failed_at_proving";
    }
}

const vTriggerScroll = {
    mounted(el: HTMLDivElement) {
        const maxHeight = el.parentElement!.clientHeight;
        const targetHeight = el.clientHeight;
        document.body.style.setProperty("--max-height", `${maxHeight}px`);
        document.body.style.setProperty("--target-height", `${targetHeight}px`);
    }
}
</script>

<template>
    <div class="container m-auto">
        <Socials />
        <hr />
        <h1 class="text-center my-4">Vibe Check</h1>
        <hr />
        <div class="text-center my-4 explainer">
            <p class="my-4">Vibe Check is a teeML & WebAuthn Powered zkApp asserting a user has smiled and awarding test
                tokens on Hylé!</p>
            <p class="my-4 smaller">This is a test project! Don't take it too seriously. Code can be found on our <a
                    href="https://github.com/Hyle-org/vibe-check">github</a></p>
        </div>
        <template v-if="screen == 'start'">
            <div class="flex flex-col justify-center h-[400px] max-h-[50vh] max-w-[50rem] m-auto img-background p-10">
                <div v-if="status === 'pre-authenticating' || status === 'authenticating'"
                    class="p-10 bg-black bg-opacity-70 rounded-xl">
                    <p class="text-center font-semibold font-anton mb-2">Authenticating via WebAuthn</p>
                    <p class="text-center">You will be asked to create a secure account<br />
                        using the secure enclave contained within your device.</p>
                    <i class="!mt-4 !m-auto !block spinner"></i>
                </div>
                <div v-else-if="status === 'failed_authentication'" class="p-10 bg-black bg-opacity-70 rounded-xl">
                    <p class="text-center font-semibold font-anton mb-2">There was an error authenticating</p>
                    <p class="text-center text-sm font-mono">{{ error }}</p>
                </div>
            </div>
            <div class="flex justify-center my-8">
                <button @click="doWebAuthn" :disabled="status !== 'start' && status !== 'failed_authentication'">
                    Smile & get tokens
                </button>
            </div>
            <div class="text-center my-4 explainer">
                <p class="smaller">Proofs are generated using <a href=https://noir-lang.org>Noir</a>, <a
                        href="https://www.cairo-lang.org">Cairo</a> and <a href="https://www.gizatech.xyz">Giza</a>.</p>
            </div>
        </template>
        <template v-else>
            <!-- This case covers all of them because of the screenshotOutput canvas ref, which needs to have long enough lifetime -->
            <div v-if="screen === 'camera'">
                <div v-show="status === 'authenticated' || status === 'failed_camera'"
                    class="flex flex-col justify-center h-[400px] max-h-[50vh] max-w-[50rem] m-auto img-background p-10">
                    <div v-if="status === 'authenticated'">
                        <i class="!mt-4 !m-auto !block spinner"></i>
                    </div>
                    <div v-if="status === 'failed_camera'" class="p-10 bg-black bg-opacity-70 rounded-xl">
                        <p class="text-center font-semibold font-anton mb-2">Camera couldn't be played</p>
                        <p class="text-center text-sm font-mono">{{ error }}</p>
                    </div>
                </div>
                <div v-show="status !== 'authenticated' && status !== 'failed_camera'" class="flex justify-center">
                    <div class="rounded overflow-hidden mirror relative">
                        <video ref="videoFeed" autoplay playsinline muted class="w-full"></video>
                        <canvas class="absolute top-0" ref="canvasOutput"></canvas>
                    </div>
                </div>
                <div class="flex justify-center my-8">
                    <button @click="takeScreenshot" :disabled="status !== 'camera_playing' || !hasDetection">Get
                        Tokens</button>
                </div>
            </div>
            <div v-show="screen !== 'camera'"> <!-- screenshotOutput is also why I'm using show and not if -->
                <div class="relative flex justify-center">
                    <canvas :class="`mirror rounded overflow-hidden ${vibeCheckStatus}`"
                        ref="screenshotOutput"></canvas>
                    <div class="absolute top-0 w-full h-full flex justify-center items-center">
                        <p v-if="status === 'checking_vibe'" class="text-white font-semibold">
                            ...Checking your vibe...
                        </p>
                        <p v-else-if="status === 'failed_vibe'" class="text-white font-semibold">
                            Vibe check failed. You are not vibing.
                        </p>
                        <p v-else-if="status === 'success_vibe'" class="text-white font-semibold">
                            Vibe check passed. You are vibing.
                        </p>
                        <div v-else-if="screen === 'payload' && status !== 'failed_at_payload'"
                            class="text-white p-8 bg-black bg-opacity-50 rounded-xl overflow-hidden">
                            <div :class="`relative scrollOnSuccess ${status}`">
                                <div v-if="status === 'payload'" class="flex flex-col justify-center items-center my-8">
                                    <i class="spinner"></i>
                                    <p class="italic">...Sending transaction...</p>
                                </div>
                                <div v-if="status === 'checking_payload_tx'"
                                    class="flex flex-col justify-center items-center my-8">
                                    <i class="spinner"></i>
                                    <p class="italic">...TX sent, checking status...</p>
                                </div>
                                <div v-if="status === 'payload_tx_success'"
                                    class="flex flex-col justify-center items-center py-16" v-trigger-scroll>
                                    <p class="text-center font-semibold font-anton uppercase mb-2">Transaction sent</p>
                                    <p class="text-center text-sm font-mono">Once your TX is proven, you will earn 100
                                        tokens on Hylé devnet.</p>
                                    <p class="text-center text-sm font-mono my-4">Check it out on
                                        <a :href="HyleouApi.transactionDetails(payloadsTxHash!)">
                                            <extLink class="h-4 w-auto inline-block pr-1" />Hyléou
                                        </a><br>or tweet about it
                                        !
                                    </p>
                                    <p class="text-center text-sm font-mono my-4">Anyone can generate proofs of your
                                        transaction, but you can also do it yourself:
                                    </p>
                                    <button class="my-2" @click="ProveAndSendProofsTx">Prove remotely (no privacy)
                                    </button>
                                    <button disabled>Prove locally (unavailable for now)</button>
                                </div>
                                <div v-if="status === 'payload_tx_failure'"
                                    class="flex flex-col justify-center items-center my-8">
                                    <p class="text-center font-semibold font-anton uppercase mb-2">TX failed</p>
                                    <p class="text-center text-sm font-mono">{{ error }}</p>
                                </div>
                            </div>
                        </div>
                        <div v-else-if="status === 'failed_at_payload'"
                            class="text-white p-10 bg-black bg-opacity-50 rounded-xl flex flex-col gap-2">
                            <p class="text-center font-semibold font-anton uppercase mb-2">An error occured</p>
                            <p class="text-center text-sm font-mono">{{ error }}</p>
                        </div>
                        <div v-else-if="screen === 'proving' && status !== 'failed_at_proving'"
                            class="text-white p-8 bg-black bg-opacity-50 rounded-xl overflow-hidden">
                            <div :class="`relative scrollOnSuccess ${status}`">
                                <div class="flex flex-col gap-2">
                                    <p class="flex items-center">Generating ECDSA signature proof:
                                        <i v-if="!ecdsaPromiseDone" class="spinner"></i>
                                        <span v-else>✅</span><br>
                                        <span class="text-sm mt-1 text-opacity-80 italic">(This is actually done
                                            client-side so it takes a while)</span>
                                    </p>
                                    <p class="flex items-center">Generating proof of smile: <i v-if="!smilePromiseDone"
                                            class="spinner"></i><span v-else>✅</span></p>
                                    <p class="flex items-center">Generating ERC20 claim proof: <i
                                            v-if="!erc20PromiseDone" class="spinner"></i><span v-else>✅</span></p>
                                    <p class="flex items-center gap-1">Sending Proofs: <i v-if="status === 'proving'"
                                            class="spinner"></i><span v-else>✅</span></p>
                                    <div v-if="status === 'checking_tx'"
                                        class="flex flex-col justify-center items-center my-8">
                                        <i class="spinner"></i>
                                        <p class="italic">...TX sent, checking status...</p>
                                    </div>
                                </div>
                                <div v-if="status === 'tx_success'"
                                    class="flex flex-col justify-center items-center py-16" v-trigger-scroll>
                                    <p class="text-center font-semibold font-anton uppercase mb-2">TX successful</p>
                                    <p class="text-center text-sm font-mono">You've earned 100 devnet Hylé. Good vibes!
                                    </p>
                                    <p class="text-center text-sm font-mono my-4">Check it out on
                                        <a :href="HyleouApi.transactionDetails(txHash!)">
                                            <extLink class="h-4 w-auto inline-block pr-1" />Hyléou
                                        </a><br>or tweet about it
                                        !
                                    </p>
                                </div>
                                <div v-if="status === 'tx_failure'"
                                    class="flex flex-col justify-center items-center my-8">
                                    <p class="text-center font-semibold font-anton uppercase mb-2">TX failed</p>
                                    <p class="text-center text-sm font-mono">{{ error }}</p>
                                </div>
                            </div>
                        </div>
                        <div v-else-if="status === 'failed_at_proving'"
                            class="text-white p-10 bg-black bg-opacity-50 rounded-xl flex flex-col gap-2">
                            <p class="text-center font-semibold font-anton uppercase mb-2">An error occured</p>
                            <p class="text-center text-sm font-mono">{{ error }}</p>
                        </div>
                    </div>
                </div>
                <div class="flex justify-center my-8 gap-4">
                    <button @click="signAndSendPayloadTx"
                        :disabled="status !== 'failed_vibe' && status !== 'success_vibe' && status !== 'failed_at_proving' && status !== 'failed_at_payload'">Send
                        TX</button>
                    <button @click="retryScreenshot" v-if="status === 'failed_vibe'">Retry</button>
                </div>
            </div>
        </template>

        <LeaderBoard :identity="identityRef" />
    </div>

</template>


<style scoped>
.explainer {
    margin: 2.5em;
}

.explainer>p {
    font-family: Anton, sans-serif;
}

.explainer>p.smaller {
    font-size: 1em;
}

.img-background {
    background-image: url("./assets/image_satellite.jpg");
    background-size: cover;
    background-position: center;
}

.mirror {
    /* Mirror it so people look normal */
    -webkit-transform: scaleX(-1);
    transform: scaleX(-1);
}

/* Slowly animate towards red and very high contrast*/
canvas.failed_vibe {
    @apply animate-[fail_3s_forwards];
}

canvas.success_vibe {}

@keyframes fail {
    0% {
        filter: contrast(100%) grayscale(0%);
    }

    100% {
        filter: contrast(250%) grayscale(100%);
    }
}

.scrollOnSuccess.tx_success {
    bottom: 0px;
    max-height: 500px;
    animation: scrollOnSuccess 3s ease-in-out 2s forwards;
}

.scrollOnSuccess.tx_success div:first-child {
    position: relative;
    animation: scrollOnSuccess 3s ease-in-out 2s forwards;
}

@keyframes scrollOnSuccess {
    0% {
        bottom: 0px;
        max-height: var(--max-height);
    }

    100% {
        bottom: calc(var(--max-height) - var(--target-height));
        max-height: var(--target-height);
    }
}
</style>
