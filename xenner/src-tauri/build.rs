fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["scan_skins", "read_skin_file", "read_config"]),
    ))
    .expect("failed to build the Tauri application manifest");
}
