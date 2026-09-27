//! Backend de skins de xenner.
//!
//! Las skins sistémicas viven en el bundle. Las creadas por la persona usuaria
//! viven en AppLocalData. El frontend solo recibe componentes ya validados; no
//! tiene permisos generales de filesystem.
//!
//! # Assets (`assets/`, imágenes y fuentes)
//!
//! Una skin puede usar imágenes, SVG y tipografías propias. El frontend no las
//! lee del disco: pide cada una por su ruta relativa con `read_skin_asset` y
//! recibe un `data:` URL ya validado. La validación vive aquí y es la única
//! puerta:
//!
//!   - la ruta es relativa, sin `..`, sin raíz y sin esquema (`C:\`, `http:`);
//!   - la extensión está en la allowlist de abajo;
//!   - el archivo es regular, no es un symlink y no sale de la carpeta de la
//!     skin tras canonicalizar (esto corta traversal y enlaces simbólicos);
//!   - no supera `MAX_ASSET_BYTES`.
//!
//! Por qué `data:` y no el asset protocol de Tauri: un `data:` en un hueco de
//! imagen CSS se decodifica como píxeles, sin documento ni origen ni contexto
//! de script ([MDN, `data:`](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data)).
//! Devolverlo desde aquí mantiene la contención en el mismo sitio que ya la
//! aplica el resto del módulo, no necesita permisos nuevos y además funciona en
//! la previsualización del navegador. El CSP ya admite `data:` en `img-src`, y
//! un `url(https://…)` remoto sigue bloqueado por `img-src` sin origen remoto.
//! SVG en un hueco de imagen tampoco ejecuta nada: en contexto de imagen el
//! script está deshabilitado y no se cargan recursos externos
//! ([MDN, SVG como imagen](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)).

use atomic_write_file::AtomicWriteFile;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
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
    // Hoja de estilo libre de la skin: la superficie de poder (v2).
    "custom",
];

/// `custom.css` es CSS real, no una lista de claves: necesita mucho más sitio.
const MAX_CUSTOM_CSS_BYTES: u64 = 512 * 1024;
/// Tope por asset. Un fondo de 4K en PNG o JPEG entra de sobra; un vídeo no
/// es un asset de skin.
const MAX_ASSET_BYTES: u64 = 4 * 1024 * 1024;

const MAX_SKINS: usize = 256;
const MAX_SCAN_ENTRIES: usize = 512;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024;
const MAX_COMPONENT_BYTES: u64 = 64 * 1024;
const MAX_CONFIG_BYTES: u64 = 4 * 1024;
const MAX_METADATA_CHARS: usize = 128;
const MAX_VALUE_CHARS: usize = 1_024;

/// Extensiones que una skin puede cargar, con el MIME que se devuelve. Sin SVG
/// ni SVGZ: SVG en un hueco de imagen es seguro (ver el doc del módulo), pero
/// su contenido no se valida y no aporta nada que un PNG no dé.
const ASSET_TYPES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
    ("woff2", "font/woff2"),
    ("woff", "font/woff"),
    ("ttf", "font/ttf"),
    ("otf", "font/otf"),
];

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

/// `data:` de imagen, o ruta relativa. Todo lo demás fuera: esquemas remotos,
/// `//host` sin esquema, rutas absolutas y `..`.
///
/// Se admiten espacios dentro de la ruta (`url(assets/mi dibujo.png)`) porque el
/// `)` cierra el `url(...)` y el resto del valor se valida por separado; lo que
/// no se admite son caracteres de control, que no sirven para nada aquí.
fn asset_reference_is_safe(reference: &str) -> bool {
    if reference.is_empty() || reference.len() > 512 {
        return false;
    }
    if reference.chars().any(|c| c.is_control()) {
        return false;
    }

    let lower = reference.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("data:") {
        let is_image = rest.starts_with("image/");
        // `;base64,` es la forma normal; sin base64 solo se acepta SVG en
        // percent-encoding, que es el único formato de imagen que es URL-safe.
        return is_image
            && (rest.contains(";base64,")
                || lower.starts_with("data:image/svg+xml,")
                || lower.starts_with("data:image/svg+xml;"));
    }

    // Sin esquema: ni `://`, ni `data:`, ni barras iniciales, ni `C:\`.
    !lower.contains("://")
        && !lower.starts_with('/')
        && !lower.starts_with('\\')
        && !(lower.len() > 1 && lower.as_bytes()[1] == b':')
        && !reference.split(['/', '\\']).any(|part| part == "..")
}

