# Cairo-runner

This part is in charge of _running_ the Cairo programs. Its is heavily inspired from  Lambdaclass's [CairoVM](https://github.com/lambdaclass/cairo-vm/tree/main/cairo1-run) with small changes that fit our needs. It is made to be potentially compiled in WASM for in-browser execution.
### Build
```
make deps
```
You'll have to run the runner in order to create the sierra file. 
Depending on the platform, you might need to create ./cairo-smile-token/target folder:
```
mkdir ../cairo-smile-token/target
./target/release/cairo-runner ../cairo-smile-token/src/lib.cairo \
    ../cairo-smile-token/smile-token.args \
    ../cairo-smile-token/target/trace.bin \
    ../cairo-smile-token/target/memory.bin \
    ../cairo-smile-token/target/output.json \
    ../cairo-smile-token/target/smile-token-sierra.json
```

To build WASM package:
```
cargo install wasm-pack
wasm-pack build --target web --release
```
> This will create a `pkg` folder, that is used [in the frontend](../vibe-check-frontend/src/runner-pkg/)