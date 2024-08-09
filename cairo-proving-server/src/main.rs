use crate::logger::setup_logger;

use anyhow::{Context, Result};
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;
use log::info;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower::limit::ConcurrencyLimitLayer;
use tower_http::cors::CorsLayer;

mod config;
mod endpoints;
mod logger;

#[tokio::main]
async fn main() -> Result<()> {
    setup_logger().context("Setup logger")?;

    let config = config::Config::new();

    info!("Starting Cairo HTTP with:\n{:#?}", config);

    let mut routes = Router::new()
        .route("/prove", post(endpoints::prove_handler))
        .layer(CorsLayer::permissive())
        .layer(DefaultBodyLimit::disable()) // Danger, on limite plus la taille
        .route("/verify", post(endpoints::verify_handler));

    // If there is a prefix env variable, we add it to the routes
    if let Some(prefix) = config.routes_prefix {
        routes = Router::new().nest(prefix.as_str(), routes)
    }

    // Set concurrency limit
    if let Some(cl) = config.concurrency_limit {
        routes = routes.layer(ConcurrencyLimitLayer::new(cl));
    }

    routes = routes.route("/health", get(endpoints::health_handler));

    // run our app with hyper
    // `axum::Server` is a re-export of `hyper::Server`
    let addr = SocketAddr::from(([0, 0, 0, 0], config.server_port));
    let tcp_listener = TcpListener::bind(addr).await?;

    axum::serve(tcp_listener, routes.into_make_service())
        .await
        .context("Starting http server")
}
