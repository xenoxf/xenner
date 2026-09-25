//! Backend seguro para una biblioteca local de notas Markdown.
//!
//! El frontend nunca recibe permisos generales de filesystem. Solo puede pedir
//! operaciones sobre la raíz activa, que Rust conserva en su estado. Las rutas
//! relativas se validan, los symlinks se rechazan y cada escritura se hace de
//! forma atómica y con comprobación de revisión.

use atomic_write_file::AtomicWriteFile;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use blake3::Hasher;
use serde::Serialize;
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_WORKSPACE_DIR: &str = "workspace";
const WORKSPACE_PREFERENCE_FILE: &str = "workspace.txt";
const MAX_NOTE_BYTES: u64 = 2_000_000;
const NOTE_TITLE_MAX_CHARS: usize = 240;
const MAX_ASSET_BYTES: usize = 8_000_000;
const ASSET_DIRECTORY: &str = ".assets";
const MAX_RELATIVE_PATH_BYTES: usize = 1_024;
const MAX_WORKSPACE_PATH_BYTES: usize = 32_768;
const MAX_PATH_COMPONENTS: usize = 64;
const MAX_NAME_BYTES: usize = 180;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SCAN_ENTRIES: usize = 20_000;
const MAX_PREFERENCE_BYTES: u64 = 32 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultError {
    pub code: String,
    pub message: String,
}

impl VaultError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for VaultError {}

impl From<io::Error> for VaultError {
    fn from(error: io::Error) -> Self {
        let code = match error.kind() {
            io::ErrorKind::NotFound => "notFound",
            io::ErrorKind::PermissionDenied => "permissionDenied",
            io::ErrorKind::AlreadyExists => "alreadyExists",
            _ => "io",
        };
        Self::new(code, error.to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Directory,
    Note,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub updated_at: Option<u64>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub root: String,
    pub note_count: usize,
    pub entry_count: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceScan {
    pub info: VaultInfo,
    pub entries: Vec<VaultEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocument {
    pub path: String,
    pub title: String,
    pub body: String,
    pub revision: String,
    pub updated_at: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteResult {
    pub entry: CreatedEntry,
    pub document: NoteDocument,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPayload {
    pub mime: String,
    pub data_base64: String,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAsset {
    pub relative_path: String,
    pub mime: String,
    pub data_base64: String,
    pub revision: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteAcknowledgement {
    pub path: String,
    pub revision: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedEntry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
}

#[derive(Debug)]
pub struct VaultSession {
    root: PathBuf,
}

pub type VaultState = Mutex<VaultSession>;

fn invalid_path(message: impl Into<String>) -> VaultError {
    VaultError::new("invalidPath", message)
}

fn not_found(message: impl Into<String>) -> VaultError {
    VaultError::new("notFound", message)
}

fn conflict(message: impl Into<String>) -> VaultError {
    VaultError::new("conflict", message)
}

fn internal(message: impl Into<String>) -> VaultError {
    VaultError::new("internal", message)
}

fn is_plain_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_plain_directory(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn modified_millis(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis()
        .try_into()
        .ok()
}

fn current_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| duration.as_millis().try_into().ok())
        .unwrap_or(0)
}

fn workspace_preference_path(app: &AppHandle) -> Result<PathBuf, VaultError> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join(WORKSPACE_PREFERENCE_FILE))
        .map_err(|error| {
            VaultError::new("io", format!("no se pudo resolver AppLocalData: {error}"))
        })
}

fn read_limited_text(path: &Path, max_bytes: u64) -> Result<String, VaultError> {
    if !is_plain_file(path) {
        return Err(not_found("la preferencia de biblioteca no existe"));
    }
    let file = File::open(path)?;
    if file.metadata()?.len() > max_bytes {
        return Err(VaultError::new("tooLarge", "preferencia demasiado grande"));
    }

    let mut content = String::new();
    file.take(max_bytes + 1).read_to_string(&mut content)?;
    if content.len() as u64 > max_bytes {
        return Err(VaultError::new("tooLarge", "preferencia demasiado grande"));
    }
    Ok(content)
}

fn write_atomically(path: &Path, content: &str) -> Result<(), VaultError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = AtomicWriteFile::open(path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    file.commit()?;
    Ok(())
}

fn default_workspace(app: &AppHandle) -> Result<PathBuf, VaultError> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| {
            VaultError::new("io", format!("no se pudo resolver AppLocalData: {error}"))
        })?
        .join(DEFAULT_WORKSPACE_DIR);
    fs::create_dir_all(&root)?;
    canonical_workspace(&root)
}

fn preferred_workspace(app: &AppHandle) -> Option<PathBuf> {
    let preference_path = workspace_preference_path(app).ok()?;
    let raw = read_limited_text(&preference_path, MAX_PREFERENCE_BYTES).ok()?;
    let candidate = PathBuf::from(raw.trim());
    canonical_workspace(&candidate).ok()
}

pub fn initialize(app: &AppHandle) -> Result<VaultState, VaultError> {
    let default_root = default_workspace(app)?;
    let root = preferred_workspace(app).unwrap_or(default_root);
    Ok(Mutex::new(VaultSession { root }))
}

fn canonical_workspace(candidate: &Path) -> Result<PathBuf, VaultError> {
    if !candidate.is_absolute() {
        return Err(invalid_path("la biblioteca debe usar una ruta absoluta"));
    }
    if !is_plain_directory(candidate) {
        return Err(not_found(
            "la carpeta de biblioteca no existe o no es accesible",
        ));
    }
    let canonical = fs::canonicalize(candidate)?;
    if !is_plain_directory(&canonical) {
        return Err(not_found("la carpeta de biblioteca no es válida"));
    }
    Ok(canonical)
}

fn root_from_state(state: &State<'_, VaultState>) -> Result<PathBuf, VaultError> {
    state
        .lock()
        .map(|session| session.root.clone())
        .map_err(|_| internal("estado de biblioteca bloqueado"))
}

fn relative_components(relative_path: &str, allow_empty: bool) -> Result<Vec<&str>, VaultError> {
    if relative_path.is_empty() {
        if allow_empty {
            return Ok(Vec::new());
        }
        return Err(invalid_path("la ruta relativa está vacía"));
    }
    if relative_path.len() > MAX_RELATIVE_PATH_BYTES {
        return Err(invalid_path("la ruta relativa es demasiado larga"));
    }
    if relative_path.starts_with('/') || relative_path.contains('\\') {
        return Err(invalid_path("usa una ruta relativa con separadores `/`"));
    }
    if relative_path
        .chars()
        .any(|character| character.is_control())
    {
        return Err(invalid_path("la ruta contiene caracteres de control"));
    }

    let mut components = Vec::new();
    for component in relative_path.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return Err(invalid_path("la ruta contiene un componente no permitido"));
        }
        if !Path::new(component).components().all(|value| {
            matches!(
                value,
                std::path::Component::Normal(value) if value == OsStr::new(component)
            )
        }) {
            return Err(invalid_path("la ruta no contiene componentes normales"));
        }
        components.push(component);
    }
    if components.is_empty() || components.len() > MAX_PATH_COMPONENTS {
        return Err(invalid_path("profundidad de ruta no permitida"));
    }
    Ok(components)
}

fn parent_relative(relative_path: &str) -> &str {
    relative_path
        .rsplit_once('/')
        .map_or("", |(parent, _)| parent)
}

fn resolve_directory(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let canonical_root = canonical_workspace(root)?;
    let components = relative_components(relative_path, true)?;
    let mut current = canonical_root.clone();

    for component in components {
        current.push(component);
        if !is_plain_directory(&current) {
            return Err(not_found(format!(
                "la carpeta '{component}' no existe o no es accesible"
            )));
        }
        let canonical = fs::canonicalize(&current)?;
        if !canonical.starts_with(&canonical_root) {
            return Err(invalid_path("una carpeta escapa de la biblioteca"));
        }
        current = canonical;
    }

    Ok(current)
}

fn safe_existing_entry(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let canonical_root = canonical_workspace(root)?;
    let components = relative_components(relative_path, false)?;
    let parent = resolve_directory(&canonical_root, parent_relative(relative_path))?;
    let name = components.last().expect("ruta no vacía");
    let candidate = parent.join(name);
    if !is_plain_file(&candidate) && !is_plain_directory(&candidate) {
        return Err(not_found("la entrada no existe"));
    }

    let canonical = fs::canonicalize(&candidate)?;
    if !canonical.starts_with(&canonical_root) {
        return Err(invalid_path("la entrada escapa de la biblioteca"));
    }
    if !is_plain_file(&canonical) && !is_plain_directory(&canonical) {
        return Err(invalid_path("la entrada no es un archivo o carpeta normal"));
    }
    Ok(canonical)
}

fn safe_existing_note(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let components = relative_components(relative_path, false)?;
    if !components
        .last()
        .is_some_and(|name| name.to_ascii_lowercase().ends_with(".md"))
    {
        return Err(invalid_path("solo se pueden abrir notas `.md`"));
    }
    safe_existing_entry(root, relative_path)
}

fn safe_new_note_path(root: &Path, relative_path: &str) -> Result<PathBuf, VaultError> {
    let components = relative_components(relative_path, false)?;
    let name = components.last().expect("ruta no vacía");
    if !name.to_ascii_lowercase().ends_with(".md") {
        return Err(invalid_path("una nota debe terminar en `.md`"));
    }

    let parent = resolve_directory(root, parent_relative(relative_path))?;
    let candidate = parent.join(name);
    if fs::symlink_metadata(&candidate).is_ok() {
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una nota con ese nombre",
        ));
    }
    Ok(candidate)
}

