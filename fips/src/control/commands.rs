//! Mutating control socket commands.
//!
//! Commands that modify node state (connect, disconnect) are handled here,
//! separate from read-only queries in `queries.rs`.

use super::protocol::Response;
use crate::node::Node;
use hex;
use serde_json::Value;
use tracing::debug;

/// Dispatch a mutating command to the appropriate handler.
pub async fn dispatch(
    node: &mut Node,
    command: &str,
    params: Option<&Value>,
    response_tx: tokio::sync::oneshot::Sender<Response>,
) {
    match command {
        "connect" => {
            let resp = connect(node, params).await;
            let _ = response_tx.send(resp);
        }
        "disconnect" => {
            let resp = disconnect(node, params);
            let _ = response_tx.send(resp);
        }
        "start_tun" => {
            let resp = start_tun(node, params).await;
            let _ = response_tx.send(resp);
        }
        "stop_tun" => {
            let resp = stop_tun(node).await;
            let _ = response_tx.send(resp);
        }
        "ping" => ping(node, params, response_tx).await,
        "explore" => {
            let resp = explore(node, params).await;
            let _ = response_tx.send(resp);
        }
        _ => {
            let _ = response_tx.send(Response::error(format!("unknown command: {command}")));
        }
    }
}

/// Ping a node.
///
/// Params: `{"target": "npub1..."}` or `{"target": "node_addr_hex"}`
async fn ping(
    node: &mut Node,
    params: Option<&Value>,
    response_tx: tokio::sync::oneshot::Sender<Response>,
) {
    let Some(params) = params else {
        let _ = response_tx.send(Response::error("missing params for ping"));
        return;
    };

    let target_str = match params.get("target").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => {
            let _ = response_tx.send(Response::error("missing 'target' parameter"));
            return;
        }
    };

    let target_addr = if target_str.starts_with("npub") {
        match crate::PeerIdentity::from_npub(target_str) {
            Ok(id) => *id.node_addr(),
            Err(e) => {
                let _ = response_tx.send(Response::error(format!("invalid npub: {e}")));
                return;
            }
        }
    } else {
        match hex::decode(target_str) {
            Ok(bytes) => {
                if bytes.len() != 16 {
                    let _ = response_tx.send(Response::error(
                        "invalid node address length (expected 16 bytes)",
                    ));
                    return;
                }
                let mut addr = [0u8; 16];
                addr.copy_from_slice(&bytes);
                crate::NodeAddr::from_bytes(addr)
            }
            Err(e) => {
                let _ = response_tx.send(Response::error(format!("invalid hex: {e}")));
                return;
            }
        }
    };

    let my_addr = *node.node_addr();
    let src_ipv6 = crate::FipsAddress::from_node_addr(&my_addr).to_ipv6();
    let dst_ipv6 = crate::FipsAddress::from_node_addr(&target_addr).to_ipv6();

    let seq = node.next_ping_seq;
    node.next_ping_seq = node.next_ping_seq.wrapping_add(1);

    // Register the pending ping
    node.pending_pings
        .insert((target_addr, seq), (std::time::Instant::now(), response_tx));

    // Construct ICMPv6 Echo Request
    let packet = crate::upper::icmp::build_echo_request(
        src_ipv6,
        dst_ipv6,
        0, // ID
        seq,
        b"FIPS Native Ping",
    );

    // Send it
    node.handle_tun_outbound(packet).await;
}

/// Explore the mesh by triggering discovery on all known tree peers' bloom filter contents.
/// (Placeholder implementation that triggers discovery on all active peers)
async fn explore(node: &mut Node, _params: Option<&Value>) -> Response {
    let peer_addrs: Vec<crate::NodeAddr> = node.peer_ids().cloned().collect();
    let mut triggered = 0;

    for addr in peer_addrs {
        node.maybe_initiate_lookup(&addr).await;
        triggered += 1;
    }

    Response::ok(serde_json::json!({
        "triggered_lookups": triggered
    }))
}

/// Connect to a peer.
///
/// Params: `{"npub": "npub1...", "address": "host:port", "transport": "udp"}`
async fn connect(node: &mut Node, params: Option<&Value>) -> Response {
    let Some(params) = params else {
        return Response::error("missing params for connect");
    };

    let npub = match params.get("npub").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return Response::error("missing 'npub' parameter"),
    };
    let address = match params.get("address").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return Response::error("missing 'address' parameter"),
    };
    let transport = match params.get("transport").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return Response::error("missing 'transport' parameter"),
    };

    debug!(npub = %npub, address = %address, transport = %transport, "API connect requested");

    match node.api_connect(npub, address, transport).await {
        Ok(data) => Response::ok(data),
        Err(msg) => Response::error(msg),
    }
}

/// Disconnect a peer.
///
/// Params: `{"npub": "npub1..."}`
fn disconnect(node: &mut Node, params: Option<&Value>) -> Response {
    let Some(params) = params else {
        return Response::error("missing params for disconnect");
    };

    let npub = match params.get("npub").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => return Response::error("missing 'npub' parameter"),
    };

    debug!(npub = %npub, "API disconnect requested");

    match node.api_disconnect(npub) {
        Ok(data) => Response::ok(data),
        Err(msg) => Response::error(msg),
    }
}

/// Start the TUN interface.
async fn start_tun(node: &mut Node, params: Option<&Value>) -> Response {
    let tun_fd = params
        .and_then(|p| p.get("fd"))
        .and_then(|v| v.as_i64())
        .map(|fd| fd as std::os::unix::io::RawFd);

    match node.start_tun(tun_fd).await {
        Ok(()) => Response::ok(serde_json::json!({"status": "active"})),
        Err(e) => Response::error(e.to_string()),
    }
}

/// Stop the TUN interface.
async fn stop_tun(node: &mut Node) -> Response {
    match node.stop_tun().await {
        Ok(()) => Response::ok(serde_json::json!({"status": "disabled"})),
        Err(e) => Response::error(e.to_string()),
    }
}
