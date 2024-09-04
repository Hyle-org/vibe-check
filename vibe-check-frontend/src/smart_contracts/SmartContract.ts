import { serByteArray, deserByteArray, uint8ArrayToBase64 } from "hyle-js";

export type CairoSmileTokenArgs = {
    balances: { name: string; amount: number }[];
    payloads: string;
};

export type CairoSmileTokenPayloadArgs = {
    amount: number;
    from: string;
    to: string;
};

export type CairoSmileArgs = {
    identity: string;
    payloads: string;
};

export type CairoSmilePayloadArgs = {
    image: number[];
};

export type ECDSAArgs = {
    identity: string;
    payloads: string;
};

export type ECDSAPayloadArgs = {
    authenticator_data: number[];
    client_data_json_len: number;
    client_data_json: number[];
    challenge: number[];
    signature: number[];
    pub_key_x: number[];
    pub_key_y: number[];
};

export type PayloadTx = {
    identity: string,
    payloads: {contractName: string, data: string}[]
}

// export function parseECDSAPayload(txHash: string, identity: string, data?: Uint8Array) {
//     if (!data) return undefined;

//     let challenge = [...Uint8Array.from("0123456789abcdef0123456789abcdef", c => c.charCodeAt(0))];
//     // TODO: challenge needs to be related to txHash
//     // let challenge = txHash;

//     const parsed = new TextDecoder().decode(data);
//     let felts = parsed.slice(1, -1).split(" ");
//     const _payloadSize = parseInt(felts.shift() as string);
    
//     // authenticator_data
//     const authenticatorDataLen = parseInt(felts.shift() as string);
//     let authenticatorData = []
//     for (let i = 0; i < authenticatorDataLen; i++) {
//         authenticatorData.push(parseInt(felts.shift() as string));
//     }
    
//     // client_data_json_len
//     let clientDataJsonLen = parseInt(felts.shift() as string);

//     // client_data_json
//     const _clientDataJsonGenericLen = parseInt(felts.shift() as string);
//     let clientDataJson = []
//     for (let i = 0; i < _clientDataJsonGenericLen; i++) {
//         clientDataJson.push(parseInt(felts.shift() as string));
//     }

//     // signature
//     const signatureLen = parseInt(felts.shift() as string);
//     let signature = []
//     for (let i = 0; i < signatureLen; i++) {
//         signature.push(parseInt(felts.shift() as string));
//     }    
    
//     // pub_key_x
//     const pubKeyXLen = parseInt(felts.shift() as string);
//     let pubKeyX = []
//     for (let i = 0; i < pubKeyXLen; i++) {
//         pubKeyX.push(parseInt(felts.shift() as string));
//     }    
    
//     // pub_key_y
//     const pubKeyYLen = parseInt(felts.shift() as string);
//     let pubKeyY = []
//     for (let i = 0; i < pubKeyYLen; i++) {
//         pubKeyY.push(parseInt(felts.shift() as string));
//     }
  
//     return {
//         authenticator_data: authenticatorData,
//         client_data_json_len: clientDataJsonLen,
//         client_data_json: clientDataJson,
//         signature: signature,
//         pub_key_x: pubKeyX,
//         pub_key_y: pubKeyY,
//         identity: identity,
//         challenge: challenge,
//     } as ECDSAArgs;
// }

export function parseSmileTokenPayload(data?: Uint8Array) {
    if (!data) return undefined;
    const parsed = new TextDecoder().decode(data);
    const felts = parsed.slice(1, -1).split(" ");
    const _payloadSize = parseInt(felts.shift() as string);
    const fromSize = parseInt(felts[0]);
    const from = deserByteArray(felts.slice(0, fromSize + 3));
    const toSize = parseInt(felts[3 + fromSize]);
    const to = deserByteArray(felts.slice(3 + fromSize, 3 + fromSize + toSize + 3));
    const amount = parseInt(felts.slice(-1)[0]);
    return {
        from: from,
        to: to,
        amount: amount
    }
}

export function parseMLPayload(data?: Uint8Array) {
    if (!data) return [];
    const asb64 = uint8ArrayToBase64(data);
    // Parse base64 into ascii
    const ascii = atob(asb64);
    // At this point it's a list of numbers separated by spaces
    let numbers = ascii.slice(1, -1).split(" ");
    let _imageSize = numbers.shift();
    return numbers;
}

export function formatSmileTokenPayload(data?: {from: string, to: string, amount: number}) {
    if (!data) return "Unknown";
    return `${data.from} => ${data.to} (${data.amount} hylé)`;

}

// Corresponds to the number of payloads involved in the proving. Webauthn - Smile - SmileToken
let payloadsCount = 3;
// Webauthn
export function computeWebAuthnPayload(args: ECDSAPayloadArgs): string {
    let authenticator_data_len = args.authenticator_data.length;
    let authenticator_data = `${authenticator_data_len} ${args.authenticator_data.join(" ")}`
    
    let client_data_json = `${args.client_data_json_len} ${args.client_data_json.length} ${args.client_data_json.join(" ")}`
    let client_data_json_len = args.client_data_json.length;

    let challenge_len = args.challenge.length;
    let challenge = `${challenge_len} ${args.challenge.join(" ")}`

    let signature_len = args.signature.length;
    let signature = `${signature_len} ${args.signature.join(" ")}`

    let pub_key_x_len = args.pub_key_x.length;
    let pub_key_x = `${pub_key_x_len} ${args.pub_key_x.join(" ")}`

    let pub_key_y_len = args.pub_key_y.length;
    let pub_key_y = `${pub_key_y_len} ${args.pub_key_y.join(" ")}`

    let total_length = authenticator_data_len + client_data_json_len + challenge_len + signature_len + pub_key_x_len + pub_key_y_len + 7
    return `${payloadsCount} ${total_length} ${authenticator_data} ${client_data_json} ${challenge} ${signature} ${pub_key_x} ${pub_key_y} `;
}

// Smile
export function computeSmileArgs(args: CairoSmileArgs): string {
    return `[${serByteArray(args.identity)} 1 ${args.payloads.slice(1, -1)}]`;
}

export function computeSmilePayload(args: CairoSmilePayloadArgs): string {
    return `${args.image.length} ${args.image.join(" ")} `;
}

// Smile token
export function computeSmileTokenArgs(args: CairoSmileTokenArgs): string {
    let payload = args.payloads.slice(1, -1)
    let parsedBalances = args.balances.map((x) => `${serByteArray(x.name)} ${x.amount}`).join(" ");
    return `[${args.balances.length} ${parsedBalances} 2 ${payload}]`;
}
export function computeSmileTokenPayload(args: CairoSmileTokenPayloadArgs): string {
    let payload = `${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`;
    return `${payload.split(" ").length} ${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`;
}

// Gathering all payloads into one
export function computePayload(payloadWebAuthnb64?: Uint8Array, payloadSmileb64?: Uint8Array, payloadSmileTokenb64?: Uint8Array){
    let payloadWebAuthn = new TextDecoder().decode(payloadWebAuthnb64);
    let payloadSmile = new TextDecoder().decode(payloadSmileb64);
    let payloadSmileToken = new TextDecoder().decode(payloadSmileTokenb64);

    return `[${payloadWebAuthn}${payloadSmile}${payloadSmileToken}]`;
}
