# Cairo-proving-server
#### Build and run
```
cargo build --release
./target/release/cairo-proving-server
```

> This part is in charge of _proving_ the Cairo programs. Its is heavily inspired from Lambdaclass's [Cairo prover](https://github.com/lambdaclass/lambdaworks/tree/main/provers/cairo) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.

> As proving is heavy in memory usage, we decided to wrap the prover in a http-server that runs the native binary instead of in-browser WASM. If you want to run it in WASM anyway, you'll need to update the frontend code a bit.