FROM rust:latest as builder
WORKDIR /app

RUN apt-get update
RUN apt-get install libclang-dev -y

COPY . .
RUN RUSTFLAGS='-C target-feature=+crt-static' cargo build --release --target x86_64-unknown-linux-gnu

FROM alpine:latest
WORKDIR /
COPY --from=builder /app/target/x86_64-unknown-linux-gnu/release/cairo-proving-server cairo-proving-server
EXPOSE 3000
CMD ["./cairo-proving-server"]