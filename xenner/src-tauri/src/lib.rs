// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod skin;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            skin::scan_skins,
            skin::read_skin_file,
            skin::read_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
