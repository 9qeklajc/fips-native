use fips::config::TransportInstances;
use fips::control::ControlMessage;
use fips::{Config, Node};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::{mpsc, Mutex};
use once_cell::sync::Lazy;

#[cfg(target_os = "android")]
use jni::{JNIEnv, objects::{JClass, JString}};

use tracing::{info, warn, error};

pub static VPN_STATE: Lazy<VpnState> = Lazy::new(|| VpnState::new());

#[cfg(target_os = "android")]
static RUNTIME: Lazy<std::sync::Mutex<Option<tokio::runtime::Runtime>>> = Lazy::new(|| std::sync::Mutex::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub node: NodeSection,
    pub tun: TunSection,
    pub dns: DnsSection,
    pub transports: TransportsSection,
    pub peers: Vec<PeerSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSection {
    pub persistent: bool,
    pub nsec: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunSection {
    pub enabled: bool,
    pub name: String,
    pub mtu: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsSection {
    pub enabled: bool,
    pub bind_addr: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportsSection {
    pub udp_enabled: bool,
    pub udp_bind_addr: String,
    pub tcp_enabled: bool,
    pub tcp_bind_addr: String,
    pub ethernet_enabled: bool,
    pub ethernet_interface: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerSection {
    pub npub: String,
    pub alias: String,
    pub address: String,
    pub transport: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            node: NodeSection {
                persistent: true,
                nsec: None,
            },
            tun: TunSection {
                enabled: true,
                name: "fips0".to_string(),
                mtu: 1280,
            },
            dns: DnsSection {
                enabled: true,
                bind_addr: "10.1.1.1".to_string(),
                port: 53,
            },
            transports: TransportsSection {
                udp_enabled: true,
                udp_bind_addr: "0.0.0.0:2121".to_string(),
                tcp_enabled: true,
                tcp_bind_addr: "0.0.0.0:8443".to_string(),
                ethernet_enabled: false,
                ethernet_interface: "en0".to_string(),
            },
            peers: vec![PeerSection {
                npub: "npub1qmc3cvfz0yu2hx96nq3gp55zdan2qclealn7xshgr448d3nh6lks7zel98".to_string(),
                alias: "fips-test-node".to_string(),
                address: "217.77.8.91:2121".to_string(),
                transport: "udp".to_string(),
            }],
        }
    }
}

#[derive(Clone)]
pub struct VpnState {
    pub inner: Arc<VpnStateInner>,
}

pub struct VpnStateInner {
    pub node_running: Mutex<bool>,
    pub stop_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub stopped_rx: Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
    pub control_tx: Mutex<Option<mpsc::Sender<ControlMessage>>>,
    pub config: Mutex<AppConfig>,
    pub tun_fd: Mutex<Option<i32>>,
}

impl VpnState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(VpnStateInner {
                node_running: Mutex::new(false),
                stop_tx: Mutex::new(None),
                stopped_rx: Mutex::new(None),
                control_tx: Mutex::new(None),
                config: Mutex::new(AppConfig::default()),
                tun_fd: Mutex::new(None),
            }),
        }
    }
}

#[tauri::command]
pub async fn get_config(state: State<'_, VpnState>) -> Result<AppConfig, String> {
    let config = state.inner.config.lock().await;
    Ok(config.clone())
}

#[tauri::command]
pub async fn update_config(state: State<'_, VpnState>, config: AppConfig) -> Result<(), String> {
    {
        let mut current_config = state.inner.config.lock().await;
        *current_config = config;
    }

    // Check if node is running
    let running = state.inner.node_running.lock().await;
    if *running {
        info!("Configuration updated while node is running. Restarting node...");
        drop(running);

        let _ = stop_vpn_internal(&state.inner).await;
        start_vpn_internal(&state.inner, None, None).await?;
    }

    Ok(())
}

