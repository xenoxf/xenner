// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod skin;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(vault::initialize(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            skin::scan_skins,
            skin::read_skin_file,
            skin::read_config,
            skin::set_active_skin,
            skin::create_skin,
            vault::choose_workspace,
            vault::scan_workspace,
            vault::read_note,
            vault::import_asset,
            vault::read_asset,
            vault::write_note,
            vault::create_note,
            vault::create_folder,
            vault::rename_entry,
            vault::delete_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
