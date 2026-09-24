fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "scan_skins",
            "read_skin_file",
            "read_config",
            "set_active_skin",
            "create_skin",
            "choose_workspace",
            "scan_workspace",
            "read_note",
            "import_asset",
            "read_asset",
            "write_note",
            "create_note",
            "create_folder",
            "rename_entry",
            "delete_entry",
        ]),
    ))
    .expect("failed to build the Tauri application manifest");
}
