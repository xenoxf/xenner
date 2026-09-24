//! Backend de skins TXT de xenner.
//!
//! Las skins sistémicas viven en el bundle. Las creadas por la persona usuaria
//! viven en AppLocalData. El frontend solo recibe componentes ya validados; no
//! tiene permisos generales de filesystem.

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const USER_SKINS_DIR: &str = "skins";
const SKIN_PREFERENCE_FILE: &str = "skin-config.txt";
const ALLOWED_FILES: &[&str] = &[
    "skin",
    "background",
    "button",
    "note",
    "sidebar",
    "input",
    "toolbar",
];

const MAX_SKINS: usize = 256;
const MAX_SCAN_ENTRIES: usize = 512;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024;
const MAX_COMPONENT_BYTES: u64 = 64 * 1024;
const MAX_CONFIG_BYTES: u64 = 4 * 1024;
const MAX_METADATA_CHARS: usize = 128;
const MAX_VALUE_CHARS: usize = 1_024;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkinOrigin {
    System,
    User,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub origin: SkinOrigin,
    pub editable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkinRequest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub components: BTreeMap<String, BTreeMap<String, String>>,
}

/// Solo carpetas con caracteres seguros pueden ser skins.
fn valid_skin_id(id: &str) -> bool {
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }

    let stem = id.to_ascii_uppercase();
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    !RESERVED.contains(&stem.as_str())
}

fn is_regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_plain_directory(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

/// Lee como máximo `max_bytes`, incluso si el archivo crece mientras se lee.
fn read_limited_utf8(path: &Path, max_bytes: u64) -> io::Result<String> {
    if !is_regular_file(path) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "no es un archivo regular",
        ));
    }
    let file = File::open(path)?;
    if file.metadata()?.len() > max_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "archivo demasiado grande",
        ));
    }

    let mut content = String::new();
    file.take(max_bytes + 1).read_to_string(&mut content)?;
    if content.len() as u64 > max_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "archivo demasiado grande",
        ));
    }
    Ok(content)
}

fn write_atomically(path: &Path, content: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = AtomicWriteFile::open(path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    file.commit()?;
    Ok(())
}

/// Extrae `clave="valor"` de un manifiesto TXT.
fn txt_value(content: &str, key: &str) -> Option<String> {
    let mut found = None;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((candidate, value)) = line.split_once('=') else {
            continue;
        };
        if candidate.trim() != key {
            continue;
        }

        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                value
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(value);
        found = Some(value.to_string());
    }
    found
}

fn clean_metadata(value: Option<String>, fallback: &str) -> String {
    let value = value.unwrap_or_default();
    let cleaned: String = value
        .trim()
        .chars()
        .filter(|c| !c.is_control() && *c != '"' && *c != '\\')
        .take(MAX_METADATA_CHARS)
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn safe_component_value(value: &str) -> bool {
    if value.is_empty() || value.len() > MAX_VALUE_CHARS {
        return false;
    }
    if value
        .chars()
        .any(|character| character.is_control() || character == '<' || character == '>')
    {
        return false;
    }
    let normalized = value.to_ascii_lowercase();
    if normalized.contains("!important")
        || normalized.contains("url(")
        || normalized.contains("expression(")
        || normalized.contains("@import")
        || normalized.contains("-moz-binding")
        || normalized.contains("javascript:")
        || normalized.contains("data:")
        || value.contains(';')
        || value.contains('{')
        || value.contains('}')
    {
        return false;
    }
    true
}

fn allowed_component_keys(file: &str) -> Option<&'static [&'static str]> {
    match file {
        "background" => Some(&[
            "background",
            "text",
            "textDim",
            "border",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
            "overlay",
        ]),
        "button" => Some(&[
            "background",
            "backgroundHover",
            "text",
            "textHover",
            "border",
            "borderHover",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
        ]),
        "note" => Some(&[
            "background",
            "backgroundHover",
            "text",
            "border",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
        ]),
        "sidebar" => Some(&[
            "background",
            "text",
            "textDim",
            "itemHover",
            "itemActive",
            "border",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
        ]),
        "input" => Some(&[
            "background",
            "text",
            "placeholder",
            "border",
            "focus",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
        ]),
        "toolbar" => Some(&[
            "background",
            "backgroundHover",
            "text",
            "textDim",
            "border",
            "radius",
            "blur",
            "shadow",
            "accent",
            "font",
        ]),
        _ => None,
    }
}

fn canonical_dir(candidate: PathBuf) -> Option<PathBuf> {
    if !is_plain_directory(&candidate) {
        return None;
    }
    fs::canonicalize(candidate).ok()
}

/// Localiza la carpeta de skins sistémicas. El CWD solo participa en debug;
/// en release se usan roots conocidos del ejecutable y del bundle.
fn system_skins_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(path) = canonical_dir(resource_dir.join("skins")) {
            return Some(path);
        }
    }

    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            for candidate in [parent.join("skins"), parent.join("../skins")] {
                if let Some(path) = canonical_dir(candidate) {
                    return Some(path);
                }
            }
        }
    }

    #[cfg(debug_assertions)]
    if let Ok(cwd) = std::env::current_dir() {
        for candidate in [cwd.join("../skins"), cwd.join("skins")] {
            if let Some(path) = canonical_dir(candidate) {
                return Some(path);
            }
        }
    }

    None
}

fn user_skins_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|path| path.join(USER_SKINS_DIR))
}

fn skin_preference_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|path| path.join(SKIN_PREFERENCE_FILE))
}

/// Resuelve un componente y verifica containment físico. Esto bloquea tanto
/// traversal literal como enlaces simbólicos que apuntan fuera de la raíz.
fn safe_component_path(root: &Path, skin: &str, file: &str) -> Result<PathBuf, String> {
    let skin_path = root.join(skin);
    if !is_plain_directory(&skin_path) {
        return Err("skin no encontrada".into());
    }

    let canonical_root =
        fs::canonicalize(root).map_err(|_| "no se pudo resolver la carpeta skins".to_string())?;
    let canonical_skin =
        fs::canonicalize(&skin_path).map_err(|_| "no se pudo resolver la skin".to_string())?;
    if !canonical_skin.starts_with(&canonical_root) {
        return Err("la skin escapa de la carpeta permitida".into());
    }

    let component_path = canonical_skin.join(format!("{file}.txt"));
    if !is_regular_file(&component_path) {
        return Err("componente no encontrado".into());
    }
    let canonical_component = fs::canonicalize(&component_path)
        .map_err(|_| "no se pudo resolver el componente".to_string())?;
    if !canonical_component.starts_with(&canonical_skin) {
        return Err("el componente escapa de la skin".into());
    }

    Ok(canonical_component)
}

fn scan_skins_in_dir(
    dir: &Path,
    origin: SkinOrigin,
    result: &mut Vec<SkinInfo>,
    seen: &mut HashSet<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut children = entries.flatten().collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.file_name());

    for (index, entry) in children.into_iter().enumerate() {
        if index >= MAX_SCAN_ENTRIES || result.len() >= MAX_SKINS {
            return;
        }
        let entry_path = entry.path();
        if !is_plain_directory(&entry_path) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        if !valid_skin_id(&id) || !seen.insert(id.clone()) {
            continue;
        }

        let manifest_path = match safe_component_path(dir, &id, "skin") {
            Ok(path) => path,
            Err(_) => {
                seen.remove(&id);
                continue;
            }
        };
        let Ok(manifest) = read_limited_utf8(&manifest_path, MAX_MANIFEST_BYTES) else {
            seen.remove(&id);
            continue;
        };

        result.push(SkinInfo {
            name: clean_metadata(txt_value(&manifest, "name"), &id),
            version: clean_metadata(txt_value(&manifest, "version"), ""),
            author: clean_metadata(txt_value(&manifest, "author"), ""),
            id,
            origin,
            editable: origin == SkinOrigin::User,
        });
    }
}

fn scan_skins_blocking(app: &AppHandle) -> Vec<SkinInfo> {
    let mut skins = Vec::new();
    let mut seen = HashSet::new();
    if let Some(dir) = system_skins_dir(app) {
        scan_skins_in_dir(&dir, SkinOrigin::System, &mut skins, &mut seen);
    }
    if let Some(dir) = user_skins_dir(app).filter(|dir| is_plain_directory(dir)) {
        scan_skins_in_dir(&dir, SkinOrigin::User, &mut skins, &mut seen);
    }
    skins.sort_by(|left, right| left.id.cmp(&right.id));
    skins
}

fn read_skin_file_blocking(app: &AppHandle, skin: String, file: String) -> Result<String, String> {
    if !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    if !ALLOWED_FILES.contains(&file.as_str()) {
        return Err("componente desconocido".into());
    }

    let mut roots = Vec::new();
    if let Some(dir) = system_skins_dir(app) {
        roots.push(dir);
    }
    if let Some(dir) = user_skins_dir(app) {
        roots.push(dir);
    }
    for dir in roots {
        if is_plain_directory(&dir.join(&skin)) {
            let path = safe_component_path(&dir, &skin, &file)?;
            return read_limited_utf8(&path, MAX_COMPONENT_BYTES)
                .map_err(|_| format!("no se pudo leer {skin}/{file}.txt"));
        }
    }
    Err("skin no encontrada".into())
}

fn read_config_blocking(app: &AppHandle) -> String {
    if let Some(path) = skin_preference_path(app) {
        if is_regular_file(&path) {
            if let Ok(content) = read_limited_utf8(&path, MAX_CONFIG_BYTES) {
                return content;
            }
        }
    }
    let Some(dir) = system_skins_dir(app) else {
        return String::new();
    };
    let path = dir.join("config.txt");
    if !is_regular_file(&path) {
        return String::new();
    }
    read_limited_utf8(&path, MAX_CONFIG_BYTES).unwrap_or_default()
}

fn set_active_skin_blocking(app: &AppHandle, skin: String) -> Result<(), String> {
    if !skin.is_empty() && !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    let path = skin_preference_path(app).ok_or("no se pudo resolver AppLocalData")?;
    let content = format!("skinPath=\"{skin}\"\n");
    write_atomically(&path, &content).map_err(|error| format!("no se pudo guardar skin: {error}"))
}

fn manifest_content(request: &CreateSkinRequest) -> String {
    let name = clean_metadata(Some(request.name.clone()), &request.id);
    let version = clean_metadata(Some(request.version.clone()), "");
    let author = clean_metadata(Some(request.author.clone()), "Xenner");
    format!("name=\"{name}\"\nversion=\"{version}\"\nauthor=\"{author}\"\n")
}

fn validate_component_request(
    request: &CreateSkinRequest,
) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    for (component, values) in &request.components {
        let Some(allowed) = allowed_component_keys(component) else {
            return Err(format!("componente desconocido: {component}"));
        };
        let mut content = String::new();
        for (key, value) in values {
            if !allowed.contains(&key.as_str()) || !safe_component_value(value) {
                return Err(format!("valor no permitido en {component}.{key}"));
            }
            content.push_str(key);
            content.push_str("=\"");
            content.push_str(value);
            content.push_str("\"\n");
        }
        files.push((component.clone(), content));
    }
    if files.is_empty() {
        return Err("la skin necesita al menos un componente".into());
    }
    Ok(files)
}