async fn start_vpn_internal(state: &Arc<VpnStateInner>, tun_fd: Option<i32>, socket_path: Option<String>) -> Result<(), String> {
    let mut running = state.node_running.lock().await;
    if *running {
        return Err("VPN is already running".to_string());
    }

    if let Some(fd) = tun_fd {
        *state.tun_fd.lock().await = Some(fd);
    }

    let app_config = state.config.lock().await.clone();

    let mut config = Config::default();
    config.node.identity.persistent = app_config.node.persistent;
    config.node.identity.nsec = app_config.node.nsec.clone();

    let current_fd = tun_fd.or(*state.tun_fd.lock().await);

    // If we have an FD, disable auto-creation of TUN in the config passed to Node::new
    config.tun.enabled = current_fd.is_none() && app_config.tun.enabled;
    config.tun.name = Some(app_config.tun.name.clone());
    config.tun.mtu = Some(app_config.tun.mtu);

    config.dns.enabled = app_config.dns.enabled;
    #[cfg(target_os = "android")]
    {
        // Force DNS to bind to the VPN-accessible IP on Android
        config.dns.bind_addr = Some("10.1.1.1".to_string());
        config.dns.port = Some(53);
    }
    #[cfg(not(target_os = "android"))]
    {
        config.dns.bind_addr = Some(app_config.dns.bind_addr.clone());
        config.dns.port = Some(app_config.dns.port);
    }

    config.node.control.enabled = true;
    if let Some(path) = socket_path {
        config.node.control.socket_path = path;
    } else {
        #[cfg(target_os = "android")]
        {
            // Use a path in the internal data directory that we know is writeable
            config.node.control.socket_path = "/data/data/com.fips.app/fips-control.sock".to_string();
        }
        #[cfg(not(target_os = "android"))]
        {
            config.node.control.socket_path = "/tmp/fips-control.sock".to_string();
        }
    }

    if app_config.transports.udp_enabled {
        config.transports.udp = TransportInstances::Single(fips::config::UdpConfig {
            bind_addr: Some(app_config.transports.udp_bind_addr.clone()),
            ..Default::default()
        });
    }

    if app_config.transports.tcp_enabled {
        config.transports.tcp = TransportInstances::Single(fips::config::TcpConfig {
            bind_addr: Some(app_config.transports.tcp_bind_addr.clone()),
            ..Default::default()
        });
    }

    if app_config.transports.ethernet_enabled {
        config.transports.ethernet = TransportInstances::Single(fips::config::EthernetConfig {
            interface: app_config.transports.ethernet_interface.clone(),
            discovery: Some(true),
            announce: Some(true),
            auto_connect: Some(true),
            accept_connections: Some(true),
            ..Default::default()
        });
    }

    for p in app_config.peers {
        config.peers.push(fips::config::PeerConfig {
            npub: p.npub,
            alias: Some(p.alias),
            addresses: vec![fips::config::PeerAddress::new(&p.transport, &p.address)],
            connect_policy: fips::config::ConnectPolicy::AutoConnect,
            auto_reconnect: true,
        });
    }

    let resolved = fips::config::resolve_identity(&config, &[])
        .map_err(|e| format!("Failed to resolve identity: {}", e))?;
    config.node.identity.nsec = Some(resolved.nsec);

    let mut node = Node::new(config).map_err(|e| format!("Failed to create node: {}", e))?;

    // Set up in-process control channel
    let control_tx = node.set_control_channel();
    *state.control_tx.lock().await = Some(control_tx);

    let current_fd = tun_fd.or(*state.tun_fd.lock().await);

    if let Some(fd) = current_fd {
        info!("Starting node with FD: {}", fd);
        node.start_with_tun_fd(fd as std::os::unix::io::RawFd)
            .await
            .map_err(|e| format!("Failed to start node with FD: {}", e))?;
    } else {
        node.start()
            .await
            .map_err(|e| format!("Failed to start node: {}", e))?;
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    let (done_tx, done_rx) = tokio::sync::oneshot::channel();

    *state.stop_tx.lock().await = Some(tx);
    *state.stopped_rx.lock().await = Some(done_rx);
    *running = true;

    let state_inner = Arc::clone(state);
    tokio::spawn(async move {
        info!("Node RX loop starting...");
        tokio::select! {
            result = node.run_rx_loop() => {
                if let Err(e) = result {
                    error!("Node RX loop error: {}", e);
                }
            }
            _ = rx => {
                info!("Shutdown signal received, stopping node...");
            }
        }

        let saved_fd = node.take_tun_fd();
        if let Some(fd) = saved_fd {
            *state_inner.tun_fd.lock().await = Some(fd as i32);
        }

        if let Err(e) = node.stop().await {
            warn!("Error stopping node: {}", e);
        }

        let mut running = state_inner.node_running.lock().await;
        *running = false;
        let _ = done_tx.send(());
        info!("Node stopped.");
    });

    Ok(())
}

async fn stop_vpn_internal(state: &VpnStateInner) -> Result<(), String> {
    let mut stop_tx_opt = state.stop_tx.lock().await;
    if let Some(tx) = stop_tx_opt.take() {
        let _ = tx.send(());

        // Wait for the node to actually stop
        let mut rx_opt = state.stopped_rx.lock().await;
        if let Some(rx) = rx_opt.take() {
            let _ = rx.await;
        }
        Ok(())
    } else {
        Err("VPN is not running".to_string())
    }
}

#[tauri::command]
pub async fn start_vpn(state: State<'_, VpnState>, tun_fd: Option<i32>) -> Result<(), String> {
    start_vpn_internal(&state.inner, tun_fd, None).await
}

#[tauri::command]
pub async fn stop_vpn(state: State<'_, VpnState>) -> Result<(), String> {
    stop_vpn_internal(&state.inner).await
}

#[cfg(target_os = "android")]
#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn Java_com_fips_app_FipsService_startRustServer(
    mut env: JNIEnv,
    _class: JClass,
    base_path: JString,
    tun_fd: jni::sys::jint,
) {
    let base_path_str: String = env
        .get_string(&base_path)
        .expect("Couldn't get java string!")
        .into();

    let socket_path = std::path::Path::new(&base_path_str).join("fips-control.sock").to_string_lossy().to_string();

    let tun_fd_opt = if tun_fd >= 0 { Some(tun_fd as i32) } else { None };

    let mut runtime_guard = RUNTIME.lock().unwrap();
    if runtime_guard.is_none() {
        *runtime_guard = Some(tokio::runtime::Runtime::new().expect("Failed to create tokio runtime"));
    }

    if let Some(rt) = runtime_guard.as_ref() {
        rt.spawn(async move {
            info!("Starting FIPS background server with socket path: {} and tun_fd: {:?}", socket_path, tun_fd_opt);
            let _: Result<(), String> = start_vpn_internal(&VPN_STATE.inner, tun_fd_opt, Some(socket_path)).await;
        });
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn Java_com_fips_app_FipsService_stopRustServer(
    _env: JNIEnv,
    _class: JClass,
) {
    let runtime_guard = RUNTIME.lock().unwrap();
    if let Some(rt) = runtime_guard.as_ref() {
        rt.block_on(async {
            let _: Result<(), String> = stop_vpn_internal(&VPN_STATE.inner).await;
        });
    }
}

