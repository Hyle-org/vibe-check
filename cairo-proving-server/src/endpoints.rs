use axum::response::IntoResponse;
use axum::{extract, http::StatusCode, response::Response};
use cairo_verifier::utils::*;
use log::{debug, info};
use zip::ZipArchive;

use std::{
    collections::HashMap,
    io::{Cursor, Read},
};

fn decompress_zip_data(compressed_data: Vec<u8>) -> std::io::Result<Vec<u8>> {
    let cursor = Cursor::new(compressed_data);
    let mut archive = ZipArchive::new(cursor)?;
    let mut decompressed_data = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        file.read_to_end(&mut decompressed_data)?;
    }

    Ok(decompressed_data)
}

struct TraceMemory {
    pub trace: Vec<u8>,
    pub memory: Vec<u8>,
}
async fn extract_trace_memory(
    mut multipart: extract::Multipart,
) -> (TraceMemory, HashMap<String, String>) {
    let mut map_strings: HashMap<String, String> = HashMap::new();
    let mut map: HashMap<String, Vec<u8>> = HashMap::new();

    while let Some(mut field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();

        let mut len = 0;

        if name == "trace" || name == "memory" {
            let data = field.bytes().await.unwrap();
            len = data.len();

            let to_vec: Vec<u8> = data
                .bytes()
                .into_iter()
                .collect::<Result<Vec<u8>, _>>()
                .unwrap();
            map.insert(name.clone(), decompress_zip_data(to_vec).unwrap());
        } else {
            let data = field.text().await.unwrap();
            len = data.len();
            map_strings.insert(name.clone(), data);
        }

        debug!("Length of `{name}` is {} bytes", len);
    }

    (
        TraceMemory {
            trace: map.get("trace").unwrap().to_owned(),
            memory: map.get("memory").unwrap().to_owned(),
        },
        map_strings,
    )
}

async fn extract_proof(mut multipart: extract::Multipart) -> Vec<u8> {
    let mut map_strings: HashMap<String, String> = HashMap::new();
    let mut map: HashMap<String, Vec<u8>> = HashMap::new();

    while let Some(mut field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();

        let mut len = 0;

        if name == "proof" {
            let data = field.bytes().await.unwrap();
            len = data.len();

            let to_vec: Vec<u8> = data
                .bytes()
                .into_iter()
                .collect::<Result<Vec<u8>, _>>()
                .unwrap();
            map.insert(name.clone(), decompress_zip_data(to_vec).unwrap());
        } else {
            let data = field.text().await.unwrap();
            len = data.len();
            map_strings.insert(name.clone(), data);
        }

        debug!("Length of `{name}` is {} bytes", len);
    }

    map.get("proof").unwrap().to_owned()
}

/*
    Receives a multipart request with the following fields
        - trace -> contains a zip file of the bytes of the trace output during the run
        - memory -> contains a zip file of the bytes of the memory output during the run
    Returns a base64 encoded proof (not zipped)
*/
pub async fn prove_handler(mut multipart: extract::Multipart) -> String {
    info!("Received a prove request");

    let (trace_memory, other_fields) = extract_trace_memory(multipart).await;

    if let Some(output) = other_fields.get("output") {
        let proof = prove(&trace_memory.trace, &trace_memory.memory, output).unwrap();
        info!("'output' field found in request parts, appending to proof '{output}'");

        return base64::encode(proof);
    }

    String::from("")
}

/*
    Receives a multipart request with the following fields
        - proof -> contains a zip file of the bytes of the proof output during the run
    Returns OK if proof is verified, KO otherwise
*/
pub async fn verify_handler(mut multipart: extract::Multipart) -> Response {
    info!("Received a verify request");

    let proof = extract_proof(multipart).await;

    match verify_proof(&proof) {
        Ok(output) => (StatusCode::OK, output).into_response(),
        Err(e) => {
            log::error!("{:?}", e);
            (StatusCode::OK, "KO").into_response()
        }
    }
}
