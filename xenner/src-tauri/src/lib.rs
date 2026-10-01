// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod config;
mod skin;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Antes que nada, que exista la carpeta de Xenner. La biblioteca de
            // notas la elige la persona y vive donde ella quiera, así que va
            // después: si `initialize` falla, la app no arranca, y no tiene
            // sentido haber creado una carpeta para una app que no abre.
            config::ensure(app.handle());
            app.manage(vault::initialize(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::config_info,
            config::reveal_config_dir,
            config::choose_skin_asset,
            skin::scan_skins,
            skin::read_skin_file,
            skin::read_skin_asset,
            skin::skin_file_stamp,
            skin::read_config,
            skin::set_active_skin,
            skin::create_skin,
            vault::choose_workspace,
            vault::scan_workspace,
            vault::read_note,
            vault::import_asset,
            vault::choose_image_asset,
            vault::read_asset,
            vault::update_asset,
            vault::delete_asset,
            vault::write_note,
            vault::create_note,
            vault::create_folder,
            vault::rename_entry,
            vault::move_entry,
            vault::delete_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