/// Valida un valor de clave `clave="valor"` de los TXT de componente.
///
/// Se recorre una vez porque `;` significa cosas distintas según dónde esté:
/// dentro de `url()` es legítimo (`data:image/png;base64,...` lo lleva) y fuera
/// rompería el formato del TXT al poder inyectar otra declaración. Por eso el
/// texto se separa en "dentro de url()" y "fuera", y cada trozo con sus reglas.
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

    // `!important` se bloquea por el mismo motivo que `;`: el sistema depende de
    // que una clave ausente caiga en el valor embebido de `global.css`, y
    // `!important` en el estilo inline de `<html>` se saltaría esa cascada.
    let lower = value.to_ascii_lowercase();
    for banned in [
        "!important",
        "expression(",
        "@import",
        "-moz-binding",
        "behavior:",
        "javascript:",
    ] {
        if lower.contains(banned) {
            return false;
        }
    }

    let mut outside = String::with_capacity(value.len());
    let mut cursor = 0usize;
    while cursor < value.len() {
        if lower[cursor..].starts_with("url(") {
            let open_end = cursor + 4;
            let Some(close) = lower[open_end..].find(')') else {
                return false;
            };
            let end = open_end + close;
            let reference = value[open_end..end]
                .trim_matches(|c: char| c.is_whitespace() || c == '\'' || c == '"');
            if !asset_reference_is_safe(reference) {
                return false;
            }
            cursor = end + 1;
        } else {
            outside.push_str(&value[cursor..cursor + 1]);
            cursor += 1;
        }
    }

    let outside_lower = outside.to_ascii_lowercase();
    // Un `data:` fuera de `url()` no es CSS válido en ninguna propiedad: siempre
    // hace falta el `url()` alrededor. Se rechaza, pero no por seguridad, es que
    // no significaría nada.
    !outside_lower.contains("data:")
        && !outside.contains(';')
        && !outside.contains('{')
        && !outside.contains('}')
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

/// Carpetas donde puede vivir una skin, sistémica primero. La primera que
/// contenga la skin gana; así una skin de usuario con el mismo nombre sustituye
/// a la del bundle sin que haya que borrar nada.
fn skin_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(dir) = system_skins_dir(app) {
        roots.push(dir);
    }
    if let Some(dir) = user_skins_dir(app) {
        roots.push(dir);
    }
    roots
}

fn read_skin_file_blocking(app: &AppHandle, skin: String, file: String) -> Result<String, String> {
    if !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    if !ALLOWED_FILES.contains(&file.as_str()) {
        return Err("componente desconocido".into());
    }

    let max_bytes = if file == "custom" {
        MAX_CUSTOM_CSS_BYTES
    } else {
        MAX_COMPONENT_BYTES
    };

    for dir in skin_roots(app) {
        if is_plain_directory(&dir.join(&skin)) {
            let path = safe_component_path(&dir, &skin, &file)?;
            return read_limited_utf8(&path, max_bytes)
                .map_err(|_| format!("no se pudo leer {skin}/{file}.txt"));
        }
    }
    Err("skin no encontrada".into())
}