fn create_skin_blocking(app: &AppHandle, request: CreateSkinRequest) -> Result<SkinInfo, String> {
    if !valid_skin_id(&request.id) {
        return Err("identificador de skin inválido".into());
    }
    let files = validate_component_request(&request)?;
    let user_dir = user_skins_dir(app).ok_or("no se pudo resolver AppLocalData")?;
    fs::create_dir_all(&user_dir).map_err(|error| error.to_string())?;
    if !is_plain_directory(&user_dir) {
        return Err("la carpeta de skins de usuario no es accesible".into());
    }
    if let Some(system_dir) = system_skins_dir(app) {
        if is_plain_directory(&system_dir.join(&request.id)) {
            return Err("ya existe una skin sistémica con ese identificador".into());
        }
    }
    let final_dir = user_dir.join(&request.id);
    if fs::symlink_metadata(&final_dir).is_ok() {
        return Err("ya existe una skin con ese identificador".into());
    }

    let temporary_dir = user_dir.join(format!(".xenner-{}-tmp", request.id));
    if fs::symlink_metadata(&temporary_dir).is_ok() {
        let _ = fs::remove_dir_all(&temporary_dir);
    }
    fs::create_dir(&temporary_dir).map_err(|error| error.to_string())?;
    let result = (|| {
        write_atomically(&temporary_dir.join("skin.txt"), &manifest_content(&request))
            .map_err(|error| error.to_string())?;
        for (component, content) in files {
            write_atomically(&temporary_dir.join(format!("{component}.txt")), &content)
                .map_err(|error| error.to_string())?;
        }
        fs::rename(&temporary_dir, &final_dir).map_err(|error| error.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&temporary_dir);
        return Err(error);
    }

    Ok(SkinInfo {
        name: clean_metadata(Some(request.name), &request.id),
        version: clean_metadata(Some(request.version), ""),
        author: clean_metadata(Some(request.author), "Xenner"),
        id: request.id,
        origin: SkinOrigin::User,
        editable: true,
    })
}

#[tauri::command]
pub async fn scan_skins(app: AppHandle) -> Vec<SkinInfo> {
    tauri::async_runtime::spawn_blocking(move || scan_skins_blocking(&app))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn read_skin_file(app: AppHandle, skin: String, file: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_skin_file_blocking(&app, skin, file))
        .await
        .unwrap_or_else(|_| Err("la lectura de la skin falló".into()))
}

#[tauri::command]
pub async fn read_config(app: AppHandle) -> String {
    tauri::async_runtime::spawn_blocking(move || read_config_blocking(&app))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn set_active_skin(app: AppHandle, skin: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_active_skin_blocking(&app, skin))
        .await
        .map_err(|_| "no se pudo guardar la skin activa".to_string())?
}

#[tauri::command]
pub async fn create_skin(app: AppHandle, request: CreateSkinRequest) -> Result<SkinInfo, String> {
    tauri::async_runtime::spawn_blocking(move || create_skin_blocking(&app, request))
        .await
        .map_err(|_| "no se pudo crear la skin".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valida_identificadores_de_skin() {
        assert!(valid_skin_id("frosted-glass_2"));
        assert!(!valid_skin_id(""));
        assert!(!valid_skin_id("../escape"));
        assert!(!valid_skin_id("with/slash"));
        assert!(!valid_skin_id("ñ"));
        assert!(!valid_skin_id(&"a".repeat(65)));
        assert!(!valid_skin_id("CON"));
        assert!(!valid_skin_id("com1"));
    }

    #[test]
    fn txt_value_gana_con_la_ultima_definicion() {
        let content = "# comment\nname=\"first\"\nname='second'\nversion=1.0";
        assert_eq!(txt_value(content, "name").as_deref(), Some("second"));
        assert_eq!(txt_value(content, "version").as_deref(), Some("1.0"));
        assert_eq!(txt_value(content, "author"), None);
    }

    #[test]
    fn limita_el_tamano_de_archivos() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("component.txt");
        let mut file = File::create(&path).expect("create");
        file.write_all(b"12345678").expect("write");
        assert!(read_limited_utf8(&path, 4).is_err());
        assert_eq!(read_limited_utf8(&path, 8).expect("read"), "12345678");
    }

    #[test]
    fn rechaza_valores_de_componente_inseguros() {
        assert!(safe_component_value("#fff"));
        assert!(!safe_component_value("red; background: black"));
        assert!(!safe_component_value("url(https://example.com)"));
        assert!(!safe_component_value("expression(alert(1))"));
        assert!(!safe_component_value("javascript:alert(1)"));
    }

    #[test]
    fn resuelve_componentes_contenidos() {
        let dir = tempfile::tempdir().expect("tempdir");
        let skin = dir.path().join("example");
        fs::create_dir(&skin).expect("skin dir");
        fs::write(skin.join("note.txt"), "text=\"white\"").expect("component");

        let path = safe_component_path(dir.path(), "example", "note").expect("safe path");
        assert!(path.starts_with(fs::canonicalize(dir.path()).expect("canonical root")));
    }

    #[cfg(unix)]
    #[test]
    fn rechaza_symlinks_que_escapan_de_la_raiz() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("root");
        let outside = tempfile::tempdir().expect("outside");
        let outside_file = outside.path().join("note.txt");
        fs::write(&outside_file, "text=\"white\"").expect("outside file");

        let skin = root.path().join("example");
        fs::create_dir(&skin).expect("skin dir");
        symlink(&outside_file, skin.join("note.txt")).expect("file symlink");

        assert!(safe_component_path(root.path(), "example", "note").is_err());
    }
}
