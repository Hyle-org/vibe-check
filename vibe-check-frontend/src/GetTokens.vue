<script setup lang="ts">
import * as faceApi from "face-api.js";
import * as ort from 'onnxruntime-web';
import { computed, nextTick, onMounted, ref, watchEffect } from "vue";
import { needWebAuthnCredentials, registerWebAuthnIfNeeded, signChallengeWithWebAuthn, getWebAuthnIdentity } from "./webauthn";
import { ensureContractsRegistered, broadcastVibeCheckPayload } from "./cosmos";
import { getBalances } from "@/smart_contracts/SmileTokenIndexer";

import { setupCosmos, checkTxStatus } from "hyle-js";

import extLink from "./assets/external-link-svgrepo-com.vue";
import { getNetworkRpcUrl } from "./network";
import LeaderBoard from "./LeaderBoard.vue";
import Socials from "./components/Socials.vue";

import { HyleouApi } from "./api/hyleou";
import type { CairoArgs, CairoSmileArgs, ECDSAArgs } from "@/smart_contracts/SmartContract";
import { DeliverTxResponse } from "@cosmjs/stargate";
import { useProving } from "./smart_contracts/ProveAndBroadcast";

// These are references to HTML elements
const canvasOutput = ref<HTMLCanvasElement | null>(null);
const videoFeed = ref<HTMLVideoElement | null>(null);
const screenshotOutput = ref<HTMLCanvasElement | null>(null);

// Inner state of the screenshotting logic
const screenshotData = ref<ImageBitmap | null>(null);
const detectionTimer = ref<unknown | null>(null);
const lastDetections = ref<faceApi.FaceDetection[]>([]);
const onnxSessionRef = ref<ort.InferenceSession | null>(null);

const hasDetection = computed(() => lastDetections.value.length > 0);

const vibeCheckStatus = ref<"failed_vibe" | "success_vibe" | null>(null);
var grayScale: Float32Array;

// General state machine state
const status = ref("start");
const screen = ref("start");
const error = ref<string | null>(null);
const identityRef = ref("");
const txHash = ref<string | null>(null);

const {
    ecdsaPromiseDone,
    smilePromiseDone,
    erc20PromiseDone,
    proveAndSendProofsTx,
} = useProving(status as any, error, txHash);

let erc20Args: CairoArgs;
let smileArgs: CairoSmileArgs;
let webAuthnValues: ECDSAArgs;
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
    onnxSessionRef.value = await ort.InferenceSession.create('./models/smile.onnx');
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

            // Detect faces
            lastDetections.value = await faceApi.detectAllFaces(videoFeed.value!, new faceApi.TinyFaceDetectorOptions())

            // We shall only process detection if at least one face has been detected
            if (lastDetections.value.length > 0) {
                let resizedDetections = faceApi.resizeResults(lastDetections.value, displaySize)

                let canvas = canvasOutput.value!;
                let context = canvas.getContext("2d")!;

                const box = {
                    x: resizedDetections[0].box.left,
                    y: resizedDetections[0].box.top,
                    width: resizedDetections[0].box.width,
                    height: resizedDetections[0].box.height,
                };

                // Draw detections for the faces
                faceApi.draw.drawDetections(canvas, box);

                // Save image in a temp canvas and apply ML to it
                let canvasML = document.createElement("canvas");
                canvasML.width = videoFeed.value!.videoWidth;
                canvasML.height = videoFeed.value!.videoHeight;
                let contextML = canvasML.getContext("2d")!;
                contextML.drawImage(videoFeed.value!, 0, 0, canvas.width, canvas.height);
                let image = await createImageBitmap(canvasML);
                let score = await getSmileProbability(image, resizedDetections[0].box.x, resizedDetections[0].box.y, resizedDetections[0].box.width, resizedDetections[0].box.height);

                // Apply score to canvas
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

        await zoomInOnBox(canvas, screenshotData.value!, resizedDetections[0].box.x, resizedDetections[0].box.y, resizedDetections[0].box.width, resizedDetections[0].box.height);
        const smilingProbability = await getSmileProbability(screenshotData.value!, resizedDetections[0].box.x, resizedDetections[0].box.y, resizedDetections[0].box.width, resizedDetections[0].box.height);
        checkVibe(smilingProbability);
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

const imageToGrayScale = (image: ImageData): Float32Array => {
    const data = image.data;

    // Create a flattened array for grayscale values
    const grayscaleArray = new Float32Array(image.width * image.height);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        // Convert RGB to grayscale using luminosity method
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const grayscale = 0.21 * r + 0.72 * g + 0.07 * b;

        // Store the grayscale value in the array
        grayscaleArray[j] = grayscale / 255;
    }

    return grayscaleArray;
}