fn path_exists_case_insensitive(parent: &Path, name: &str) -> bool {
    let expected = name.to_lowercase();
    let Ok(children) = fs::read_dir(parent) else {
        return false;
    };
    children
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .any(|candidate| candidate.to_lowercase() == expected)
}

fn is_windows_reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn validate_name(name: &str) -> Result<(), VaultError> {
    if name.is_empty() || name.len() > MAX_NAME_BYTES {
        return Err(invalid_path("el nombre está vacío o es demasiado largo"));
    }
    if name == "." || name == ".." {
        return Err(invalid_path("el nombre no es válido"));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(invalid_path(
            "el nombre no puede terminar en punto o espacio",
        ));
    }
    if name
        .chars()
        .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err(invalid_path("el nombre contiene caracteres no permitidos"));
    }
    if is_windows_reserved(name) {
        return Err(invalid_path("el nombre está reservado por el sistema"));
    }
    Ok(())
}

fn strip_note_extension(name: &str) -> &str {
    if name.len() >= 3 && name[name.len() - 3..].eq_ignore_ascii_case(".md") {
        &name[..name.len() - 3]
    } else {
        name
    }
}

fn normalize_note_title(value: &str) -> String {
    let mut title = String::new();
    for character in value.chars() {
        if character.is_control() {
            title.push(' ');
        } else {
            title.push(character);
        }
        if title.chars().count() == NOTE_TITLE_MAX_CHARS {
            break;
        }
    }
    title.trim().to_string()
}

fn title_from_path(relative_path: &str) -> String {
    let file_name = relative_path.rsplit('/').next().unwrap_or(relative_path);
    strip_note_extension(file_name).to_string()
}

fn markdown_heading(line: &str) -> Option<&str> {
    if line == "#" {
        return Some("");
    }
    let value = line.strip_prefix('#')?;
    if value.starts_with(' ') || value.starts_with('\t') {
        Some(value)
    } else {
        None
    }
}

fn split_note_content(relative_path: &str, content: &str) -> (String, String) {
    let source = content.strip_prefix('\u{feff}').unwrap_or(content);
    let (first_line, remainder) = source.split_once('\n').unwrap_or((source, ""));
    let first_line = first_line.strip_suffix('\r').unwrap_or(first_line);
    let title = title_from_path(relative_path);
    if markdown_heading(first_line).is_none() {
        return (title, source.to_string());
    }
    let body = remainder
        .strip_prefix("\r\n")
        .or_else(|| remainder.strip_prefix('\n'))
        .unwrap_or(remainder);
    (title, body.to_string())
}

fn serialize_note_content(title: &str, body: &str) -> String {
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))
        .unwrap_or(body);
    format!("# {}\n\n{body}", normalize_note_title(title))
}

fn normalized_note_name(input: &str) -> Result<String, VaultError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(invalid_path("escribe un nombre para la nota"));
    }
    validate_name(trimmed)?;
    let mut name = trimmed.to_string();
    if !name.to_ascii_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    validate_name(&name)?;
    let stem = strip_note_extension(&name);
    if stem.is_empty() {
        return Err(invalid_path("la nota necesita un nombre además de `.md`"));
    }
    Ok(name)
}

fn next_untitled_note_name(parent: &Path) -> Result<String, VaultError> {
    for index in 1..=100_000_u32 {
        let name = if index == 1 {
            "Sin título.md".to_string()
        } else {
            format!("Sin título {index}.md")
        };
        if !path_exists_case_insensitive(parent, &name) {
            return Ok(name);
        }
    }
    Err(VaultError::new(
        "alreadyExists",
        "no se pudo crear una nota sin título",
    ))
}

