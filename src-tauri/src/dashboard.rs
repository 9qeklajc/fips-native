use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use serde_json::{json, Value};

const CONTROL_SOCKETS: &[&str] = &[
    "/var/run/fips/control.sock",
    "/run/fips/control.sock",
    "/tmp/fips-control.sock",
];

async fn fipsctl(command: &str) -> Result<Value, String> {
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
        "command": command
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

#[tauri::command]
pub async fn get_info() -> Result<Value, String> {
    let (status, peers, links, tree, sessions, transports, bloom, mmp, routing, cache) = tokio::join!(
        fipsctl("show_status"),
        fipsctl("show_peers"),
        fipsctl("show_links"),
        fipsctl("show_tree"),
        fipsctl("show_sessions"),
        fipsctl("show_transports"),
        fipsctl("show_bloom"),
        fipsctl("show_mmp"),
        fipsctl("show_routing"),
        fipsctl("show_cache")
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
pub async fn get_monitor_data(tab: String) -> Result<Value, String> {
    match tab.as_str() {
        "Node" => {
            let status = fipsctl("show_status").await?;
            Ok(json!({ "status": status.get("status").cloned().unwrap_or(status) }))
        }
        "Peers" => {
            let peers = fipsctl("show_peers").await?;
            Ok(json!({ "peers": peers.get("peers").cloned().unwrap_or(peers) }))
        }
        "Transports" => {
            let transports = fipsctl("show_transports").await?;
            let links = fipsctl("show_links").await.unwrap_or(json!([]));
            Ok(json!({ 
                "transports": transports.get("transports").cloned().unwrap_or(transports),
                "links": links.get("links").cloned().unwrap_or(links)
            }))
        }
        "Sessions" => {
            let sessions = fipsctl("show_sessions").await?;
            Ok(json!({ "sessions": sessions.get("sessions").cloned().unwrap_or(sessions) }))
        }
        "Tree" => {
            let tree = fipsctl("show_tree").await?;
            Ok(json!({ "tree": tree.get("tree").cloned().unwrap_or(tree) }))
        }
        "Filters" => {
            let bloom = fipsctl("show_bloom").await?;
            Ok(json!({ "bloom": bloom.get("bloom").cloned().unwrap_or(bloom) }))
        }
        "Performance" => {
            let mmp = fipsctl("show_mmp").await?;
            Ok(json!({ "mmp": mmp.get("mmp").cloned().unwrap_or(mmp) }))
        }
        "Routing" => {
            let routing = fipsctl("show_routing").await.unwrap_or(json!({}));
            let cache = fipsctl("show_cache").await.unwrap_or(json!({}));
            Ok(json!({
                "routing": routing.get("routing").cloned().unwrap_or(routing),
                "cache": cache.get("cache").cloned().unwrap_or(cache),
            }))
        }
        _ => Err("Unknown tab".to_string()),
    }
}

#[tauri::command]
pub async fn explore_mesh() -> Result<(), String> {
    fipsctl("explore").await.map(|_| ())
}
