//! FIPS node lifecycle management for Android.
//!
//! Owns the tokio runtime and the fips Node. Called from JNI entry points.

use anyhow::{Context, Result};
use fips::{Config, Node};
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tokio::runtime::Runtime;

pub static RUNNING: AtomicBool = AtomicBool::new(false);
static RUNTIME: Lazy<Mutex<Option<Runtime>>> = Lazy::new(|| Mutex::new(None));
static STATUS: Lazy<Mutex<NodeStatus>> = Lazy::new(|| Mutex::new(NodeStatus::default()));

/// Status snapshot returned to Kotlin via getStatus().
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct NodeStatus {
    pub running: bool,
    pub version: String,
    /// Node's FIPS address in bech32 (npub format).
    pub identity: Option<String>,
    pub peer_count: usize,
    /// "disabled" | "android_fd" | "active" | "failed"
    pub tun_state: String,
    pub error: Option<String>,
}

/// Start the FIPS mesh node.
///
/// - `tun_fd` – file descriptor of the Android VPN interface (from `ParcelFileDescriptor`).
/// - `data_dir` – app's internal files directory for identity key storage.
/// - `config_yaml` – optional YAML config string; empty string uses defaults.
pub fn start(tun_fd: i32, data_dir: &str, config_yaml: &str) -> Result<()> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        tracing::warn!("start() called while already running");
        return Ok(());
    }

    let data_dir = data_dir.to_owned();
    let config_yaml = config_yaml.to_owned();

    let rt = Runtime::new().context("failed to create tokio runtime")?;

    rt.spawn(async move {
        match run_node(tun_fd, &data_dir, &config_yaml).await {
            Ok(()) => tracing::info!("FIPS node exited cleanly"),
            Err(e) => {
                tracing::error!("FIPS node error: {e:#}");
                STATUS.lock().unwrap().error = Some(e.to_string());
            }
        }
        RUNNING.store(false, Ordering::SeqCst);
        STATUS.lock().unwrap().running = false;
    });

    *RUNTIME.lock().unwrap() = Some(rt);
    Ok(())
}

/// Stop the FIPS mesh node.
pub fn stop() {
    RUNNING.store(false, Ordering::SeqCst);
    if let Some(rt) = RUNTIME.lock().unwrap().take() {
        rt.shutdown_background();
    }
    let mut s = STATUS.lock().unwrap();
    s.running = false;
    s.tun_state = "disabled".to_string();
}

/// Return current status as a JSON string.
pub fn status_json() -> String {
    serde_json::to_string(&*STATUS.lock().unwrap())
        .unwrap_or_else(|_| r#"{"running":false}"#.to_string())
}

async fn run_node(tun_fd: i32, data_dir: &str, config_yaml: &str) -> Result<()> {
    tracing::info!("FIPS Android node starting (tun_fd={})", tun_fd);

    let mut config = build_config(config_yaml, data_dir)?;

    // Phase 1: disable fips's own TUN creation — VpnService owns the fd.
    // Phase 2: wire tun_fd via tun_android::activate() once from_fd lands in fips.
    config.tun.enabled = false;

    // DNS responder not needed on Android; VpnService routes handle DNS.
    config.dns.enabled = false;

    let mut node = Node::new(config).context("Node::new failed")?;
    node.start().await.context("node.start() failed")?;

    // Capture identity for status
    {
        let mut s = STATUS.lock().unwrap();
        s.running = true;
        s.tun_state = "android_fd".to_string();
        s.version = fips::version::short_version().to_string();
        // TODO: s.identity = Some(node.identity().npub());
    }

    tracing::info!("FIPS mesh node running");

    // Keep alive until stop() is called.
    while RUNNING.load(Ordering::SeqCst) {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        // TODO: poll node.peer_count() and update STATUS.peer_count
    }

    node.stop().await.context("node.stop() failed")?;
    tracing::info!("FIPS mesh node stopped");
    Ok(())
}

fn build_config(config_yaml: &str, _data_dir: &str) -> Result<Config> {
    // Phase 1: use an empty / default config so fips generates an ephemeral
    // identity on first run.  Phase 2 will persist the nsec to data_dir and
    // reload it by embedding it in the YAML passed from Kotlin.
    let config: Config = if config_yaml.is_empty() {
        Config::default()
    } else {
        serde_yaml::from_str(config_yaml).context("failed to parse config YAML")?
    };

    Ok(config)
}