fn normalized_folder_name(input: &str) -> Result<String, VaultError> {
    let name = input.trim().to_string();
    validate_name(&name)?;
    Ok(name)
}

fn relative_join(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

fn revision_for(content: &[u8]) -> String {
    let mut hasher = Hasher::new();
    hasher.update(content);
    hasher.finalize().to_hex().to_string()
}

fn read_note_blocking(root: PathBuf, relative_path: String) -> Result<NoteDocument, VaultError> {
    let path = safe_existing_note(&root, &relative_path)?;
    let metadata = fs::metadata(&path)?;
    if metadata.len() > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "tooLarge",
            format!("la nota supera el límite de {MAX_NOTE_BYTES} bytes"),
        ));
    }

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&path)?
        .take(MAX_NOTE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "tooLarge",
            format!("la nota supera el límite de {MAX_NOTE_BYTES} bytes"),
        ));
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| VaultError::new("invalidEncoding", "la nota no es UTF-8 válida"))?;
    let revision = revision_for(content.as_bytes());
    let updated_at = modified_millis(&metadata).unwrap_or_else(current_millis);
    let (title, body) = split_note_content(&relative_path, &content);

    Ok(NoteDocument {
        path: relative_path,
        title,
        body,
        revision,
        updated_at,
        size: metadata.len(),
    })
}

fn write_bytes_atomically(path: &Path, bytes: &[u8]) -> Result<(), VaultError> {
    let mut file = AtomicWriteFile::open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    file.commit()?;
    Ok(())
}

fn asset_extension(file_name: &str) -> Result<&'static str, VaultError> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Ok("png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Ok("jpg")
    } else if lower.ends_with(".gif") {
        Ok("gif")
    } else if lower.ends_with(".webp") {
        Ok("webp")
    } else if lower.ends_with(".svg") {
        Ok("svg")
    } else {
        Err(invalid_path("solo se admiten PNG, JPEG, GIF, WebP y SVG"))
    }
}

fn detect_asset_mime(bytes: &[u8], extension: &str) -> Result<&'static str, VaultError> {
    let is_png = bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]);
    let is_jpeg = bytes.starts_with(&[0xff, 0xd8, 0xff]);
    let is_gif = bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a");
    let is_webp = bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP";
    let is_svg = extension == "svg"
        && String::from_utf8_lossy(bytes)
            .trim_start()
            .to_ascii_lowercase()
            .contains("<svg");

    match (extension, is_png, is_jpeg, is_gif, is_webp, is_svg) {
        ("png", true, _, _, _, _) => Ok("image/png"),
        ("jpg", _, true, _, _, _) => Ok("image/jpeg"),
        ("gif", _, _, true, _, _) => Ok("image/gif"),
        ("webp", _, _, _, true, _) => Ok("image/webp"),
        ("svg", _, _, _, _, true) => Ok("image/svg+xml"),
        _ => Err(invalid_path(
            "el contenido no coincide con una imagen válida",
        )),
    }
}

fn validate_svg_asset(bytes: &[u8]) -> Result<(), VaultError> {
    let text = std::str::from_utf8(bytes).map_err(|_| invalid_path("el SVG no es UTF-8 válido"))?;
    let lower = text.to_ascii_lowercase();
    if !lower.contains("data-xenner-asset=\"safe\"")
        || lower.contains("<script")
        || lower.contains("<foreignobject")
        || lower.contains("<iframe")
        || lower.contains("<image")
        || lower.contains("<style")
        || lower.contains("<!doctype")
        || lower.contains("<!entity")
        || lower.contains("javascript:")
        || lower.contains("data:")
        || lower.contains("xlink:href")
        || lower.contains(" href=")
        || lower.contains("style=")
        || lower.contains("onload=")
        || lower.contains("onclick=")
        || lower.contains("onerror=")
        || lower.contains("onmouseover=")
        || lower.contains("onfocus=")
        || lower.contains("onbegin=")
        || lower.contains("onend=")
    {
        return Err(invalid_path(
            "el SVG no pertenece a un dibujo seguro de Xenner",
        ));
    }
    Ok(())
}

fn normalized_asset_path(asset_path: &str) -> Result<String, VaultError> {
    let value = asset_path.strip_prefix("./").unwrap_or(asset_path);
    let components = relative_components(value, false)?;
    if components.first().copied() != Some(ASSET_DIRECTORY) || components.len() != 2 {
        return Err(invalid_path("el asset debe estar dentro de `.assets`"));
    }
    Ok(components.join("/"))
}

fn asset_file_path(
    root: &Path,
    note_path: &str,
    asset_path: &str,
    must_exist: bool,
) -> Result<PathBuf, VaultError> {
    let note = safe_existing_note(root, note_path)?;
    let note_parent = note
        .parent()
        .ok_or_else(|| invalid_path("ruta de nota inválida"))?;
    let relative = normalized_asset_path(asset_path)?;
    let components = relative_components(&relative, false)?;
    let asset_dir = note_parent.join(ASSET_DIRECTORY);
    if must_exist {
        if !is_plain_directory(&asset_dir) {
            return Err(not_found("la carpeta de assets no existe"));
        }
    } else {
        fs::create_dir_all(&asset_dir)?;
    }
    let canonical_root = canonical_workspace(root)?;
    let canonical_dir = fs::canonicalize(&asset_dir)?;
    if !canonical_dir.starts_with(&canonical_root) {
        return Err(invalid_path("la carpeta de assets escapa de la biblioteca"));
    }

    let mut path = canonical_dir.clone();
    for component in components.iter().skip(1) {
        path.push(component);
    }
    if must_exist {
        if !is_plain_file(&path) {
            return Err(not_found("el asset no existe"));
        }
        let canonical = fs::canonicalize(&path)?;
        if !canonical.starts_with(&canonical_dir) || !is_plain_file(&canonical) {
            return Err(invalid_path("el asset escapa de la biblioteca"));
        }
        return Ok(canonical);
    }
    if fs::symlink_metadata(&path).is_ok() {
        return Err(VaultError::new("alreadyExists", "el asset ya existe"));
    }
    Ok(path)
}

