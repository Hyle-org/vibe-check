use utils::{cairo_run, error};
use wasm_bindgen::prelude::*;

pub mod utils;


#[wasm_bindgen]
pub fn wasm_cairo_run(serialized_sierra_program: String, program_inputs: &str) -> Result<JsValue, error::RunnerError> {
    // Sets up panic for easy debugging
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));


    let cairo_run_output = cairo_run(&serialized_sierra_program, program_inputs)?;
    Ok(serde_wasm_bindgen::to_value(&cairo_run_output).unwrap())
}
