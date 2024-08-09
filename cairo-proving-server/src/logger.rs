use anyhow::Context;
use log::{error, warn};

pub fn setup_logger() -> Result<(), fern::InitError> {
    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{} {}] {}",
                record.level(),
                record.target(),
                message
            ))
        })
        .level(log::LevelFilter::Debug)
        .chain(std::io::stdout())
        .chain(fern::log_file("output.log")?)
        .apply()?;
    Ok(())
}

// A simple way to log without interrupting fluency
pub trait LogMe<T> {
    fn log_warn(self, context_msg: String) -> anyhow::Result<T>;
    fn log_error(self, context_msg: String) -> anyhow::Result<T>;
}

// Will log a warning in case of error
// WARN {context_msg}: {cause}
impl<T, Error: std::error::Error + Send + Sync + 'static> LogMe<T> for Result<T, Error> {
    fn log_warn(self, context_msg: String) -> anyhow::Result<T> {
        let res = self.context(context_msg);
        if let Err(e) = &res {
            warn!("{:#}", e);
        }
        res
    }

    fn log_error(self, context_msg: String) -> anyhow::Result<T> {
        let res = self.context(context_msg);
        if let Err(e) = &res {
            error!("{:#}", e);
        }
        res
    }
}