const sigmoid = (x: number) => {
    return Math.exp(x) / (Math.exp(x) + 1);
};

const checkVibe = async (isSmilingProbability: number) => {
    vibeCheckStatus.value = null;
    status.value = "checking_vibe";

    console.log("Smile probability:", isSmilingProbability);
    if (isSmilingProbability < 0.3) {
        vibeCheckStatus.value = "failed_vibe";
        status.value = "failed_vibe";
    } else {
        vibeCheckStatus.value = "success_vibe";
        status.value = "success_vibe";
    }
}
const getSmileProbability = async (image: ImageBitmap, x: number, y: number, width: number, height: number) => {
    const small = document.createElement("canvas");
    const smallCtx = small.getContext("2d")!;
    // Try to preserve the aspect ratio but center the splatting
    const aspectRatio = width / height;
    // Assume the face detection is a little "zoomed out", and it's better to zoom so crop
    if (aspectRatio > 1) {
        height = width / aspectRatio;
    } else {
        width = height * aspectRatio;
    }
    smallCtx.drawImage(image, x, y, width, height, 0, 0, 48, 48);
    //document.body.appendChild(small); // Debug

    // This is global state so must be done in both paths.
    grayScale = imageToGrayScale(smallCtx.getImageData(0, 0, 48, 48));

    // On webkit we skip actually running the smile, as it fails to finish for some reason.
    // TODO: at the moment I do this everywhere because running Cairo is too slow and we don't actually care all that much.
    // We'd be better off running the ONNX directly in wasm via OnnxRuntime or something like that.
    const tensorGrayScale = new ort.Tensor('float32', grayScale, [1, 48*48]);
    const modelResponse = await onnxSessionRef.value?.run({ input: tensorGrayScale });
    let smileProbability = modelResponse.probabilities.cpuData[1];

    return smileProbability
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
        await new Promise((resolve, reject) => {
            const ok = window.confirm("Because of WASM limitations, Vibe Check isn't able to generate proofs client-side for Giza. Your image will be sent to Hylé. If you're not OK with that, ask a friend to smile instead !");
            if (ok) {
                resolve(null);
            } else {
                reject("User didn't want to send the image to Hylé");
            }
        });

        const challenge = Uint8Array.from("0123456789abcdef0123456789abcdef", c => c.charCodeAt(0));
        webAuthnValues = {
            ...await signChallengeWithWebAuthn(challenge),
            identity: identity,
        }

        // Start locally proving that we are who we claim to be by signing the transaction hash
        // Send the proof of smile to Giza or something
        const cairoGrayScale = grayScale.map(pixel => Math.round(pixel * 100000))

        smileArgs = {
            identity: identity,
            image: [...cairoGrayScale]
        };

        // Locally or backend prove an erc20 transfer
        erc20Args = {
            balances: getBalances(),
            from: "faucet",
            to: identity,
            amount: 100,
        };


        // Send the transaction
        payloadResp = await broadcastVibeCheckPayload(
            identity,
            webAuthnValues,
            smileArgs,
            erc20Args,
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

const proveRemotely = async () => {
    await proveAndSendProofsTx(txHash.value!, webAuthnValues, smileArgs, erc20Args);
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
            <p class="my-4">Vibe Check is a zkML & WebAuthn Powered zkApp asserting a user has smiled and awarding test
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
            <div class="flex justify-center my-8 gap-8">
                <button @click="doWebAuthn" :disabled="status !== 'start' && status !== 'failed_authentication'">
                    Smile & get tokens
                </button>
                <a href="/proving" class="border-0"><button v-if="status === 'start'">Prove transactions</button></a>
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
                                        <a :href="HyleouApi.transactionDetails(txHash!)">
                                            <extLink class="h-4 w-auto inline-block pr-1" />Hyléou
                                        </a><br>or tweet about it
                                        !
                                    </p>
                                    <p class="text-center text-sm font-mono my-4">Anyone can generate proofs of your
                                        transaction, but you can also do it yourself:
                                    </p>
                                    <button class="my-2" @click="proveRemotely">Prove remotely (no privacy)
                                    </button>
                                    <button disabled>Prove locally (unavailable for now)</button>
                                    <a href="/proving" class="border-0"><button class="my-2">Go to proving
                                            page</button></a>
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
