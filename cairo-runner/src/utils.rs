use bincode::enc::write::Writer;
use cairo1_run::{cairo_run_program, Cairo1RunConfig, error::Error, FuncArg};
use cairo_lang_compiler::{compile_prepared_db, db::RootDatabase, project::setup_project, CompilerConfig};
use cairo_vm::{types::layout_name::LayoutName, vm::{self, errors::trace_errors::TraceError, trace::trace_entry::RelocatedTraceEntry}, Felt252};
use serde::{Deserialize, Serialize};
use std::{fs::File, io::{self, BufWriter, Write}, path::PathBuf};

pub mod error;

#[derive(Serialize, Deserialize)]
pub struct CairoRunOutput {
    pub trace: Vec<u8>,
    pub memory: Vec<u8>,
    pub output: String
}

pub fn cairo_run(serialized_sierra_program: &str, program_inputs: &str) -> Result<CairoRunOutput, error::RunnerError> {
    let sierra_program = serde_json::from_str(&serialized_sierra_program)?;
    let inputs = process_args(&program_inputs).unwrap();

    let cairo_run_config = Cairo1RunConfig {
        args: &inputs.0,
        serialize_output: true,
        trace_enabled: true,
        relocate_mem: true,
        layout: LayoutName::all_cairo,
        proof_mode: true,
        finalize_builtins: false,
        append_return_values: false,
    };

    let (runner, _, serialized_output) = cairo_run_program(&sierra_program, cairo_run_config)?;

    let relocated_trace: Vec<RelocatedTraceEntry> = runner
        .relocated_trace
        .ok_or(Error::Trace(TraceError::TraceNotRelocated))?;

    let cairo_run_output = CairoRunOutput{
        trace: encode_trace(&relocated_trace),
        memory: encode_memory(&runner.relocated_memory),
        output: serialized_output.unwrap()
    };

    Ok(cairo_run_output)
}


