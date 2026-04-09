#[tauri::command]
pub fn start_vpn() -> Result<(), String> {
    println!("Requesting VPN start...");
    Ok(())
}

#[tauri::command]
pub fn stop_vpn() -> Result<(), String> {
    println!("Requesting VPN stop...");
    Ok(())
}
