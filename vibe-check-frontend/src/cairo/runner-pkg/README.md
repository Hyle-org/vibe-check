```
make deps
```
You'll have to run the runner in order to create the sierra file. 
Depending on the platform, you might need to create ./cairo-erc20/target folder:
```
mkdir ./cairo-erc20/target
./target/release/cairo-runner ./cairo-erc20/src/lib.cairo \                                    [1d5dab9]
./cairo-erc20/erc20.args \
./cairo-erc20/target/trace.bin \
./cairo-erc20/target/memory.bin \
./cairo-erc20/target/output.json \
./cairo-erc20/target/sierra.json
```
To prove/verify
```
platinum-prover prove ./target/trace ./target/memory proof
platinum-prover verify proof
```

To build WASM package:
```
cargo install wasm-pack
wasm-pack build --target web --release
```

WARNING!
Errors are not handled the right way, sfyl (: