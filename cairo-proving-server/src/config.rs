use crate::logger::LogMe;

#[derive(Debug)]
pub struct Config {
    pub concurrency_limit: Option<usize>,
    pub server_port: u16,
    pub routes_prefix: Option<String>,
}

impl Config {
    pub fn new() -> Config {
        let defaults = Config::default();

        let concurrency_limit = Self::load_opt_usize("CONCURRENCY_LIMIT");
        let server_port = Self::load_opt_u16("PORT");
        let routes_prefix = Self::load_opt_str("PREFIX");

        Config {
            server_port: server_port.unwrap_or(defaults.server_port),
            concurrency_limit: concurrency_limit.or(defaults.concurrency_limit),
            routes_prefix: routes_prefix.or(defaults.routes_prefix),
        }
    }

    #[inline]
    fn load_opt_usize(var_name: &str) -> Option<usize> {
        Self::load_opt_str(var_name).and_then(|str| {
            str.parse::<usize>()
                .log_error(format!("Parsing '{str}' as a usize"))
                .ok()
        })
    }

    #[inline]
    fn load_opt_u16(var_name: &str) -> Option<u16> {
        Self::load_opt_str(var_name).and_then(|str| {
            str.parse::<u16>()
                .log_error(format!("Parsing '{str}' as a u16"))
                .ok()
        })
    }

    #[inline]
    fn load_opt_str(var_name: &str) -> Option<String> {
        std::env::var(&var_name)
            .log_warn(format!("Loading env variable '{var_name}'"))
            .ok()
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            concurrency_limit: Some(1),
            server_port: 3000,
            routes_prefix: None,
        }
    }
}
