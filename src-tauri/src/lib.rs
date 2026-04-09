mod vpn;
mod dashboard;
use tracing::info;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Android logging
    #[cfg(target_os = "android")]
    {
        use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, Layer};
        tracing_subscriber::registry()
            .with(tracing_android::layer("com.fips.app").unwrap()
                .with_filter(tracing_subscriber::filter::LevelFilter::INFO))
            .init();
    }
    
    info!("FIPS Native Library initializing...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
        .setup(|app| {
            info!("Tauri setup complete. App version: {}", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
