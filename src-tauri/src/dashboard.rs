use std::path::PathBuf;
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
        "status": status.unwrap_or(json!({ "version": "-", "state": "stopped" })),
        "peers": peers.map(|v| v["peers"].clone()).unwrap_or(json!([])),
        "links": links.map(|v| v["links"].clone()).unwrap_or(json!([])),
        "tree": tree.unwrap_or(json!({ "is_root": true, "peers": [], "stats": {} })),
        "sessions": sessions.map(|v| v["sessions"].clone()).unwrap_or(json!([])),
        "transports": transports.map(|v| v["transports"].clone()).unwrap_or(json!([])),
        "bloom": bloom.unwrap_or(json!({})),
        "mmp": mmp.unwrap_or(json!({})),
        "routing": routing.map(|v| v["routing"].clone()).unwrap_or(json!([])),
        "cache": cache.unwrap_or(json!({})),
    }))
}

#[tauri::command]
pub async fn explore_mesh() -> Result<(), String> {
    fipsctl("explore").await.map(|_| ()).map_err(|e| e)
}
