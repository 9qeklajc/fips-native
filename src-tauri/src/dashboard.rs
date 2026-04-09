use serde_json::{json, Value};
use tokio::sync::oneshot;
use tauri::State;
use crate::vpn::VpnState;
use fips::control::protocol::Request;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;

const CONTROL_SOCKETS: &[&str] = &[
    "/var/run/fips/control.sock",
    "/run/fips/control.sock",
    "/tmp/fips-control.sock",
    "/data/data/com.fips.app/fips-control.sock",
];

async fn fipsctl_socket(command: &str, params: Option<Value>) -> Result<Value, String> {
    let mut stream = None;
    for path in CONTROL_SOCKETS {
        if let Ok(s) = UnixStream::connect(path).await {
            stream = Some(s);
            break;
        }
    }

    let mut stream = stream.ok_or_else(|| {
        format!(
            "Failed to connect to control socket (tried: {})",
            CONTROL_SOCKETS.join(", ")
        )
    })?;

    let request = json!({
        "command": command,
        "params": params
    });

    let req_str = serde_json::to_string(&request).unwrap() + "\n";
    stream.write_all(req_str.as_bytes())
        .await
        .map_err(|e| format!("Failed to write to control socket: {}", e))?;

    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)
        .await
        .map_err(|e| format!("Failed to read from control socket: {}", e))?;

    let response: Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if response["status"] == "ok" {
        Ok(response["data"].clone())
    } else {
        Err(response["message"].as_str().unwrap_or("Unknown error").to_string())
    }
}

async fn fipsctl(state: &VpnState, command: &str, params: Option<Value>) -> Result<Value, String> {
    // Try in-process channel first (Android and internal node)
    let control_tx = {
        let tx_guard = state.inner.control_tx.lock().await;
        tx_guard.clone()
    };

    if let Some(tx) = control_tx {
        let (resp_tx, resp_rx) = oneshot::channel();
        let request = Request {
            command: command.to_string(),
            params: params.clone(),
        };

        if let Ok(_) = tx.send((request, resp_tx)).await {
            match tokio::time::timeout(std::time::Duration::from_secs(2), resp_rx).await {
                Ok(Ok(response)) => {
                    if response.status == "ok" {
                        return Ok(response.data.unwrap_or(Value::Null));
                    } else {
                        return Err(response.message.unwrap_or_else(|| "Unknown error".to_string()));
                    }
                }
                Ok(Err(_)) => { /* channel closed, fall through to socket */ }
                Err(_) => { /* timeout, fall through to socket */ }
            }
        }
    }

    // Fallback to Unix socket
    fipsctl_socket(command, params).await
}

#[tauri::command]
pub async fn get_info(state: State<'_, VpnState>) -> Result<Value, String> {
    let (status, peers, links, tree, sessions, transports, bloom, mmp, routing, cache) = tokio::join!(
        fipsctl(&state, "show_status", None),
        fipsctl(&state, "show_peers", None),
        fipsctl(&state, "show_links", None),
        fipsctl(&state, "show_tree", None),
        fipsctl(&state, "show_sessions", None),
        fipsctl(&state, "show_transports", None),
        fipsctl(&state, "show_bloom", None),
        fipsctl(&state, "show_mmp", None),
        fipsctl(&state, "show_routing", None),
        fipsctl(&state, "show_cache", None)
    );

    Ok(json!({
        "status": status.ok().and_then(|v| v.get("status").cloned().or(Some(v.clone()))).unwrap_or(json!({ "version": "-", "state": "stopped" })),
        "peers": peers.ok().and_then(|v| v.get("peers").cloned().or(Some(v.clone()))).unwrap_or(json!([])),
        "links": links.ok().and_then(|v| v.get("links").cloned().or(Some(v.clone()))).unwrap_or(json!([])),
        "tree": tree.ok().and_then(|v| v.get("tree").cloned().or(Some(v.clone()))).unwrap_or(json!({ "is_root": true, "peers": [], "stats": {} })),
        "sessions": sessions.ok().and_then(|v| v.get("sessions").cloned().or(Some(v.clone()))).unwrap_or(json!([])),
        "transports": transports.ok().and_then(|v| v.get("transports").cloned().or(Some(v.clone()))).unwrap_or(json!([])),
        "bloom": bloom.ok().and_then(|v| v.get("bloom").cloned().or(Some(v.clone()))).unwrap_or(json!({})),
        "mmp": mmp.ok().and_then(|v| v.get("mmp").cloned().or(Some(v.clone()))).unwrap_or(json!({})),
        "routing": routing.ok().and_then(|v| v.get("routing").cloned().or(Some(v.clone()))).unwrap_or(json!({})),
        "cache": cache.ok().and_then(|v| v.get("cache").cloned().or(Some(v.clone()))).unwrap_or(json!({})),
    }))
}

