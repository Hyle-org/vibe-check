import { serByteArray, deserByteArray, uint8ArrayToBase64 } from "hyle-js";

export type CairoArgs = {
    balances: { name: string; amount: number }[];
    amount: number;
    from: string;
    to: string;
    // Recalculated: hash: string;
};

export type CairoSmileArgs = {
    identity: string;
    image: number[];
};

export type ECDSAArgs = {
    identity: string;
    challenge: number[];
    authenticator_data: number[];
    client_data_json_len: number;
    client_data_json: number[];
    signature: number[];
    pub_key_x: number[];
    pub_key_y: number[];
};

export function parseECDSAPayload(data?: Uint8Array) {
    if (!data) return undefined;
    return JSON.parse(window.atob(uint8ArrayToBase64(data))) as ECDSAArgs;
}

export function parseErc20Payload(data?: Uint8Array) {
    if (!data) return "Unknown";
    const parsed = new TextDecoder().decode(data);
    const felts = parsed.slice(1, -1).split(" ");
    const fromSize = parseInt(felts[0]);
    const from = deserByteArray(felts.slice(0, fromSize + 3));
    const toSize = parseInt(felts[3 + fromSize]);
    const to = deserByteArray(felts.slice(3 + fromSize, 3 + fromSize + toSize + 3));
    const amount = parseInt(felts.slice(-1)[0]);
    return `${from} => ${to} (${amount} hylé)`;
}

export function parseMLPayload(data?: Uint8Array) {
    if (!data) return [];
    const asb64 = uint8ArrayToBase64(data);
    // Parse base64 into ascii
    const ascii = atob(asb64);
    // At this point it's a list of numbers separated by spaces
    const numbers = ascii.slice(1, -1).split(" ");
    return numbers;
}

// exported for testing
export function computeErc20Args(args: CairoArgs): string {
    const balances = args.balances.map((x) => `${serByteArray(x.name)} ${x.amount}`).join(" ");
    let [payload_length, payload] = _computeErc20Payload(args);
    return `[${args.balances.length} ${balances} ${payload_length} ${payload}]`;
}

export function computeErc20Payload(args: CairoArgs): string {
    let [_, output] = _computeErc20Payload(args);
    return `[${output}]`;
}

function _computeErc20Payload(args: CairoArgs): [number, string] {
    let payload = `${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`;
    return [payload.split(" ").length, `${serByteArray(args.from)} ${serByteArray(args.to)} ${args.amount}`];
}

export function computeSmileArgs(args: CairoSmileArgs): string {
    return `[${serByteArray(args.identity)} ${args.image.length} ${args.image.join(" ")}]`;
}

export function computeSmilePayload(args: CairoSmileArgs): string {
    return `[${args.image.join(" ")}]`;
}