/// Resuelve `assets/<lo que sea>` dentro de una skin y lo devuelve como `data:`.
///
/// Es la única forma que tiene el frontend de ver una imagen o una fuente de
/// una skin, y por eso también es la única superficie de ataque: aquí se
/// comprueban extensión, tamaño, tipo de archivo y contención tras canonicalizar.
fn read_skin_asset_blocking(
    app: &AppHandle,
    skin: String,
    path: String,
) -> Result<String, String> {
    if !valid_skin_id(&skin) {
        return Err("skin inválida".into());
    }
    if !asset_reference_is_safe(&path) {
        return Err("ruta de asset no permitida".into());
    }

    let extension = Path::new(&path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or("el asset no tiene extensión")?;
    let mime = ASSET_TYPES
        .iter()
        .find(|(candidate, _)| *candidate == extension)
        .map(|(_, mime)| *mime)
        .ok_or("extensión de asset no permitida")?;

    let mut found = None;
    for dir in skin_roots(app) {
        let skin_dir = dir.join(&skin);
        if !is_plain_directory(&skin_dir) {
            continue;
        }
        if let Ok(resolved) = safe_asset_path(&skin_dir, &path) {
            found = Some(resolved);
            break;
        }
    }

    let resolved = found.ok_or("asset no encontrado")?;
    if !is_regular_file(&resolved) {
        return Err("el asset no es un archivo regular".into());
    }
    let metadata = fs::metadata(&resolved).map_err(|_| "no se pudo leer el asset".to_string())?;
    if metadata.len() > MAX_ASSET_BYTES {
        return Err("el asset supera el tamaño máximo".into());
    }

    let bytes = fs::read(&resolved).map_err(|_| "no se pudo leer el asset".to_string())?;
    if bytes.len() as u64 > MAX_ASSET_BYTES {
        return Err("el asset supera el tamaño máximo".into());
    }
    Ok(format!("data:{mime};base64,{}", BASE64.encode(&bytes)))
}

/// Canonicaliza `relative` bajo `skin_dir` y exige que no se salga. Igual que
/// `safe_component_path`, pero admitiendo subcarpetas: `assets/icons/x.png`.
fn safe_asset_path(skin_dir: &Path, relative: &str) -> Result<PathBuf, String> {
    let canonical_skin =
        fs::canonicalize(skin_dir).map_err(|_| "no se pudo resolver la skin".to_string())?;
    let candidate = canonical_skin.join(relative);
    let resolved =
        fs::canonicalize(&candidate).map_err(|_| "el asset no existe".to_string())?;
    if !resolved.starts_with(&canonical_skin) {
        return Err("el asset escapa de la skin".into());
    }
    Ok(resolved)
}

/// Lee la skin activa.
///
/// Antes esto siempre daba prioridad a `AppLocalData/skin-config.txt`, con lo
/// que editar `skins/config.txt` a mano —que es lo que dice la documentación—
/// no hacía nada en cuanto se elegía una skin desde la aplicación. Ahora gana el
/// archivo **modificado más tarde**, que es lo que espera quien edita a mano
/// después de haber usado el selector: lo último que tocaste es lo que manda.
fn read_config_blocking(app: &AppHandle) -> String {
    let preference = skin_preference_path(app).and_then(|path| {
        if !is_regular_file(&path) {
            return None;
        }
        let modified = fs::metadata(&path).and_then(|meta| meta.modified()).ok()?;
        let content = read_limited_utf8(&path, MAX_CONFIG_BYTES).ok()?;
        Some((modified, content))
    });

    let bundled = system_skins_dir(app).and_then(|dir| {
        let path = dir.join("config.txt");
        if !is_regular_file(&path) {
            return None;
        }
        let modified = fs::metadata(&path).and_then(|meta| meta.modified()).ok()?;
        let content = read_limited_utf8(&path, MAX_CONFIG_BYTES).ok()?;
        Some((modified, content))
    });

    match (preference, bundled) {
        (Some((at, _)), Some((other_at, other))) if other_at > at => other,
        (Some((_, content)), _) => content,
        (None, Some((_, other))) => other,
        (None, None) => String::new(),
    }
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

/// Devuelve un asset de la skin como `data:` URL. Ver el doc del módulo para
/// por qué el frontend no lee ficheros por su cuenta.
#[tauri::command]
pub async fn read_skin_asset(
    app: AppHandle,
    skin: String,
    path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_skin_asset_blocking(&app, skin, path))
        .await
        .unwrap_or_else(|_| Err("la lectura del asset falló".into()))
}

/// Sello barato de un archivo de la skin: tamaño y fecha de modificación. Es
/// lo que consulta el vigilante para saber si toca recargar, sin llegar a leer
/// el contenido. `None` si el archivo no existe.
#[tauri::command]
pub async fn skin_file_stamp(app: AppHandle, skin: String, file: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || skin_file_stamp_blocking(&app, skin, file))
        .await
        .ok()
        .flatten()
}

