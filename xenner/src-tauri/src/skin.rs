//! Sistema de skins TXT de xenner.
//!
//! Escanea la carpeta `skins/` (subcarpetas con `skin.txt`) y sirve los TXT
//! de componentes al frontend. Regla de oro: **nunca falla** — si la carpeta
//! no existe, no hay permiso o un archivo está corrupto, se devuelve `[]` o
//! `Err(String)` para que el frontend aplique la skin default embebida.

use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

/// Ficheros de componente permitidos (evita path traversal: solo nombres
/// exactos de esta lista, sin `/`, `\` ni `..`).
const ALLOWED_FILES: &[&str] = &[
    "skin",
    "background",
    "button",
    "note",
    "sidebar",
    "input",
    "toolbar",
];

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
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Extrae `clave="valor"` de un TXT (misma regla que el parser del frontend:
/// `#` comentario, comillas opcionales, última definición gana).
fn txt_value(content: &str, key: &str) -> Option<String> {
    let mut found = None;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            if k.trim() == key {
                let v = v.trim();
                let v = v
                    .strip_prefix('"')
                    .and_then(|s| s.strip_suffix('"'))
                    .or_else(|| {
                        v.strip_prefix('\'')
                            .and_then(|s| s.strip_suffix('\''))
                    })
                    .unwrap_or(v);
                found = Some(v.to_string());
            }
        }
    }
    found
}

/// Localiza la carpeta de skins probando, en orden:
/// 1. `resource_dir/skins` (bundle con `"resources": ["../skins"]`)
/// 2. junto al ejecutable (dev / portable)
/// 3. `../skins` desde el cwd (típico `src-tauri` en `tauri dev`)
fn skins_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("skins");
        if p.is_dir() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for cand in [dir.join("skins"), dir.join("../skins")] {
                if cand.is_dir() {
                    return Some(cand);
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for cand in [cwd.join("../skins"), cwd.join("skins")] {
            if cand.is_dir() {
                return Some(cand);
            }
        }
    }
    None
}

/// Escanea `skins/` y lista las skins con `skin.txt` legible.
/// Nunca falla: sin carpeta o sin permiso devuelve `[]`.
#[tauri::command]
pub fn scan_skins(app: tauri::AppHandle) -> Vec<SkinInfo> {
    let Some(dir) = skins_dir(&app) else {
        return vec![];
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut skins: Vec<SkinInfo> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let id = e.file_name().to_string_lossy().into_owned();
            if !valid_skin_id(&id) {
                return None;
            }
            let manifest = std::fs::read_to_string(e.path().join("skin.txt")).ok()?;
            Some(SkinInfo {
                name: txt_value(&manifest, "name").unwrap_or_else(|| id.clone()),
                version: txt_value(&manifest, "version").unwrap_or_default(),
                author: txt_value(&manifest, "author").unwrap_or_default(),
                id,
            })
        })
        .collect();
    skins.sort_by(|a, b| a.id.cmp(&b.id));
    skins
}

/// Lee `skins/<skin>/<file>.txt`. Falla con `Err` si el id/fichero no son
/// válidos o el archivo no existe (el frontend aplica fallback embebido).
#[tauri::command]
pub fn read_skin_file(app: tauri::AppHandle, skin: String, file: String) -> Result<String, String> {
    if !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    if !ALLOWED_FILES.contains(&file.as_str()) {
        return Err("componente desconocido".into());
    }
    let Some(dir) = skins_dir(&app) else {
        return Err("carpeta skins no encontrada".into());
    };
    std::fs::read_to_string(dir.join(&skin).join(format!("{file}.txt")))
        .map_err(|_| format!("no se pudo leer {skin}/{file}.txt"))
}

/// Lee `skins/config.txt` (selector `skinPath="..."`).
/// Devuelve `""` si no existe: el frontend usa la default embebida.
#[tauri::command]
pub fn read_config(app: tauri::AppHandle) -> String {
    skins_dir(&app)
        .and_then(|dir| std::fs::read_to_string(dir.join("config.txt")).ok())
        .unwrap_or_default()
}
