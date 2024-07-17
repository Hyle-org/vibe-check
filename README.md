# VibeCheck

This repo contains all you need to undertand how to bootstrap your first zkApp with _Hylé_. More docs about VibeCheck [here](https://docs.hyle.eu/developers/examples/vibe-check/)

----------------

This zkApp is composed of **6 parts**:
1) [noir-webauthn](./noir-webauthn/README.md)

This part is in charge of the webauthn-ecdsa signature verification. 

> The aim of this is to compile noir code in a [noir json](vibe-check-frontend/src/noir/webauthn.json) that is then used to prove noir code from browser

2) [cairo-reco-smile](./cairo-reco-smile/README.md)

This part is in charge of running the machine learning model that detect the smile.

> The aim of this is to compile noir code in a [cairo json](vibe-check-frontend/src/cairo/programs/smile-token-sierra.json) that is then used to run cairo code from browser.

3) [cairo-smile-token](./cairo-smile-token/README.md)

This part is in charge of locally updating the state of the smile token.

> The aim of this is to compile noir code in a [cairo json](vibe-check-frontend/src/cairo/programs/smile-sierra.json) that is then used to run cairo code from browser.

4) [cairo-runner](./cairo-runner/README.md)

This part is in charge of _running_ the Cairo programs. Its is heavily inspired from  Lambdaclass's [CairoVM](https://github.com/lambdaclass/cairo-vm/tree/main/cairo1-run) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.

5) [cairo-proving-server](./cairo-proving-server/README.md)

This part is in charge of _proving_ the Cairo programs. Its is heavily inspired from Lambdaclass's [Cairo prover](https://github.com/lambdaclass/lambdaworks/tree/main/provers/cairo) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.

> As proving is heavy in memory usage, we decided to wrap the prover in a http-server that runs the native binary instead of in-browser WASM. If you want to run it in WASM anyway, you'll need to update the frontend code a bit.

6) [vibe-check-frontend](./vibe-check-frontend/README.md)

This part is in charge of the frontend that orchestrate the flow, through a userfriendly-ish UI.

-------------------
# How to run it


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
-------------------
S/O to Lambdaclass team for their [CairoVM](https://github.com/lambdaclass/cairo-vm/tree/main/cairo1-run) and [Cairo prover](https://github.com/lambdaclass/lambdaworks/tree/main/provers/cairo).

S/O to [Aztec](https://github.com/AztecProtocol/aztec-packages) for Noir and tooling around it.