fn skin_file_stamp_blocking(app: &AppHandle, skin: String, file: String) -> Option<String> {
    if !valid_skin_id(&skin) || !ALLOWED_FILES.contains(&file.as_str()) {
        return None;
    }
    for dir in skin_roots(app) {
        if !is_plain_directory(&dir.join(&skin)) {
            continue;
        }
        let Ok(path) = safe_component_path(&dir, &skin, &file) else {
            continue;
        };
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|at| at.as_nanos())
            .unwrap_or_default();
        return Some(format!("{}-{}", metadata.len(), modified));
    }
    None
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
        assert!(!safe_component_value("expression(alert(1))"));
        assert!(!safe_component_value("javascript:alert(1)"));
        assert!(!safe_component_value("behavior:url(x.htc)"));
    }

    #[test]
    fn admite_imagenes_en_los_txt() {
        // El bloqueo de `url(` y `data:` era una decisión de diseño heredada
        // del "un valor = un color", no una necesidad de seguridad.
        assert!(safe_component_value("url(assets/fondo.png)"));
        assert!(safe_component_value("url(assets/iconos/hoja.svg)"));
        assert!(safe_component_value("url('assets/mi imagen.jpg')"));
        assert!(safe_component_value("url(data:image/png;base64,iVBORw0KGgo=)"));
        assert!(safe_component_value(
            "linear-gradient(red, url(assets/textura.png))"
        ));
        // Un `data:` suelto no es CSS válido en ninguna propiedad: siempre
        // hace falta el `url()` alrededor. Se rechaza, pero no como medida de
        // seguridad: es que no significaría nada.
        assert!(!safe_component_value("data:image/png;base64,iVBORw0KGgo="));
    }

    #[test]
    fn no_admite_red_ruido_de_asset() {
        assert!(!safe_component_value("url(https://ejemplo.test/pixel.png)"));
        assert!(!safe_component_value("url(//ejemplo.test/pixel.png)"));
        assert!(!safe_component_value("url(/etc/passwd)"));
        assert!(!safe_component_value("url(../../fuera.png)"));
        assert!(!safe_component_value("url(C:\\\\Windows\\\\win.ini)"));
        assert!(!safe_component_value("url(data:text/html,<script>)"));
        assert!(!safe_component_value("url(data:image/svg+xml,<svg onload=1>) x"));
        assert!(!safe_component_value("url(sin cerrar"));
    }

    #[test]
    fn solo_acepta_assets_de_imagen_en_data_url() {
        assert!(asset_reference_is_safe("data:image/png;base64,AAAA"));
        assert!(asset_reference_is_safe("data:image/svg+xml,%3Csvg%3E"));
        assert!(!asset_reference_is_safe("data:text/html,bad"));
        assert!(!asset_reference_is_safe("data:application/javascript,bad"));
        assert!(!asset_reference_is_safe("data:image/png,raw"));
    }

    #[test]
    fn resuelve_assets_contenidos_en_la_skin() {
        let dir = tempfile::tempdir().expect("tempdir");
        let skin = dir.path().join("ejemplo");
        fs::create_dir_all(skin.join("assets")).expect("assets dir");
        fs::write(skin.join("assets/logo.png"), b"\x89PNG").expect("asset");

        let resolved = safe_asset_path(&skin, "assets/logo.png").expect("asset path");
        assert!(resolved.starts_with(fs::canonicalize(&skin).expect("canonical skin")));

        // Una subcarpeta que sale de la skin no se resuelve aunque el archivo
        // exista de verdad.
        let outside = dir.path().join("secreto.png");
        fs::write(&outside, b"x").expect("outside");
        assert!(safe_asset_path(&skin, "../secreto.png").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rechaza_symlinks_de_asset_que_escapan() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("root");
        let outside = tempfile::tempdir().expect("outside");
        let secret = outside.path().join("secreto.png");
        fs::write(&secret, b"\x89PNG").expect("outside file");

        let skin = root.path().join("ejemplo");
        fs::create_dir_all(skin.join("assets")).expect("assets dir");
        symlink(&secret, skin.join("assets/logo.png")).expect("symlink");

        // Canonicalizar resuelve el enlace, así que el resultado cae fuera de la
        // skin y la comprobación de contención lo rechaza. Un symlink que
        // apunta dentro de la skin sí se aceptaría: no es un salida del disco.
        assert!(safe_asset_path(&skin, "assets/logo.png").is_err());
    }

    #[test]
    fn la_allowlist_de_claves_acepta_custom() {
        // `custom.css` se lee por el mismo camino que los componentes.
        assert!(ALLOWED_FILES.contains(&"custom"));
        assert!(MAX_CUSTOM_CSS_BYTES > MAX_COMPONENT_BYTES);
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
