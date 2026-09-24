//! Backend de skins TXT de xenner.
//!
//! Todas las lecturas occurren fuera del hilo principal, están limitadas en
//! tamaño y rechazan rutas físicas fuera de la carpeta de skins. La UI nunca
//! recibe un error fatal: usa estos resultados para activar su default.

use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
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

    let stem = id.split('.').next().unwrap_or(id).to_ascii_uppercase();
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
        .filter(|c| !c.is_control())
        .take(MAX_METADATA_CHARS)
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn canonical_dir(candidate: PathBuf) -> Option<PathBuf> {
    if !is_plain_directory(&candidate) {
        return None;
    }
    fs::canonicalize(candidate).ok()
}

/// Localiza la carpeta de skins. El CWD solo participa en debug; en release
/// se usan roots conocidos del ejecutable y del bundle.
fn skins_dir(app: &AppHandle) -> Option<PathBuf> {
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

fn scan_skins_blocking(app: &AppHandle) -> Vec<SkinInfo> {
    let Some(dir) = skins_dir(app) else {
        return vec![];
    };
    let Ok(entries) = fs::read_dir(&dir) else {
        return vec![];
    };

    let mut skins = Vec::new();
    for (index, entry) in entries.flatten().enumerate() {
        if index >= MAX_SCAN_ENTRIES || skins.len() >= MAX_SKINS {
            break;
        }

        let entry_path = entry.path();
        if !is_plain_directory(&entry_path) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        if !valid_skin_id(&id) {
            continue;
        }

        let manifest_path = match safe_component_path(&dir, &id, "skin") {
            Ok(path) => path,
            Err(_) => continue,
        };
        let Ok(manifest) = read_limited_utf8(&manifest_path, MAX_MANIFEST_BYTES) else {
            continue;
        };

        skins.push(SkinInfo {
            name: clean_metadata(txt_value(&manifest, "name"), &id),
            version: clean_metadata(txt_value(&manifest, "version"), ""),
            author: clean_metadata(txt_value(&manifest, "author"), ""),
            id,
        });
    }

    skins.sort_by(|a, b| a.id.cmp(&b.id));
    skins
}

fn read_skin_file_blocking(app: &AppHandle, skin: String, file: String) -> Result<String, String> {
    if !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    if !ALLOWED_FILES.contains(&file.as_str()) {
        return Err("componente desconocido".into());
    }
    let dir = skins_dir(app).ok_or_else(|| "carpeta skins no encontrada".to_string())?;
    let path = safe_component_path(&dir, &skin, &file)?;
    read_limited_utf8(&path, MAX_COMPONENT_BYTES)
        .map_err(|_| format!("no se pudo leer {skin}/{file}.txt"))
}

fn read_config_blocking(app: &AppHandle) -> String {
    let Some(dir) = skins_dir(app) else {
        return String::new();
    };
    let path = dir.join("config.txt");
    if !is_regular_file(&path) {
        return String::new();
    }
    read_limited_utf8(&path, MAX_CONFIG_BYTES).unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

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
