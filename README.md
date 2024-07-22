# VibeCheck

The general idea of the Vibe Check app is to give people a SmileToken to reward them for smiling. 

<iframe width="560" height="315" src="https://www.youtube.com/embed/EQ7hBTmeJLs?si=1W5OSnNcJ3pi8aZ9" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Context

The step-by-step process:

1. **I identify myself.**
    1. I use WebAuthn, with a Yubikey on a computer, a fingerprint on a phone, or any other accepted device.
    2. Vibe Check runs the Noir prover in-browser.
    3. The prover generates a Noir proof that the webauthn-signature is correct.
2. **I take a selfie where I’m smiling to generate a proof of my shiny, bubbly personality.**
    1. Vibe Check uses a machine-learning model that the Hylé team has transformed into a Cairo program using [Giza](https://www.gizatech.xyz/)'s transpiler.
    2. I send my selfie to this Cairo program, which runs on a virtual machine.
    3. The machine-learning model checks that I am smiling.
    4. If I am smiling, the Cairo-prover generates a proof.
3. **Vibe Check gives me a SmileToken.**
    1. Vibe Check locally updates the state of the SmileToken.
    2. Vibe Check generates a Cairo proof that the state transition was done correctly.
4. **Hylé verifies the proofs.**
    1. Hylé updates the SmileToken state if everything is correct. If so, I am rewarded with that SmileToken to congratulate me for my good vibes.
    2. Since Hylé’s state is checkpointed on different networks, I could get that token on any bridged network like Starknet or even Ethereum.


This repo contains all you need to undertand how to bootstrap your first zkApp with _Hylé_. More docs about VibeCheck [here](https://docs.hyle.eu/developers/examples/vibe-check/)

----------------

This zkApp is composed of **6 parts**:
1) [noir-webauthn](./noir-webauthn/README.md)

This part is in charge of the webauthn-ecdsa signature verification. 

> The aim of this is to compile noir code in a [noir json](vibe-check-frontend/src/noir/webauthn.json) that is then used to prove noir code from browser

2) [cairo-reco-smile](./cairo-reco-smile/README.md)

This part is in charge of running the machine learning model that detect the smile.

> The aim of this is to compile cairo code in a [cairo json](vibe-check-frontend/src/cairo/programs/smile-token-sierra.json) that is then used to run cairo code from browser.

3) [cairo-smile-token](./cairo-smile-token/README.md)

This part is in charge of locally updating the state of the smile token.

> The aim of this is to compile cairo code in a [cairo json](vibe-check-frontend/src/cairo/programs/smile-sierra.json) that is then used to run cairo code from browser.

4) [cairo-runner](./cairo-runner/README.md)

This part is in charge of _running_ the Cairo programs. Its is heavily inspired from  Lambdaclass's [CairoVM](https://github.com/lambdaclass/cairo-vm/tree/main/cairo1-run) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.

5) [cairo-proving-server](./cairo-proving-server/README.md)

This part is in charge of _proving_ the Cairo programs. Its is heavily inspired from Lambdaclass's [Cairo prover](https://github.com/lambdaclass/lambdaworks/tree/main/provers/cairo) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.

> As proving is heavy in memory usage, we decided to wrap the prover in a http-server that runs the native binary instead of in-browser WASM. If you want to run it in WASM anyway, you'll need to update the frontend code a bit.

6) [vibe-check-frontend](./vibe-check-frontend/README.md)

This part is in charge of the frontend that orchestrate the flow, through a userfriendly-ish UI.

-------------------
## How to run it

### Node setup
You will need a local Hylé node, we recommand you go through the [installation guide](https://github.com/Hyle-org/hyle/blob/main/README.md)

### Cairo proving server setup

```
cd cairo-proving-server
cargo build --release
./target/release/cairo-proving-server
```

### Frontend setup
#### Installation
We recommand you to use [bun](https://bun.sh/docs/installation) for running the frontend part.
```
cd vibe-check-frontend
bun install
bun run dev
```

## How it works

### Understanding the components of the demo

The Vibe Check demo consists of three components: the **app**, the **proof generators**, and the **Hylé node**.

The **app** helps the user craft a transaction through 2 interactions:

- Identification with [WebAuthn](https://vivs.wiki/WebAuthn) for a proof of ID
- Photo of the user smiling for a proof of smile

The **app** sends these inputs to the **proof generators.**

The **proof generators** execute programs and generate proofs.

They can be run locally in the browser or remotely to maximize performance. Local proof generation is possible by compiling the Cairo VM/Cairo Prover/Noir Prover into WASM, but it is inefficient. Proving is a memory-consuming activity, and browsers usually have a low limit.

The proof generators generate three proofs:

1. Proof of ID: verification of the WebAuthn ECDSA signature in Noir
2. Proof of smile: running the machine-learning model in Cairo
3. Token (ERC-20) transfer: initiated in Cairo if the first two proofs are valid.

The **app** sends the three proofs through one single transaction to the **Hylé node**.

The **Hylé node:**

1. Unpacks the three proofs.
2. Verifies each proof with the correct verifier: Noir for WebAuthn and Cairo for the two others.
3. Ensures consistency by checking the public data contained in the proofs to ensure they all relate to the same transaction.

![A flowchart with three main sections as explained above.](./assets/img/proof-of-smile-workflow.png)

### Multiple proving schemes

A **proving scheme** is a protocol or framework for generating proofs and verifying them.

In Vibe Check, we use Noir and Cairo.

We use **Noir** to generate ECDSA proofs. Its Typescript SDK makes it easy to integrate into an app.

We use **Cairo** for two proofs:

- That there is a smile on the screenshot
- The coin transfer, with an ERC-20 specification.

We used the LambdaClass CairoVM. Because of the current dependency mismatches between the prover and the runner, the Cairo prover and the Cairo runner had to be compiled separately.

### Using Giza for zkML

ZkML is one of ZK's many use cases. It helps you assert that a prediction's result was obtained with the right model, trained on the right dataset, and fed with the right input.

**Giza** focuses on helping developers create a provable machine-learning model.

Here is the flow we followed:

1. We used a **simple classifier from the [XGBoost library](https://xgboost.readthedocs.io/en/stable/) in Python**, which Giza fully supports. 
2. We serialized our model in json thanks to the Giza SDK.
3. We used the Giza API to turn our model into a Cairo program.
4. We compiled the Cairo ML into Sierra using `scarb`
5. We executed our model in the Cairo VM we were using.

Deep learning models, especially CNNs, would typically be more appropriate for image recognition, but some primitives used by those are not yet supported. Larger models are also extremely hard to run in a Cairo VM because of their high memory requirements.

## Thanks

S/O to Lambdaclass team for their [CairoVM](https://github.com/lambdaclass/cairo-vm/tree/main/cairo1-run) and [Cairo prover](https://github.com/lambdaclass/lambdaworks/tree/main/provers/cairo).

S/O to [Aztec](https://github.com/AztecProtocol/aztec-packages) for Noir and tooling around it.

S/O to [Giza](https://www.gizatech.xyz/) for help and support around zmML and Cairo.