fn import_asset_blocking(
    root: PathBuf,
    note_path: String,
    file_name: String,
    data_base64: String,
) -> Result<ImportedAsset, VaultError> {
    if data_base64.len() > MAX_ASSET_BYTES.saturating_mul(2) {
        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
    }
    let bytes = BASE64
        .decode(data_base64.as_bytes())
        .map_err(|_| invalid_path("el asset no contiene base64 válido"))?;
    if bytes.is_empty() || bytes.len() > MAX_ASSET_BYTES {
        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
    }
    validate_name(&file_name)?;
    let extension = asset_extension(&file_name)?;
    let mime = detect_asset_mime(&bytes, extension)?;
    if extension == "svg" {
        validate_svg_asset(&bytes)?;
    }
    let _note = safe_existing_note(&root, &note_path)?;
    let hash = revision_for(&bytes);
    let short_hash = &hash[..24];
    let relative_path = format!("./{ASSET_DIRECTORY}/{short_hash}.{extension}");
    let path = asset_file_path(&root, &note_path, &relative_path, false)?;
    write_bytes_atomically(&path, &bytes)?;
    Ok(ImportedAsset {
        relative_path,
        mime: mime.to_string(),
        data_base64: BASE64.encode(&bytes),
        revision: hash,
        file_name,
    })
}

fn read_asset_blocking(
    root: PathBuf,
    note_path: String,
    asset_path: String,
) -> Result<AssetPayload, VaultError> {
    let path = asset_file_path(&root, &note_path, &asset_path, true)?;
    let metadata = fs::metadata(&path)?;
    if metadata.len() > MAX_ASSET_BYTES as u64 {
        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&path)?.read_to_end(&mut bytes)?;
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .ok_or_else(|| invalid_path("el asset no tiene extensión"))?
        .to_ascii_lowercase();
    let extension = match extension.as_str() {
        "jpeg" => "jpg",
        value => value,
    };
    let mime = detect_asset_mime(&bytes, extension)?;
    if extension == "svg" {
        validate_svg_asset(&bytes)?;
    }
    let revision = revision_for(&bytes);
    Ok(AssetPayload {
        mime: mime.to_string(),
        data_base64: BASE64.encode(&bytes),
        revision,
    })
}

fn update_asset_blocking(
    root: PathBuf,
    note_path: String,
    asset_path: String,
    data_base64: String,
    expected_revision: Option<String>,
) -> Result<AssetPayload, VaultError> {
    if data_base64.len() > MAX_ASSET_BYTES.saturating_mul(2) {
        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
    }
    let bytes = BASE64
        .decode(data_base64.as_bytes())
        .map_err(|_| invalid_path("el asset no contiene base64 válido"))?;
    if bytes.is_empty() || bytes.len() > MAX_ASSET_BYTES {
        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
    }

    let path = asset_file_path(&root, &note_path, &asset_path, true)?;
    if let Some(expected_revision) = expected_revision {
        let current = fs::read(&path)?;
        if revision_for(&current) != expected_revision {
            return Err(conflict(
                "el asset cambió fuera de Xenner; recárgalo antes de guardar",
            ));
        }
    }
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .ok_or_else(|| invalid_path("el asset no tiene extensión"))?
        .to_ascii_lowercase();
    let extension = match extension.as_str() {
        "jpeg" => "jpg",
        value => value,
    };
    let mime = detect_asset_mime(&bytes, &extension)?;
    if extension == "svg" {
        validate_svg_asset(&bytes)?;
    }
    write_bytes_atomically(&path, &bytes)?;
    let revision = revision_for(&bytes);
    Ok(AssetPayload {
        mime: mime.to_string(),
        data_base64: BASE64.encode(&bytes),
        revision,
    })
}

fn delete_asset_blocking(
    root: PathBuf,
    note_path: String,
    asset_path: String,
) -> Result<(), VaultError> {
    let path = match asset_file_path(&root, &note_path, &asset_path, true) {
        Ok(path) => path,
        Err(error) if error.code == "notFound" => return Ok(()),
        Err(error) => return Err(error),
    };
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn write_note_blocking(
    root: PathBuf,
    relative_path: String,
    body: String,
    expected_revision: String,
) -> Result<WriteAcknowledgement, VaultError> {
    let title = title_from_path(&relative_path);
    let content = serialize_note_content(&title, &body);
    if content.len() as u64 > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "tooLarge",
            format!("la nota supera el límite de {MAX_NOTE_BYTES} bytes"),
        ));
    }

    let current = read_note_blocking(root.clone(), relative_path.clone())?;
    if current.revision != expected_revision {
        return Err(conflict(
            "la nota cambió fuera de Xenner; recárgala antes de guardar",
        ));
    }

    let path = safe_existing_note(&root, &relative_path)?;
    let mut file = AtomicWriteFile::open(&path)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    file.commit()?;

    let metadata = fs::metadata(&path)?;
    Ok(WriteAcknowledgement {
        path: relative_path,
        revision: revision_for(content.as_bytes()),
        updated_at: modified_millis(&metadata).unwrap_or_else(current_millis),
    })
}

fn create_note_blocking(
    root: PathBuf,
    parent: String,
    input_name: Option<String>,
) -> Result<CreateNoteResult, VaultError> {
    relative_components(&parent, true)?;
    let parent_path = resolve_directory(&root, &parent)?;
    let name = match input_name.as_deref() {
        Some(value) => normalized_note_name(value)?,
        None => next_untitled_note_name(&parent_path)?,
    };
    if path_exists_case_insensitive(&parent_path, &name) {
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una nota con ese nombre",
        ));
    }

    let relative_path = relative_join(&parent, &name);
    let path = safe_new_note_path(&root, &relative_path)?;
    let title = title_from_path(&relative_path);
    let initial_content = serialize_note_content(&title, "");
    if initial_content.len() as u64 > MAX_NOTE_BYTES {
        return Err(VaultError::new(
            "tooLarge",
            "el nombre genera una nota demasiado grande",
        ));
    }

    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                VaultError::new("alreadyExists", "ya existe una nota con ese nombre")
            } else {
                VaultError::from(error)
            }
        })?;

    let mut file = AtomicWriteFile::open(&path)?;
    file.write_all(initial_content.as_bytes())?;
    file.sync_all()?;
    file.commit()?;

    let document = read_note_blocking(root, relative_path.clone())?;
    Ok(CreateNoteResult {
        entry: CreatedEntry {
            path: relative_path,
            name,
            kind: EntryKind::Note,
        },
        document,
    })
}

fn create_folder_blocking(
    root: PathBuf,
    parent: String,
    input_name: String,
) -> Result<CreatedEntry, VaultError> {
    relative_components(&parent, true)?;
    let name = normalized_folder_name(&input_name)?;
    let parent_path = resolve_directory(&root, &parent)?;
    if path_exists_case_insensitive(&parent_path, &name) {
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una carpeta con ese nombre",
        ));
    }
    fs::create_dir(parent_path.join(&name)).map_err(|error| {
        if error.kind() == io::ErrorKind::AlreadyExists {
            VaultError::new("alreadyExists", "ya existe una carpeta con ese nombre")
        } else {
            VaultError::from(error)
        }
    })?;
    Ok(CreatedEntry {
        path: relative_join(&parent, &name),
        name,
        kind: EntryKind::Directory,
    })
}

