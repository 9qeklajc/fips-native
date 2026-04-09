mod vpn;
mod dashboard;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            dashboard::get_info,
            dashboard::get_monitor_data,
            dashboard::explore_mesh,
            dashboard::ping_node,
            vpn::start_vpn,
            vpn::stop_vpn,
            vpn::get_config,
            vpn::update_config
        ])
        .manage(vpn::VpnState::new())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
