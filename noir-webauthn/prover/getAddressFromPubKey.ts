import * as crypto from 'crypto';


export function hashPublicKey(pub_key_x: number[], pub_key_y: number[]): String {
    if (pub_key_x.length !== 32 || pub_key_y.length !== 32) {
        throw new Error('pub_key_x and pub_key_y size need to be 32bytes.');
    }
    const publicKey = Buffer.concat([Buffer.from(pub_key_x), Buffer.from(pub_key_y)]);
    const hash = crypto.createHash('sha256').update(publicKey).digest();
    const result = hash.slice(-20);
    console.log("result good=", result);
    const hexResult = Array.from(result).map(byte => byte.toString(16).padStart(2, '0'));
    
    return hexResult.join("");
}
