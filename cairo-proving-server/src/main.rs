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

mod endpoints;
mod logger;

#[tokio::main]
async fn main() -> Result<()> {
    setup_logger().context("Setup logger")?;

    info!("Starting Cairo Http!");
    info!("0.0.0.0:3000");

    let routes = Router::new()
        .route("/prove", post(endpoints::prove_handler))
        .layer(ConcurrencyLimitLayer::new(1))
        .layer(CorsLayer::permissive())
        .layer(DefaultBodyLimit::disable()) // Danger, on limite plus la taille
        .route("/verify", post(endpoints::verify_handler));

    // If there is a prefix env variable, we add it to the routes
    let app = if let Ok(prefix) = std::env::var("PREFIX") {
        Router::new().nest(prefix.as_str(), routes)
    } else {
        routes
    }
    .route("/health", get(endpoints::health_handler));

    // run our app with hyper
    // `axum::Server` is a re-export of `hyper::Server`
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let tcp_listener = TcpListener::bind(addr).await?;

    axum::serve(tcp_listener, app.into_make_service())
        .await
        .context("Starting http server")
}
