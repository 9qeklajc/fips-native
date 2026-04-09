use serde::{Deserialize, Serialize};

#[tauri::command]
pub async fn get_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": { "version": "0.3.0-dev", "state": "running" },
        "peers": [],
        "links": [],
        "tree": { "is_root": true, "peers": [], "stats": {} },
        "sessions": [],
        "transports": []
    }))
}

#[tauri::command]
pub async fn explore_mesh() -> Result<(), String> {
    Ok(())
}
