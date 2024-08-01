import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import * as crypto from "crypto";
import { getRpId } from "./network";
import { isMobile } from 'mobile-device-detect';

function extractPublicKeyCoordinates(publicKeyInfo: ArrayBuffer): [x: Uint8Array, y: Uint8Array] {
    const asn1 = asn1js.fromBER(publicKeyInfo);
    if (asn1.offset === -1) {
        throw new Error("PublicKey wrongly formatted");
    }

    const spki = new pkijs.PublicKeyInfo({ schema: asn1.result });

    const x = new Uint8Array((spki.parsedKey as pkijs.ECPublicKey)!.x);
    const y = new Uint8Array((spki.parsedKey as pkijs.ECPublicKey)!.y);

    return [x, y];
}

function extractSignature(signature: ArrayBuffer): Uint8Array {
    const asn1 = asn1js.fromBER(signature);
    if (asn1.offset === -1) {
        throw new Error("Signature wrongly formatted");
    }

    const sequence = asn1.result;
    if (!(sequence instanceof asn1js.Sequence) || sequence.valueBlock.value.length !== 2) {
        throw new Error("Unexpected ASN.1 structure");
    }

    const rBlock = sequence.valueBlock.value[0] as asn1js.Integer;
    const sBlock = sequence.valueBlock.value[1] as asn1js.Integer;

    let r = rBlock.valueBlock.valueHexView;
    let s = sBlock.valueBlock.valueHexView;

    // Convert both to bigint
    let big_r = BigInt(`0x${r.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "")}`);
    let big_s = BigInt(`0x${s.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "")}`);

    // ECDSA malleability fix: both (r, s) and (r, -s mod n) are valid signatures
    // To prevent this, we can enforce s to be in the lower half of the curve
    if (big_s > 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n / 2n) {
        big_s = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n - big_s;
    }

    // Convert back to a uint8array of exactly 32 bytes and concatenate
    r = new Uint8Array(32);
    s = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        r[31 - i] = Number(big_r & 0xffn);
        s[31 - i] = Number(big_s & 0xffn);
        big_r >>= 8n;
        big_s >>= 8n;
    }

    return new Uint8Array([...r, ...s]);
}

function padRightWithZeros(input: ArrayBufferLike): Uint8Array {
    var targetLength = 255;
    var inputArray = new Uint8Array(input);
    if (inputArray.length >= targetLength) {
        return inputArray;
    }

    const paddedArray = new Uint8Array(targetLength);
    paddedArray.set(inputArray, 0);

    return paddedArray;
}

// https://www.w3.org/TR/webauthn-2/#sctn-cryptographic-challenges
var creationChallenge = Uint8Array.from("0123456789abcdef0123456789abcdef", (c) => c.charCodeAt(0));

export const needWebAuthnCredentials = () => {
    try {
        const locallyStoredId = JSON.parse(window.localStorage.getItem("credentials")!);
        console.log("locallyStoredId", locallyStoredId);
        return !Uint8Array.from(locallyStoredId.raw_id as Array<number>);
    } catch (_) {
        return true;
    }
};

export const registerWebAuthnIfNeeded = async () => {
    const storedId = (() => {
        try {
            const locallyStoredId = window.localStorage.getItem("credentials");
            return locallyStoredId ? Uint8Array.from(JSON.parse(locallyStoredId).raw_id as Array<number>) : null;
        } catch (_) {}
    })();

    if (storedId) {
        return;
    }

    var publicKey = {
        attestation: "none",
        authenticatorSelection: {
            requireResidentKey: false,
            residentKey: "discouraged",
        },
        challenge: creationChallenge,
        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
        rp: { name: "Vibe Checker", id: getRpId() },
        timeout: 600000,
        user: { id: Uint8Array.from("myUserId", (c) => c.charCodeAt(0)), name: "jamiedoe", displayName: "Jamie Doe" },
    } as PublicKeyCredentialCreationOptions;

    if (isMobile) {
        publicKey.authenticatorSelection.authenticatorAttachment = "platform";
    }
    var credential = (await navigator.credentials.create({ publicKey: publicKey })) as PublicKeyCredential;
    var attestation = credential.response as AuthenticatorAttestationResponse;

    // Apparently no need to store() for public key credentials?

    //navigator.credentials.store(credential);
    window.localStorage.setItem(
        "credentials",
        JSON.stringify({
            raw_id: Array.from(new Uint8Array(credential.rawId)),
            public_key: Array.from(new Uint8Array(attestation.getPublicKey()!)),
        }),
    );
};

export const signChallengeWithWebAuthn = async (challenge: Uint8Array) => {
    const locallyStoredId = window.localStorage.getItem("credentials")!;
    const rawId = Uint8Array.from(JSON.parse(locallyStoredId).raw_id as Array<number>);
    const publicKey = Uint8Array.from(JSON.parse(locallyStoredId).public_key as Array<number>);

    // We assume that the above cannot fail or there is a logic error in the code

    const getRequest = {
        allowCredentials: [{ id: rawId, type: "public-key" }],
        challenge: challenge,
        rpId: getRpId(),
        attestation: "none",
        timeout: 600000,
        userVerification: "discouraged",
    } as PublicKeyCredentialRequestOptions;

    var assertion = ((await navigator.credentials.get({ publicKey: getRequest })) as PublicKeyCredential)
        .response as AuthenticatorAssertionResponse;

    assertion.userHandle;
    // Extract values from webauthn interactions
    var pubKey = publicKey;
    var signature = assertion.signature;
    var clientDataJSON = assertion.clientDataJSON;
    var authenticatorData = assertion.authenticatorData;

    // Format values to make them exploitable
    // TODO: isn't it flaky ? When r/s are padded with 00
    var [pub_key_x, pub_key_y] = extractPublicKeyCoordinates(pubKey);
    var extracted_signature = extractSignature(new Uint8Array(signature));
    var paddedClientDataJSON = padRightWithZeros(new Uint8Array(clientDataJSON));
    // challenge is containted in the clientDataJSON: https://www.w3.org/TR/webauthn-2/#dictionary-client-data
    // TODO: exported challenge should NOT be extracted from clientDataJSON
    var extracted_challenge = clientDataJSON.slice(36, 36 + 43);
    var client_data_json_len = clientDataJSON.byteLength;

    return {
        authenticator_data: Array.from(new Uint8Array(authenticatorData)),
        client_data_json_len: client_data_json_len,
        client_data_json: Array.from(new Uint8Array(paddedClientDataJSON)),
        signature: Array.from(new Uint8Array(extracted_signature)),
        challenge: Array.from(new Uint8Array(extracted_challenge)),
        pub_key_x: Array.from(new Uint8Array(pub_key_x)),
        pub_key_y: Array.from(new Uint8Array(pub_key_y)),
    };
};

export const getWebAuthnIdentity = (): string => {
    try {
        const locallyStoredId = window.localStorage.getItem("credentials")!;
        let pubKey = Uint8Array.from(JSON.parse(locallyStoredId).public_key as Array<number>);
        var [pub_key_x, pub_key_y] = extractPublicKeyCoordinates(pubKey);

        const publicKey = Buffer.concat([Buffer.from(pub_key_x), Buffer.from(pub_key_y)]);
        const hash = crypto.createHash("sha256").update(publicKey).digest();
        const result = hash.slice(-20);
        const hexResult = Array.from(result).map((byte) => byte.toString(16).padStart(2, "0"));

    return hexResult.join("") + ".ecdsa_secp256r1";
    } catch (error) {
        return ""
    }
};