pub fn cairo_run_from_cli(trace_bin_path: &str, memory_bin_path: &str, program_inputs_path: &str, cairo_program_path: &str, output_path: &str, sierra_path: &str) -> Result<(), error::RunnerError> {

    let program_inputs = std::fs::read_to_string(program_inputs_path)?;

    // Try to parse the file as a sierra program
    let file = std::fs::read(&cairo_program_path)?;
    let sierra_program = match serde_json::from_slice(&file) {
        Ok(program) => program,
        Err(_) => {
            // If it fails, try to compile it as a cairo program
            let compiler_config = CompilerConfig {
                replace_ids: true,
                ..CompilerConfig::default()
            };
            let mut db = RootDatabase::builder()
                .detect_corelib()
                .skip_auto_withdraw_gas()
                .build()
                .unwrap();
            let main_crate_ids = setup_project(&mut db, &PathBuf::from(cairo_program_path)).unwrap();
            compile_prepared_db(&mut db, main_crate_ids, compiler_config).unwrap()
        }
    };

    let serialized_sierra_program: String = serde_json::to_string(&sierra_program)?;
    // Save serialized sierra program
    let file = std::fs::File::create(&sierra_path)?;
    let mut sierra_writer = BufWriter::new(file);
    sierra_writer.write_all(serialized_sierra_program.as_bytes())?;
    sierra_writer.flush()?;


    let cairo_run_output = cairo_run(&serialized_sierra_program, &program_inputs)?;

    // Save trace file
    let trace_file = std::fs::File::create(trace_bin_path)?;
    let mut trace_writer = FileWriter::new(io::BufWriter::with_capacity(3 * 1024 * 1024, trace_file));
    trace_writer.write(&cairo_run_output.trace)?;
    trace_writer.flush()?;

    // Save memory file
    let memory_file = std::fs::File::create(memory_bin_path)?;
    let mut memory_writer =  FileWriter::new(io::BufWriter::with_capacity(5 * 1024 * 1024, memory_file));
    memory_writer.write(&cairo_run_output.memory)?;
    memory_writer.flush()?;

    // Save output file
    let file = File::create(output_path)?;
    let mut writer = BufWriter::new(file);
    writer.write_all(&cairo_run_output.output.as_bytes())?;
    writer.flush()?;

    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct FuncArgs(pub Vec<FuncArg>);

#[derive(Debug)]
pub struct Args {
    pub trace_file: Option<PathBuf>,
    pub memory_file: Option<PathBuf>,
    pub layout: String,
    pub proof_mode: bool,
    pub air_public_input: Option<PathBuf>,
    pub air_private_input: Option<PathBuf>,
    pub cairo_pie_output: Option<PathBuf>,
    pub args: FuncArgs,
    pub print_output: bool,
    pub append_return_values: bool,
}

pub struct FileWriter {
    buf_writer: io::BufWriter<std::fs::File>,
    bytes_written: usize,
}


impl Writer for FileWriter {
    fn write(&mut self, bytes: &[u8]) -> Result<(), bincode::error::EncodeError> {
        self.buf_writer
            .write_all(bytes)
            .map_err(|e| bincode::error::EncodeError::Io {
                inner: e,
                index: self.bytes_written,
            })?;

        self.bytes_written += bytes.len();

        Ok(())
    }
}

impl FileWriter {
    pub fn new(buf_writer: io::BufWriter<std::fs::File>) -> Self {
        Self {
            buf_writer,
            bytes_written: 0,
        }
    }

    pub fn flush(&mut self) -> io::Result<()> {
        self.buf_writer.flush()
    }
}

/// Parses a string of ascii whitespace separated values, containing either numbers or series of numbers wrapped in brackets
/// Returns an array of felts and felt arrays
pub fn process_args(value: &str) -> Result<FuncArgs, String> {
    let mut args = Vec::new();
    // Split input string into numbers and array delimiters
    let mut input = value.split_ascii_whitespace().flat_map(|mut x| {
        // We don't have a way to split and keep the separate delimiters so we do it manually
        let mut res = vec![];
        if let Some(val) = x.strip_prefix('[') {
            res.push("[");
            x = val;
        }
        if let Some(val) = x.strip_suffix(']') {
            if !val.is_empty() {
                res.push(val)
            }
            res.push("]")
        } else if !x.is_empty() {
            res.push(x)
        }
        res
    });
    // Process iterator of numbers & array delimiters
    while let Some(value) = input.next() {
        match value {
            "[" => args.push(process_array(&mut input)?),
            _ => args.push(FuncArg::Single(
                Felt252::from_dec_str(value)
                    .map_err(|_| format!("\"{}\" is not a valid felt", value))?,
            )),
        }
    }
    Ok(FuncArgs(args))
}

/// Processes an iterator of format [s1, s2,.., sn, "]", ...], stopping at the first "]" string
/// and returning the array [f1, f2,.., fn] where fi = Felt::from_dec_str(si)
pub fn process_array<'a>(iter: &mut impl Iterator<Item = &'a str>) -> Result<FuncArg, String> {
    let mut array = vec![];
    for value in iter {
        match value {
            "]" => break,
            _ => array.push(
                Felt252::from_dec_str(value)
                    .map_err(|_| format!("\"{}\" is not a valid felt", value))?,
            ),
        }
    }
    Ok(FuncArg::Array(array))
}

/// Writes the trace binary representation.
///
/// Bincode encodes to little endian by default and each trace entry is composed of
/// 3 usize values that are padded to always reach 64 bit size.
pub fn encode_trace(relocated_trace: &[vm::trace::trace_entry::RelocatedTraceEntry]) -> Vec<u8> {
    let mut trace_bytes: Vec<u8> = vec![];
    for entry in relocated_trace.iter() {
        trace_bytes.extend(&((entry.ap as u64).to_le_bytes()));
        trace_bytes.extend(&((entry.fp as u64).to_le_bytes()));
        trace_bytes.extend(&((entry.pc as u64).to_le_bytes()));
    }
    trace_bytes
}

/// Writes a binary representation of the relocated memory.
///
/// The memory pairs (address, value) are encoded and concatenated:
/// * address -> 8-byte encoded
/// * value -> 32-byte encoded
pub fn encode_memory(relocated_memory: &[Option<Felt252>]) -> Vec<u8>{
    let mut memory_bytes: Vec<u8> = vec![];
    for (i, memory_cell) in relocated_memory.iter().enumerate() {
        match memory_cell {
            None => continue,
            Some(unwrapped_memory_cell) => {
                memory_bytes.extend(&(i as u64).to_le_bytes());
                memory_bytes.extend(&unwrapped_memory_cell.to_bytes_le());
            }
        }
    }
    memory_bytes
}
