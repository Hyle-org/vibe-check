import { serByteArray, deserByteArray, uint8ArrayToBase64, BlobTxInfo } from "hyle-js";

export type CairoSmileTokenArgs = {
    balances: { name: string; amount: number }[];
    blobs: string;
};

export type CairoSmileTokenBlobArgs = {
    amount: number;
    from: string;
    to: string;
};

export type CairoSmileArgs = {
    identity: string;
    blobs: string;
};

export type CairoSmileBlobArgs = {
    image: number[];
};

export type ECDSAArgs = {
    identity: string;
    blobs: string;
};

export type ECDSABlobArgs = {
    authenticator_data: number[];
    client_data_json_len: number;
    client_data_json: number[];
    challenge: number[];
    signature: number[];
    pub_key_x: number[];
    pub_key_y: number[];
};

export function parseSmileTokenBlob(blobTxInfo: BlobTxInfo) {
    let blob = blobTxInfo.blobs.filter((x) => x.contractName === "smile_token");
    if (!blob || blob.length == 0) return undefined;
    let data = blob[0].data;
    const parsed = new TextDecoder().decode(new Uint8Array(data));
    const felts = parsed.slice(1, -1).split(" ");
    const _blobSize = parseInt(felts.shift() as string);
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

export function parseMLBlob(blobTxInfo: BlobTxInfo) {
    let blob = blobTxInfo.blobs.filter((x) => x.contractName === "smile");
    if (!blob || blob.length == 0) return [];
    let data = blob[0].data
    const asb64 = uint8ArrayToBase64(new Uint8Array(data));
    // Parse base64 into ascii
    const ascii = atob(asb64);
    // At this point it's a list of numbers separated by spaces
    let numbers = ascii.slice(1, -1).split(" ");
    let _imageSize = numbers.shift();
    return numbers;
}

export function formatSmileTokenBlob(data?: {from: string, to: string, amount: number}) {
    if (!data) return "Unknown";
    return `${data.from} => ${data.to} (${data.amount} hylé)`;

}

// Webauthn
export function computeWebAuthnBlob(args: ECDSABlobArgs): string {
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
    return `${total_length} ${authenticator_data} ${client_data_json} ${challenge} ${signature} ${pub_key_x} ${pub_key_y}`;
}

// Smile
export function computeSmileArgs(args: CairoSmileArgs): string {
    return `[${serByteArray(args.identity)} 1 ${args.blobs.slice(1, -1)}]`;
}

export function computeSmileBlob(args: CairoSmileBlobArgs): string {
    return `${args.image.length} ${args.image.join(" ")}`;
}

// Smile token
export function computeSmileTokenArgs(args: CairoSmileTokenArgs): string {
    let blob = args.blobs.slice(1, -1)
    let parsedBalances = args.balances.map((x) => `${serByteArray(x.name)} ${x.amount}`).join(" ");
    return `[${args.balances.length} ${parsedBalances} 2 ${blob}]`;
}
export function computeSmileTokenBlob(args: CairoSmileTokenBlobArgs): string {
    let blob = `${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`;
    return `${blob.split(" ").length} ${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`;
}

// Gathering all blob into one
export function computeBlob(blobWebAuthn: string, blobSmile: string, blobSmileToken: string){

    // Length corresponds to the number of blobs involved in the proving
    let length = 3
    return `[${length} ${blobWebAuthn} ${blobSmile} ${blobSmileToken}]`;
}