fn scan_directory(
    root: &Path,
    current: &Path,
    relative_prefix: &str,
    depth: usize,
    entries: &mut Vec<VaultEntry>,
    truncated: &mut bool,
) {
    if depth > MAX_SCAN_DEPTH || *truncated {
        *truncated = depth > MAX_SCAN_DEPTH;
        return;
    }

    let mut children = match fs::read_dir(current) {
        Ok(children) => children.flatten().collect::<Vec<_>>(),
        Err(_) => return,
    };
    children.sort_by_key(|entry| entry.file_name());

    for child in children {
        if entries.len() >= MAX_SCAN_ENTRIES {
            *truncated = true;
            return;
        }
        let Ok(name) = child.file_name().into_string() else {
            continue;
        };
        if name.chars().any(char::is_control) {
            continue;
        }
        let path = child.path();
        let file_type = match child.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        let relative_path = relative_join(relative_prefix, &name);
        if file_type.is_dir() {
            let canonical = match fs::canonicalize(&path) {
                Ok(canonical) if canonical.starts_with(root) => canonical,
                _ => continue,
            };
            let metadata = child.metadata().ok();
            entries.push(VaultEntry {
                path: relative_path.clone(),
                name,
                kind: EntryKind::Directory,
                updated_at: metadata.as_ref().and_then(modified_millis),
                size: None,
            });
            scan_directory(
                root,
                &canonical,
                &relative_path,
                depth + 1,
                entries,
                truncated,
            );
        } else if file_type.is_file() && name.to_ascii_lowercase().ends_with(".md") {
            let metadata = child.metadata().ok();
            entries.push(VaultEntry {
                path: relative_path,
                name,
                kind: EntryKind::Note,
                updated_at: metadata.as_ref().and_then(modified_millis),
                size: metadata.as_ref().map(fs::Metadata::len),
            });
        }
    }
}

fn scan_workspace_blocking(root: PathBuf) -> Result<WorkspaceScan, VaultError> {
    let canonical = canonical_workspace(&root)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    scan_directory(&canonical, &canonical, "", 0, &mut entries, &mut truncated);
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    let note_count = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::Note)
        .count();

    Ok(WorkspaceScan {
        info: VaultInfo {
            root: canonical.to_string_lossy().into_owned(),
            note_count,
            entry_count: entries.len(),
            truncated,
        },
        entries,
    })
}

fn existing_entry_kind(path: &Path) -> EntryKind {
    if is_plain_directory(path) {
        EntryKind::Directory
    } else {
        EntryKind::Note
    }
}

fn rename_entry_blocking(
    root: PathBuf,
    relative_path: String,
    input_name: String,
) -> Result<String, VaultError> {
    let path = safe_existing_entry(&root, &relative_path)?;
    let kind = existing_entry_kind(&path);
    let name = if kind == EntryKind::Note {
        normalized_note_name(&input_name)?
    } else {
        normalized_folder_name(&input_name)?
    };

    let parent_relative_path = parent_relative(&relative_path);
    let parent = resolve_directory(&root, parent_relative_path)?;
    if path_exists_case_insensitive(&parent, &name) {
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una entrada con ese nombre",
        ));
    }
    fs::rename(&path, parent.join(&name))?;
    Ok(relative_join(parent_relative_path, &name))
}

fn referenced_asset_names(markdown: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let mut offset = 0usize;
    while let Some(relative) = markdown[offset..].find(".assets/") {
        let start = offset + relative + ASSET_DIRECTORY.len() + 1;
        let rest = &markdown[start..];
        let end = rest
            .find(|character: char| character.is_whitespace() || ")]>\"'?&".contains(character))
            .unwrap_or(rest.len());
        let name = &rest[..end];
        if !name.is_empty() && !name.contains('/') && asset_extension(name).is_ok() {
            names.insert(name.to_string());
        }
        offset = start + end.max(1);
        if offset >= markdown.len() {
            break;
        }
    }
    names
}

fn parent_notes_reference(parent: &Path, asset_name: &str) -> bool {
    let Ok(entries) = fs::read_dir(parent) else {
        return false;
    };
    for entry in entries.flatten() {
        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        let path = entry.path();
        if !path
            .extension()
            .and_then(OsStr::to_str)
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if bytes.len() as u64 > MAX_NOTE_BYTES {
            continue;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            continue;
        };
        if referenced_asset_names(&content).contains(asset_name) {
            return true;
        }
    }
    false
}

fn cleanup_moved_assets(parent: &Path, names: &BTreeSet<String>) {
    let asset_directory = parent.join(ASSET_DIRECTORY);
    for name in names {
        let path = asset_directory.join(name);
        if is_plain_file(&path) && !parent_notes_reference(parent, name) {
            let _ = fs::remove_file(path);
        }
    }
}

fn cleanup_copied_assets(files: &[PathBuf], created_directory: Option<&Path>) {
    for path in files.iter().rev() {
        let _ = fs::remove_file(path);
    }
    if let Some(directory) = created_directory {
        let _ = fs::remove_dir(directory);
    }
}

