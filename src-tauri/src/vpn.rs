use fips::{Config, Node};
use fips::config::TransportInstances;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tauri::State;
use std::sync::Arc;

macro_rules! info { ($($arg:tt)*) => { println!($($arg)*) } }
macro_rules! warn { ($($arg:tt)*) => { eprintln!($($arg)*) } }
macro_rules! error { ($($arg:tt)*) => { eprintln!($($arg)*) } }

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
                bind_addr: "127.0.0.1".to_string(),
                port: 5354,
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

pub struct VpnState {
    pub inner: Arc<VpnStateInner>,
}

pub struct VpnStateInner {
    pub node_running: Mutex<bool>,
    pub stop_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub stopped_rx: Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
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
        start_vpn_internal(&state.inner, None).await?;
    }
    
    Ok(())
}

async fn start_vpn_internal(state: &Arc<VpnStateInner>, tun_fd: Option<i32>) -> Result<(), String> {
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
    
    config.tun.enabled = app_config.tun.enabled;
    config.tun.name = Some(app_config.tun.name.clone());
    config.tun.mtu = Some(app_config.tun.mtu);
    
    config.dns.enabled = app_config.dns.enabled;
    config.dns.bind_addr = Some(app_config.dns.bind_addr.clone());
    config.dns.port = Some(app_config.dns.port);
    
    config.node.control.enabled = true;
    config.node.control.socket_path = "/tmp/fips-control.sock".to_string();

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
    
    let current_fd = tun_fd.or(*state.tun_fd.lock().await);

    if let Some(fd) = current_fd {
        info!("Starting node with FD: {}", fd);
        node.start_with_tun_fd(fd as std::os::unix::io::RawFd).await.map_err(|e| format!("Failed to start node with FD: {}", e))?;
    } else {
        node.start().await.map_err(|e| format!("Failed to start node: {}", e))?;
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
    start_vpn_internal(&state.inner, tun_fd).await
}

#[tauri::command]
pub async fn stop_vpn(state: State<'_, VpnState>) -> Result<(), String> {
    stop_vpn_internal(&state.inner).await
}
