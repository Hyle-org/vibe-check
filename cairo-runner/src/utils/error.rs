use wasm_bindgen::JsValue;


#[derive(Debug)]
pub enum RunnerError{
    GenericError(String)
}

// See https://rustwasm.github.io/wasm-bindgen/reference/types/result.html
impl Into<JsValue> for RunnerError {
    fn into(self) -> JsValue {
        JsValue::from_str(&format!("{:?}", self))
    }
}

impl<T: std::error::Error> From<T> for RunnerError {
    fn from(error: T) -> Self {
        RunnerError::GenericError(error.to_string())
    }
}
