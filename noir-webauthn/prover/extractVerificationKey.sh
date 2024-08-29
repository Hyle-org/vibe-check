#!/bin/bash

nargo compile
bb write_vk -b ./target/webauthn.json -o ./target/vk
cat ./target/vk | base64 | tr -d '\n'
