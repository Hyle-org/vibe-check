import { expect, test } from "bun:test";
import { hashPublicKey } from "./getAddressFromPubKey";


test(
    "hashPublicKey",
    () => {   
        let pub_key_x = [10,139,43,102,182,222,131,127,94,44,137,46,114,246,188,198,153,38,51,220,104,189,146,100,20,183,186,135,40,241,63,90];
        let pub_key_y = [248,109,104,228,138,216,189,114,45,18,108,136,174,69,16,115,225,68,38,193,19,153,45,106,117,46,233,180,209,239,182,202];
        const address = hashPublicKey(pub_key_x, pub_key_y);
        expect(address == "8a0252d32e218701088f09d74143ab8004d95054");
        console.log(address);
    },
    60 * 1000 * 10,
);
