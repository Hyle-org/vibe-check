<script setup lang="ts">
import * as faceApi from "face-api.js";
import { computed, nextTick, onMounted, ref, watchEffect } from "vue";
import { needWebAuthnCredentials, registerWebAuthnIfNeeded, signChallengeWithWebAuthn, getWebAuthnIdentity } from "./webauthn";
import { runSmile, proveSmile, proveERC20Transfer } from "./cairo/prover";
import { proveECDSA } from "./noir/prover";
import { setupCosmos, broadcastTx, checkTxStatus, ensureContractsRegistered } from "./cosmos";
import { getBalances } from "./SmileTokenIndexer";

import Logo from "./assets/Hyle_logo.svg";
import extLink from "./assets/external-link-svgrepo-com.vue";
import { getNetworkRpcUrl } from "./network";

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
});

const doWebAuthn = async () => {
    status.value = "pre-authenticating";
    if (needWebAuthnCredentials()) {
        // Wait 2s
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status.value = "authenticating";
        try {
            await registerWebAuthnIfNeeded();
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
            const resizedDetections = faceApi.resizeResults(lastDetections.value, displaySize)
            faceApi.draw.drawDetections(canvasOutput.value!, resizedDetections);
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
        grayscaleArray[j] = Math.round(grayscale / 255 * 100000); // Normalized to [0, 1] and x100 000 for XGBoost inputs
    }

    return grayscaleArray;
}

const sigmoid = (x: number) => {
    return Math.exp(x) / (Math.exp(x) + 1);
};

const checkVibe = async (image: ImageBitmap, zoomingPromise: Promise<any>, x: number, y: number, width: number, height: number) => {
    vibeCheckStatus.value = null;
    status.value = "checking_vibe";

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

    grayScale = imageToGrayScale(smallCtx.getImageData(0, 0, 48, 48));

    var dryRunSmileArgs = {
        identity: "DRYRUN", // not used in the model
        image: [...grayScale]
    };

    // On iOS, we need to skip it as it takes too long.
    let isSmiling;
    if (navigator.userAgent.indexOf('AppleWebKit') === -1) {
        let cairoSmileRunOutput = await runSmile(dryRunSmileArgs);
        // Get last parameter of the serialized HyleOutput struct
        const last = cairoSmileRunOutput.split(" ").reverse()[0];

        // Process felt as a signed integer.
        let res = BigInt(last.split("]")[0]);
        // 2^128
        if (res > 340282366920938463463374607431768211456n)
            res = -(3618502788666131213697322783095070105623107215331596699973092056135872020481n - res);
        // Avoid NaNs in exp
        if (res > 10000000n) res = 10000000n;
        if (res < -10000000n) res = -10000000n;

        isSmiling = sigmoid(+res.toString() / 100000);
    } else {
        isSmiling = Math.random();
    }
    console.log("Smile probability:", isSmiling);
    await zoomingPromise;
    if (isSmiling < 0.3) {
        vibeCheckStatus.value = "failed_vibe";
        status.value = "failed_vibe";
    } else {
        vibeCheckStatus.value = "success_vibe";
        status.value = "success_vibe";
    }
}

const retryScreenshot = () => {
    screenshotData.value = null;
    lastDetections.value = [];
    vibeCheckStatus.value = null;

    status.value = "authenticated";
    activateCamera();
}

const signAndSend = async () => {
    ecdsaPromiseDone.value = false;
    smilePromiseDone.value = false;
    erc20PromiseDone.value = false;
    status.value = "proving";
    const identity = getWebAuthnIdentity();

    try {
        // Start locally proving that we are who we claim to be by signing the transaction hash
        // Send the proof of smile to Giza or something
        const smilePromise = proveSmile({
            identity: identity,
            image: [...grayScale]
        });
        // Locally or backend prove an erc20 transfer
        const erc20Promise = proveERC20Transfer({
            balances: getBalances(),
            amount: 100,
            from: "faucet",
            to: identity,
        });

        const challenge = Uint8Array.from("0123456789abcdef0123456789abcdef", c => c.charCodeAt(0));
        const webAuthnValues = await signChallengeWithWebAuthn(challenge);
        const ecdsaPromise = proveECDSA(webAuthnValues);

        ecdsaPromise.then(() => ecdsaPromiseDone.value = true);
        smilePromise.then(() => smilePromiseDone.value = true);
        erc20Promise.then(() => erc20PromiseDone.value = true);

        // Send the transaction
        const resp = await broadcastTx(
            await ecdsaPromise,
            await smilePromise,
            await erc20Promise,
        );
        // Switch to waiter view
        status.value = "checking_tx";

        // Wait a bit and assume TX will be processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check the status of the TX
        const txStatus = await checkTxStatus(resp.transactionHash);
        if (txStatus.status === "success") {
            status.value = "tx_success";
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
        <h1 class="text-center my-4">Vibe Check</h1>
        <h3 class="text-center my-4"><img :src="Logo" alt="Hylé logo" class="h-10 m-auto"></img></h3>
        <template v-if="screen == 'start'">
            <div class="flex flex-col justify-center h-[400px] max-h-[50vh] max-w-[50rem] m-auto img-background p-10">
                <div v-if="status === 'pre-authenticating' || status === 'authenticating'"
                    class="p-10 bg-black bg-opacity-70 rounded-xl">
                    <p class="text-center font-semibold font-anton mb-2">Authenticating via WebAuthn</p>
                    <p class="text-center">You will be asked to create a secure account<br />
                        using the secure enclave contained within your phone.</p>
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
                        <div v-else-if="screen === 'proving' && status !== 'failed_at_proving'"
                            class="text-white p-8 bg-black bg-opacity-50 rounded-xl overflow-hidden">
                            <div :class="`relative scrollOnSuccess ${status}`">
                                <div class="flex flex-col gap-2">
                                    <p class="flex items-center">Generating ECDSA signature proof:
                                        <i v-if="!ecdsaPromiseDone" class="spinner"></i>
                                        <span v-else>✅</span>
                                        <span class="text-sm mt-1 text-opacity-80 italic">(this takes a while)</span>
                                    </p>
                                    <p class="flex items-center">Generating proof of smile: <i v-if="!smilePromiseDone"
                                            class="spinner"></i><span v-else>✅</span></p>
                                    <p class="flex items-center">Generating ERC20 claim proof: <i
                                            v-if="!erc20PromiseDone" class="spinner"></i><span v-else>✅</span></p>
                                    <p class="flex items-center gap-1">Sending TX: <i v-if="status === 'proving'"
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
                                        <a>
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
                    <button @click="signAndSend"
                        :disabled="status !== 'failed_vibe' && status !== 'success_vibe' && status !== 'failed_at_proving'">Send
                        TX</button>
                    <button @click="retryScreenshot" v-if="status === 'failed_vibe'">Retry</button>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
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
