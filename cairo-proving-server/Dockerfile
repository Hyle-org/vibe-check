FROM rust:latest as builder
WORKDIR /app

RUN apt-get update
RUN apt-get install libclang-dev -y

COPY Cargo.toml Cargo.lock ./
RUN rustup override set nightly-2024-05-24
RUN RUSTFLAGS='-C target-feature=+crt-static' cargo build --release --target x86_64-unknown-linux-gnu

FROM alpine:latest
WORKDIR /
COPY --from=builder /app/target/x86_64-unknown-linux-gnu/release/cairo-http cairo-http
EXPOSE 3000
CMD ["./cairo-proving-server"]