#[tauri::command]
pub async fn get_monitor_data(state: State<'_, VpnState>, tab: String) -> Result<Value, String> {
    match tab.as_str() {
        "Node" => {
            let status = fipsctl(&state, "show_status", None).await?;
            Ok(json!({ "status": status.get("status").cloned().unwrap_or(status) }))
        }
        "Peers" => {
            let peers = fipsctl(&state, "show_peers", None).await?;
            Ok(json!({ "peers": peers.get("peers").cloned().unwrap_or(peers) }))
        }
        "Transports" => {
            let transports = fipsctl(&state, "show_transports", None).await?;
            let links = fipsctl(&state, "show_links", None).await.unwrap_or(json!([]));
            Ok(json!({ 
                "transports": transports.get("transports").cloned().unwrap_or(transports),
                "links": links.get("links").cloned().unwrap_or(links)
            }))
        }
        "Sessions" => {
            let sessions = fipsctl(&state, "show_sessions", None).await?;
            Ok(json!({ "sessions": sessions.get("sessions").cloned().unwrap_or(sessions) }))
        }
        "Tree" => {
            let tree = fipsctl(&state, "show_tree", None).await?;
            Ok(json!({ "tree": tree.get("tree").cloned().unwrap_or(tree) }))
        }
        "Filters" => {
            let bloom = fipsctl(&state, "show_bloom", None).await?;
            Ok(json!({ "bloom": bloom.get("bloom").cloned().unwrap_or(bloom) }))
        }
        "Performance" => {
            let mmp = fipsctl(&state, "show_mmp", None).await?;
            Ok(json!({ "mmp": mmp.get("mmp").cloned().unwrap_or(mmp) }))
        }
        "Routing" => {
            let routing = fipsctl(&state, "show_routing", None).await.unwrap_or(json!({}));
            let cache = fipsctl(&state, "show_cache", None).await.unwrap_or(json!({}));
            Ok(json!({
                "routing": routing.get("routing").cloned().unwrap_or(routing),
                "cache": cache.get("cache").cloned().unwrap_or(cache),
            }))
        }
        _ => Err("Unknown tab".to_string()),
    }
}

#[tauri::command]
pub async fn explore_mesh(state: State<'_, VpnState>) -> Result<(), String> {
    fipsctl(&state, "explore", None).await.map(|_| ())
}

#[tauri::command]
pub async fn ping_node(_state: State<'_, VpnState>, target: String) -> Result<Value, String> {
    let ping_target = if target.starts_with("npub") {
        match fips::identity::PeerIdentity::from_npub(&target) {
            Ok(id) => id.address().to_string(),
            Err(e) => return Err(format!("Invalid npub: {}", e)),
        }
    } else {
        target
    };

    #[cfg(target_os = "macos")]
    {
        let output = tokio::process::Command::new("ping6")
            .arg("-c")
            .arg("4")
            .arg(&ping_target)
            .output()
            .await;

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            return Ok(json!(format!("{}{}", stdout, stderr)));
        } else if let Err(e) = output {
            return Err(format!("Failed to execute ping6: {}", e));
        }
    }

    #[cfg(target_os = "android")]
    {
        let output = tokio::process::Command::new("ping")
            .arg("-c")
            .arg("4")
            .arg(&ping_target)
            .output()
            .await;

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            return Ok(json!(format!("{}{}", stdout, stderr)));
        } else if let Err(e) = output {
            return Err(format!("Failed to execute ping: {}", e));
        }
    }

    // Fallback for other platforms (e.g. Linux)
    let output = tokio::process::Command::new("ping")
        .arg("-c")
        .arg("4")
        .arg(&ping_target)
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            Ok(json!(format!("{}{}", stdout, stderr)))
        }
        Err(e) => Err(format!("Failed to execute ping: {}", e)),
    }
}
