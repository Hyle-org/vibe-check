/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} trace_data
* @param {Uint8Array} memory_data
* @param {string} output
* @returns {any}
*/
export function wasm_prove(trace_data: Uint8Array, memory_data: Uint8Array, output: string): any;
/**
* The options for the proof
*
* - `blowup_factor`: the blowup factor for the trace
* - `fri_number_of_queries`: the number of queries for the FRI layer
* - `coset_offset`: the offset for the coset
* - `grinding_factor`: the number of leading zeros that we want for the Hash(hash || nonce)
*/
export class ProofOptions {
  free(): void;
/**
*/
  blowup_factor: number;
/**
*/
  coset_offset: bigint;
/**
*/
  fri_number_of_queries: number;
/**
*/
  grinding_factor: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly wasm_prove: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly __wbg_proofoptions_free: (a: number) => void;
  readonly __wbg_get_proofoptions_blowup_factor: (a: number) => number;
  readonly __wbg_set_proofoptions_blowup_factor: (a: number, b: number) => void;
  readonly __wbg_get_proofoptions_fri_number_of_queries: (a: number) => number;
  readonly __wbg_set_proofoptions_fri_number_of_queries: (a: number, b: number) => void;
  readonly __wbg_get_proofoptions_coset_offset: (a: number) => number;
  readonly __wbg_set_proofoptions_coset_offset: (a: number, b: number) => void;
  readonly __wbg_get_proofoptions_grinding_factor: (a: number) => number;
  readonly __wbg_set_proofoptions_grinding_factor: (a: number, b: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
