import { checkContractExists, registerContract, base64ToUint8Array, broadcastPayloadTx } from "hyle-js";
import { hashBalance } from "./smart_contracts/cairo/CairoHash.ts";
import { network } from "./network.ts";
import {
    computeErc20Payload,
    computeSmilePayload,
    type CairoArgs,
    type CairoSmileArgs,
    type ECDSAArgs,
} from "./smart_contracts/SmartContract.ts";

export function broadcastVibeCheckPayload(
    identity: string,
    webAuthnValues: ECDSAArgs,
    smileArgs: CairoSmileArgs,
    erc20Args: CairoArgs,
) {
    return broadcastPayloadTx(identity, [
        {
            contractName: "ecdsa_secp256r1",
            data: window.btoa(JSON.stringify(webAuthnValues)),
        },
        {
            contractName: "smile",
            data: window.btoa(computeSmilePayload(smileArgs)),
        },
        {
            contractName: "smile_token",
            data: window.btoa(computeErc20Payload(erc20Args)),
        },
    ]);
}

export async function ensureContractsRegistered() {
    let exists = await checkContractExists(network, "smile_token");
    if (!exists) {
        const initialBalanceHash = hashBalance([
            {
                name: "faucet",
                amount: 1000000,
            },
        ]);
        await registerContract(
            "cairo",
            "smile_token",
            new Uint8Array([213]),
            new Uint8Array(initialBalanceHash.split("").map((x) => x.charCodeAt(0))),
        );
    }
    exists = await checkContractExists(network, "smile");
    if (!exists) {
        await registerContract(
            "cairo",
            "smile",
            new Uint8Array([123]),
            new Uint8Array("666".split("").map((x) => x.charCodeAt(0))),
        );
    }
    exists = await checkContractExists(network, "ecdsa_secp256r1");
    if (!exists) {
        const b64vKey =
            "AAAAAgAIAAAAAAsnAAAAFwAAAARJRF8xH6eI4EUWNZvYcNWdclGgby0gXsYaOftuGphdcJ3X1D4a7IeqCpof4oWPToDT0FSQldFnVZwSqG4BvTKn9LJp4wAAAARJRF8yLM0fruMSodTp8zXHfXtSrsaFT6M2yFDIXuATnZgH7owE99OC1C6T466mqGvSGIEyBvciRXNvz/THJSgSAWXd2wAAAARJRF8zH8wG9BuVABI9WYRDivEe/1N7ism7Yn5z/y0q5I6co0obV8s6ZqisB8VyqOqe7O8eU5OWY3sJBYby19OU/JASuAAAAARJRF80BcFIW/KrU3ox24mtreNF760c+Gqp/+n8rYECOqf/uagFPfM60oHDBuftd2HHgKHrDEyrABqkqjc6ilyko/X1jAAAAANRXzEGEHWE/ORQBtOftjS9/NH+D6KiYHiDloy6ECZv+OOcsBPufvx6vMwvZCQ+GxRBK2PWsNerazcRARu7oja/yMSdAAAAA1FfMitH0/sq8iLNQqmWPqOAVGvZezARDF80eALyzURqs4H2JUGNVVUycNCco9kkpQIujXVg/1MiDWYoaJF76cpOOlIAAAADUV8zKzy/ChD1seRRdiSj68UqPlk0it2IDickQyN2EFG6JmMEKroIBi+A/UQm9d5H2gNqqPBw3EiOA4WI1+2Ii0DuhgAAAANRXzQjVR8uQntpW6wwb/JPoAVmPoKsBVb7eFFDoNc5i8RCBRbs+fP6A+2a2WJUqdI99M9UYrfTOG1JvfVTWnsmsSl9AAAADFFfQVJJVEhNRVRJQyWW6OtBgSP858Ub8hLdPWepVsQmpgba0Crzx4JMRaTtHZAvU65UK2+meCu/X1167e/VXb8lqbNltzvq+wD9tVAAAAAFUV9BVVgv7wyRJXkS3yjUZNtLfVIisVi3vmchaDz2IaMqiCXd7wcVvIyHn3gIx+QkPLZ/yr/GW4wDlJj1HsK+lt6NzpotAAAAA1FfQx9mDXPBG4QwQL8b/2kCirlL4KuK5UoZTjw1siwcp0P0HlVuMinLbtqJpO69bbsZXXq+1fWo5fwY4ETz9y92E84AAAAKUV9FTExJUFRJQwaG613vrIg+LBReUq1FZZvmKEM9tmdacEydXP8kPNJpGOrump9vWRwzIy88vTiOK7vKZTUEvlfcno8fo4xJEBgAAAADUV9NBYRrNPI2Cmue3kY1OWuzjqwcUE+0aub3sRRqz8af0Z8kS+gEn8Wwd01MFI2FZYwHqxKXcUHWZkp+eRH6TBJAhAAAAAZRX1NPUlQG+Mqz3m1nr1itNy/F5R9BUD/M3AQ44dvyyjEsBEVJLBZ8UeDzBFxQdwyBoGHVaYHZFr6P3HviDqSTNJC+q11WAAAAB1NJR01BXzEB87zkzWB8bJSJQ4laOK2ljpSTyHWt0Xy5Kq+Fb5HZnwclrANwxqlf3sKSAzai7VQcCUTKKo8dxdmORhwQJkEmAAAAB1NJR01BXzIodyzSvAuIxVwuNKvPHPutC3NDdKEmVse/nMe/jsVcsRgLMqcn6WhZm962oxIIr2UxvhmdYBmwbegZoiEqWHsqAAAAB1NJR01BXzMcnQ0uRMyHvLGrw7CfyqG1hr/JuobWAlBQr7/50otHeiOPaPNhpkiXma7Xj8KDefCRZL/eKVAorXFKGnf5HC8oAAAAB1NJR01BXzQoUT+7f0fJH0e0U7MYq5W36QRkTcJSl3MgRMs9ZJ2YywaQmu2FiuJ3fQAYO0+DqsmxaNsk3+7TR1lCH/anGa6vAAAAB1RBQkxFXzEuGXhIcr6aOeySoyjfpW/m3baH3SVl2h7iKuatqrJX7AF2bLOZrBmRZUJbKk7Pf/n1OnFBcm9cuc65/9LzVixcAAAAB1RBQkxFXzIDk4AbwjO8MMATluYKikkkfc+cHXFoOtOlCsqQLDIMoyyRYeGkFvkV+SnwUbWGa1atss633YZYkEUaIQ8bXk73AAAAB1RBQkxFXzMdc/oqj3INClY/g3LkVKKtCvUUF0tcRWELgBQMdAWNihzKeQeKE8+tGvJewd7LwDimD713U7XzoTueaWb557kTAAAAB1RBQkxFXzQj8/mLgRtctfd9IED8XSR8tnVoFMNdGFNQ27bTW/O7SBRnLB8PDAJcgQTNNAAlhFZhHkrY+7hvzJBi613Jhr4NAAAAClRBQkxFX1RZUEUMpgd14+nB3buDUUfqDOBQs792Sf56v2G9s/Yvr9ybABS78wVcQVj3OM6EajBEwuY89hcYpODNPqxX3BbqA+/HAAAAAAAA";
        const vKey = base64ToUint8Array(b64vKey);
        await registerContract(
            "noir",
            "ecdsa_secp256r1",
            vKey,
            new Uint8Array([0, 0, 0, 0]), // TODO: add Nonce in digest?
        );
    }
}
