import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';


function runCommand(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const process = spawn(command, args);

        process.stdout.on('data', (data) => {
            console.log(`Output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            console.error(`Error: ${data}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

export async function proveECDSA(witness: Buffer): Promise<Buffer> {
    const witnessFilePath = path.join(path.dirname(__dirname), '/outputs/witness.gz');
    const proofFilePath = path.join(path.dirname(__dirname), '/outputs/proof');

    // Write witness file
    await fs.promises.writeFile(witnessFilePath, witness);

    // Prove using barretenberg command line
    console.log("Executing:", `bb prove -b ./webauthn.json -w ${witnessFilePath}  -o ${proofFilePath}`)
    const command = 'bash';
    const args = ['-c', `bb prove -b ./webauthn.json -w ${witnessFilePath}  -o ${proofFilePath}`];
    await runCommand(command, args);

    // Read and return proof
    const proof = await fs.promises.readFile(proofFilePath);    
    console.log("Proof generated\n")

    return proof;
}