fn copy_assets_for_note_move(
    source: &Path,
    target_parent: &Path,
    asset_names: &BTreeSet<String>,
) -> Result<(Vec<PathBuf>, Option<PathBuf>), VaultError> {
    let source_directory = source
        .parent()
        .map(|parent| parent.join(ASSET_DIRECTORY))
        .ok_or_else(|| invalid_path("la nota no tiene una carpeta padre"))?;
    if asset_names.is_empty() {
        return Ok((Vec::new(), None));
    }
    let source_metadata = match fs::symlink_metadata(&source_directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok((Vec::new(), None));
        }
        Err(error) => return Err(error.into()),
    };
    if !source_metadata.file_type().is_dir() || source_metadata.file_type().is_symlink() {
        return Err(invalid_path("la carpeta de assets de origen no es normal"));
    }

    let target_directory = target_parent.join(ASSET_DIRECTORY);
    let target_metadata = fs::symlink_metadata(&target_directory);
    let created_directory = match target_metadata {
        Ok(metadata) => {
            if !metadata.file_type().is_dir() || metadata.file_type().is_symlink() {
                return Err(invalid_path("la carpeta de assets de destino no es normal"));
            }
            None
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&target_directory)?;
            Some(target_directory.clone())
        }
        Err(error) => return Err(error.into()),
    };
    let canonical_target = fs::canonicalize(&target_directory)?;
    if !canonical_target.starts_with(target_parent) {
        if let Some(directory) = &created_directory {
            let _ = fs::remove_dir(directory);
        }
        return Err(invalid_path("la carpeta de assets escapa del destino"));
    }

    let mut copied = Vec::new();
    let result = (|| -> Result<(), VaultError> {
        for name in asset_names {
            let source_file = source_directory.join(name);
            if !is_plain_file(&source_file) {
                continue;
            }
            validate_name(name)?;
            let target_file = target_directory.join(name);
            let target_file_metadata = fs::symlink_metadata(&target_file);
            match target_file_metadata {
                Ok(metadata) => {
                    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
                        return Err(invalid_path("un asset de destino no es normal"));
                    }
                    if metadata.len() > MAX_ASSET_BYTES as u64
                        || fs::metadata(&source_file)?.len() > MAX_ASSET_BYTES as u64
                    {
                        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
                    }
                    if fs::read(&source_file)? != fs::read(&target_file)? {
                        return Err(conflict("un asset de destino tiene contenido diferente"));
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    let bytes = fs::read(&source_file)?;
                    if bytes.len() > MAX_ASSET_BYTES {
                        return Err(VaultError::new("tooLarge", "el asset es demasiado grande"));
                    }
                    write_bytes_atomically(&target_file, &bytes)?;
                    copied.push(target_file.clone());
                }
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    })();

    if let Err(error) = result {
        cleanup_copied_assets(&copied, created_directory.as_deref());
        return Err(error);
    }
    Ok((copied, created_directory))
}

fn move_entry_blocking(
    root: PathBuf,
    relative_path: String,
    target_parent: String,
) -> Result<String, VaultError> {
    let path = safe_existing_entry(&root, &relative_path)?;
    let kind = existing_entry_kind(&path);
    let name = relative_path
        .rsplit('/')
        .next()
        .ok_or_else(|| invalid_path("la entrada no tiene nombre"))?;
    if kind != EntryKind::Directory && !name.to_ascii_lowercase().ends_with(".md") {
        return Err(invalid_path("solo se pueden mover notas `.md`"));
    }
    if relative_path
        .split('/')
        .any(|component| component == ASSET_DIRECTORY)
        || target_parent
            .split('/')
            .any(|component| component == ASSET_DIRECTORY)
    {
        return Err(invalid_path(
            "no se pueden mover entradas internas de assets",
        ));
    }

    let source_parent = parent_relative(&relative_path);
    if source_parent == target_parent {
        return Ok(relative_path);
    }
    if kind == EntryKind::Directory
        && (target_parent == relative_path
            || target_parent.starts_with(&format!("{relative_path}/")))
    {
        return Err(invalid_path(
            "una carpeta no se puede mover dentro de sí misma",
        ));
    }

    let target = resolve_directory(&root, &target_parent)?;
    if path_exists_case_insensitive(&target, name) {
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una entrada con ese nombre",
        ));
    }
    let moved_assets = if kind == EntryKind::Note {
        let document = read_note_blocking(root.clone(), relative_path.clone())?;
        referenced_asset_names(&document.body)
    } else {
        BTreeSet::new()
    };
    let (copied_assets, created_assets) = if kind == EntryKind::Note {
        copy_assets_for_note_move(&path, &target, &moved_assets)?
    } else {
        (Vec::new(), None)
    };
    if path_exists_case_insensitive(&target, name) {
        cleanup_copied_assets(&copied_assets, created_assets.as_deref());
        return Err(VaultError::new(
            "alreadyExists",
            "ya existe una entrada con ese nombre",
        ));
    }
    if let Err(error) = fs::rename(&path, target.join(name)) {
        cleanup_copied_assets(&copied_assets, created_assets.as_deref());
        return Err(error.into());
    }
    if kind == EntryKind::Note {
        if let Some(source_parent) = path.parent() {
            cleanup_moved_assets(source_parent, &moved_assets);
        }
    }
    Ok(relative_join(&target_parent, name))
}

fn delete_entry_blocking(root: PathBuf, relative_path: String) -> Result<(), VaultError> {
    let path = safe_existing_entry(&root, &relative_path)?;
    if is_plain_directory(&path) {
        fs::remove_dir(path)
            .map_err(|_| VaultError::new("notEmpty", "la carpeta no está vacía"))?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

fn activate_workspace_blocking(app: AppHandle, path: String) -> Result<PathBuf, VaultError> {
    if path.is_empty() || path.len() > MAX_WORKSPACE_PATH_BYTES {
        return Err(invalid_path("la ruta de biblioteca no es válida"));
    }
    let root = canonical_workspace(Path::new(&path))?;
    let preference = workspace_preference_path(&app)?;
    write_atomically(&preference, &format!("{}\n", root.to_string_lossy()))?;
    Ok(root)
}

fn join_error() -> VaultError {
    internal("la tarea de filesystem no terminó correctamente")
}

#[tauri::command]
pub async fn choose_workspace(
    app: AppHandle,
    state: State<'_, VaultState>,
) -> Result<Option<WorkspaceScan>, VaultError> {
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Elige la biblioteca de notas")
            .blocking_pick_folder()
            .map(|file| {
                file.into_path().map_err(|error| {
                    VaultError::new(
                        "invalidPath",
                        format!("ruta de biblioteca inválida: {error}"),
                    )
                })
            })
            .transpose()
    })
    .await
    .map_err(|_| join_error())??;

    let Some(selected) = selected else {
        return Ok(None);
    };
    let root = tauri::async_runtime::spawn_blocking(move || {
        activate_workspace_blocking(app, selected.to_string_lossy().into_owned())
    })
    .await
    .map_err(|_| join_error())??;
    {
        let mut session = state
            .lock()
            .map_err(|_| internal("estado de biblioteca bloqueado"))?;
        session.root = root.clone();
    }
    let scan = tauri::async_runtime::spawn_blocking(move || scan_workspace_blocking(root))
        .await
        .map_err(|_| join_error())??;
    Ok(Some(scan))
}

#[tauri::command]
pub async fn scan_workspace(state: State<'_, VaultState>) -> Result<WorkspaceScan, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || scan_workspace_blocking(root))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn read_note(
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<NoteDocument, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || read_note_blocking(root, relative_path))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn import_asset(
    state: State<'_, VaultState>,
    note_path: String,
    file_name: String,
    data_base64: String,
) -> Result<ImportedAsset, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        import_asset_blocking(root, note_path, file_name, data_base64)
    })
    .await
    .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn choose_image_asset(
    app: AppHandle,
    state: State<'_, VaultState>,
    note_path: String,
) -> Result<Option<ImportedAsset>, VaultError> {
    let root = root_from_state(&state)?;
    let dialog_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let selected = dialog_app
            .dialog()
            .file()
            .set_title("Insertar imagen")
            .add_filter("Imágenes", &["png", "jpg", "jpeg", "gif", "webp"])
            .blocking_pick_file()
            .map(|file| {
                file.into_path()
                    .map_err(|error| invalid_path(format!("ruta de imagen inválida: {error}")))
            })
            .transpose()?;
        let Some(selected) = selected else {
            return Ok(None);
        };
        if !is_plain_file(&selected) {
            return Err(invalid_path(
                "la imagen seleccionada no es un archivo normal",
            ));
        }
        let metadata = fs::metadata(&selected)?;
        if metadata.len() > MAX_ASSET_BYTES as u64 {
            return Err(VaultError::new("tooLarge", "la imagen es demasiado grande"));
        }
        let file_name = selected
            .file_name()
            .and_then(OsStr::to_str)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid_path("la imagen no tiene un nombre válido"))?
            .to_string();
        let data_base64 = BASE64.encode(fs::read(&selected)?);
        import_asset_blocking(root, note_path, file_name, data_base64).map(Some)
    })
    .await
    .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn read_asset(
    state: State<'_, VaultState>,
    note_path: String,
    asset_path: String,
) -> Result<AssetPayload, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || read_asset_blocking(root, note_path, asset_path))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn update_asset(
    state: State<'_, VaultState>,
    note_path: String,
    asset_path: String,
    data_base64: String,
    expected_revision: Option<String>,
) -> Result<AssetPayload, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        update_asset_blocking(root, note_path, asset_path, data_base64, expected_revision)
    })
    .await
    .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn delete_asset(
    state: State<'_, VaultState>,
    note_path: String,
    asset_path: String,
) -> Result<(), VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || delete_asset_blocking(root, note_path, asset_path))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn write_note(
    state: State<'_, VaultState>,
    relative_path: String,
    body: String,
    expected_revision: String,
) -> Result<WriteAcknowledgement, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        write_note_blocking(root, relative_path, body, expected_revision)
    })
    .await
    .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, VaultState>,
    parent: String,
    name: Option<String>,
) -> Result<CreateNoteResult, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || create_note_blocking(root, parent, name))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn create_folder(
    state: State<'_, VaultState>,
    parent: String,
    name: String,
) -> Result<CreatedEntry, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || create_folder_blocking(root, parent, name))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn rename_entry(
    state: State<'_, VaultState>,
    relative_path: String,
    name: String,
) -> Result<String, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || rename_entry_blocking(root, relative_path, name))
        .await
        .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn move_entry(
    state: State<'_, VaultState>,
    relative_path: String,
    target_parent: String,
) -> Result<String, VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        move_entry_blocking(root, relative_path, target_parent)
    })
    .await
    .map_err(|_| join_error())?
}

#[tauri::command]
pub async fn delete_entry(
    state: State<'_, VaultState>,
    relative_path: String,
) -> Result<(), VaultError> {
    let root = root_from_state(&state)?;
    tauri::async_runtime::spawn_blocking(move || delete_entry_blocking(root, relative_path))
        .await
        .map_err(|_| join_error())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rechaza_rutas_relativas_peligrosas() {
        assert!(relative_components("../fuera.md", false).is_err());
        assert!(relative_components("carpeta/../nota.md", false).is_err());
        assert!(relative_components("/absoluta.md", false).is_err());
        assert!(relative_components("carpeta\\nota.md", false).is_err());
        assert!(relative_components("carpeta//nota.md", false).is_err());
        assert!(relative_components("carpeta/nula\u{0000}.md", false).is_err());
        assert!(relative_components("", true).is_ok());
    }

    #[test]
    fn normaliza_y_valida_nombres() {
        assert_eq!(normalized_note_name("  Mi nota  ").unwrap(), "Mi nota.md");
        assert_eq!(normalized_note_name("Mi nota.MD").unwrap(), "Mi nota.MD");
        assert!(normalized_note_name("CON.md").is_err());
        assert!(normalized_note_name(".md").is_err());
        assert!(normalized_note_name("carpeta/nota").is_err());
        assert!(normalized_note_name("final.").is_err());
    }

    #[test]
    fn crea_guarda_y_detecta_conflictos() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();

        let created =
            create_note_blocking(root.clone(), String::new(), Some("Nota".into())).expect("create");
        assert_eq!(created.entry.path, "Nota.md");
        assert_eq!(created.document.title, "Nota");
        assert_eq!(created.document.body, "");

        let first_write = write_note_blocking(
            root.clone(),
            created.entry.path.clone(),
            "contenido nuevo".into(),
            created.document.revision.clone(),
        )
        .expect("write");
        let conflict_error = write_note_blocking(
            root.clone(),
            created.entry.path.clone(),
            "otro contenido".into(),
            created.document.revision,
        )
        .expect_err("conflict");
        assert_eq!(conflict_error.code, "conflict");

        let current = read_note_blocking(root, created.entry.path).expect("read");
        assert_eq!(current.title, "Nota");
        assert_eq!(current.body, "contenido nuevo");
        assert_eq!(current.revision, first_write.revision);
    }

    #[test]
    fn el_titulo_siempre_toma_el_nombre_del_archivo() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();
        let path = root.join("Nombre real.md");
        fs::write(&path, "# Otro título\n\nContenido\n").expect("note");

        let document = read_note_blocking(root.clone(), "Nombre real.md".into()).expect("read");
        assert_eq!(document.title, "Nombre real");
        assert_eq!(document.body, "Contenido\n");

        write_note_blocking(
            root.clone(),
            "Nombre real.md".into(),
            "Contenido\n".into(),
            document.revision,
        )
        .expect("write");
        assert_eq!(
            fs::read_to_string(path).expect("read content"),
            "# Nombre real\n\nContenido\n"
        );
    }

    #[test]
    fn crea_notas_sin_titulo_sin_requerir_nombre_de_archivo() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();

        let first = create_note_blocking(root.clone(), String::new(), None).expect("first");
        let second = create_note_blocking(root, String::new(), None).expect("second");
        assert_eq!(first.entry.path, "Sin título.md");
        assert_eq!(second.entry.path, "Sin título 2.md");
        assert_eq!(first.document.title, "Sin título");
        assert_eq!(second.document.title, "Sin título 2");
        assert_eq!(first.document.body, "");
    }

    #[test]
    fn mueve_notas_y_conserva_sus_assets() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();
        fs::create_dir(root.join("A")).expect("source folder");
        fs::create_dir(root.join("B")).expect("target folder");
        let note =
            create_note_blocking(root.clone(), "A".into(), Some("Nota".into())).expect("note");
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" data-xenner-asset="safe"></svg>"#;
        let imported = import_asset_blocking(
            root.clone(),
            note.entry.path.clone(),
            "drawing.svg".into(),
            BASE64.encode(svg.as_bytes()),
        )
        .expect("asset");
        let unrelated_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" data-xenner-asset="safe"><circle cx="1" cy="1" r="1" /></svg>"#;
        let unrelated = import_asset_blocking(
            root.clone(),
            note.entry.path.clone(),
            "unrelated.svg".into(),
            BASE64.encode(unrelated_svg.as_bytes()),
        )
        .expect("unrelated asset");
        let markdown = format!("![Dibujo]({})", imported.relative_path);
        write_note_blocking(
            root.clone(),
            note.entry.path.clone(),
            markdown,
            note.document.revision,
        )
        .expect("reference asset");

        let moved =
            move_entry_blocking(root.clone(), note.entry.path.clone(), "B".into()).expect("move");
        assert_eq!(moved, "B/Nota.md");
        assert!(root.join("A/Nota.md").exists() == false);
        assert!(root.join("B/Nota.md").exists());
        assert!(!root
            .join("A/.assets")
            .join(imported.relative_path.trim_start_matches("./.assets/"))
            .exists());
        assert!(root
            .join("A/.assets")
            .join(unrelated.relative_path.trim_start_matches("./.assets/"))
            .exists());
        let asset = read_asset_blocking(root, "B/Nota.md".into(), imported.relative_path)
            .expect("moved asset");
        assert_eq!(asset.data_base64, BASE64.encode(svg.as_bytes()));
    }

    #[test]
    fn rechaza_mover_una_carpeta_dentro_de_si_misma() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();
        fs::create_dir_all(root.join("Tema/Sub")).expect("folders");
        let error =
            move_entry_blocking(root, "Tema".into(), "Tema/Sub".into()).expect_err("self move");
        assert_eq!(error.code, "invalidPath");
    }

    #[test]
    fn scan_solo_expone_directorios_y_markdown() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();
        fs::create_dir(root.join("Tema")).expect("folder");
        fs::write(root.join("Tema/uno.md"), "# Uno").expect("note");
        fs::write(root.join("Tema/ignorado.txt"), "no").expect("text");

        let scan = scan_workspace_blocking(root).expect("scan");
        assert_eq!(scan.info.note_count, 1);
        assert!(scan
            .entries
            .iter()
            .any(|entry| entry.path == "Tema" && entry.kind == EntryKind::Directory));
        assert!(scan.entries.iter().any(|entry| entry.path == "Tema/uno.md"));
        assert!(!scan
            .entries
            .iter()
            .any(|entry| entry.name == "ignorado.txt"));
    }

    #[cfg(unix)]
    #[test]
    fn rechaza_symlinks_que_escapan_de_la_biblioteca() {
        use std::os::unix::fs::symlink;

        let root_directory = tempfile::tempdir().expect("root");
        let outside = tempfile::tempdir().expect("outside");
        let outside_note = outside.path().join("secreto.md");
        fs::write(&outside_note, "# secreto").expect("outside note");
        symlink(&outside_note, root_directory.path().join("enlace.md")).expect("symlink");

        assert!(safe_existing_note(root_directory.path(), "enlace.md").is_err());
        let scan = scan_workspace_blocking(root_directory.path().to_path_buf()).expect("scan");
        assert!(scan.entries.is_empty());
    }

    #[test]
    fn valida_rutas_de_assets_y_tipos_de_imagen() {
        assert_eq!(
            normalized_asset_path("./.assets/dibujo.svg").unwrap(),
            ".assets/dibujo.svg"
        );
        assert!(normalized_asset_path("../.assets/dibujo.svg").is_err());
        assert!(normalized_asset_path("assets/dibujo.svg").is_err());
        assert_eq!(asset_extension("foto.PNG").unwrap(), "png");
        assert!(asset_extension("documento.pdf").is_err());

        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" data-xenner-asset="safe"></svg>"#;
        assert!(validate_svg_asset(svg.as_bytes()).is_ok());
        assert!(validate_svg_asset(br#"<svg><script>alert(1)</script></svg>"#).is_err());
    }

    #[test]
    fn actualiza_un_asset_existente_sin_crear_una_ruta_nueva() {
        let directory = tempfile::tempdir().expect("tempdir");
        let root = directory.path().to_path_buf();
        let note =
            create_note_blocking(root.clone(), String::new(), Some("Nota".into())).expect("create");
        let first_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" data-xenner-asset="safe"><rect x="1" y="2" width="3" height="4" /></svg>"#;
        let first = BASE64.encode(first_svg.as_bytes());
        let imported = import_asset_blocking(
            root.clone(),
            note.entry.path.clone(),
            "drawing.svg".into(),
            first,
        )
        .expect("import");
        let second_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" data-xenner-asset="safe"><circle cx="5" cy="6" r="2" /></svg>"#;
        let updated = update_asset_blocking(
            root.clone(),
            note.entry.path.clone(),
            imported.relative_path.clone(),
            BASE64.encode(second_svg.as_bytes()),
            Some(imported.revision.clone()),
        )
        .expect("update");
        assert_eq!(updated.mime, "image/svg+xml");
        assert_eq!(
            BASE64.decode(updated.data_base64).expect("decode"),
            second_svg.as_bytes()
        );
        let conflict_error = update_asset_blocking(
            root.clone(),
            note.entry.path.clone(),
            imported.relative_path.clone(),
            BASE64.encode(first_svg.as_bytes()),
            Some(imported.revision.clone()),
        )
        .expect_err("stale asset revision");
        assert_eq!(conflict_error.code, "conflict");
        delete_asset_blocking(
            root.clone(),
            note.entry.path,
            imported.relative_path.clone(),
        )
        .expect("delete");
        assert!(!root
            .join(".assets")
            .join(imported.relative_path.trim_start_matches("./.assets/"))
            .exists());
    }

    #[test]
    fn write_atomically_conserva_el_contenido_anterior() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");
        write_atomically(&path, "original").expect("first write");
        let mut replacement = AtomicWriteFile::open(&path).expect("atomic open");
        replacement
            .write_all(b"sustitucion")
            .expect("write replacement");
        drop(replacement);
        assert_eq!(fs::read_to_string(&path).expect("read"), "original");
    }
}
