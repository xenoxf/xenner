//! La carpeta de Xenner: la configuración de la aplicación en un sitio que se
//! puede abrir, copiar y guardar.
//!
//! # Por qué una carpeta y no el directorio del sistema operativo
//!
//! `app_local_data_dir()` (que es lo que usaba la v1) es el lugar correcto para
//! una caché que la aplicación reescribe sola. No es el lugar correcto para
//! archivos que la persona edita a mano: ahí no se llega sin saber la ruta
//! exacta, y esa ruta cambia según el sistema. Nadie encuentra
//! `~/.local/share/com.juniorxf.xenner` por casualidad.
//!
//! Así que ahora hay un directorio con nombre corto y legible, en la carpeta de
//! configuración que ya usa el sistema operativo para esto:
//!
//! | Sistema  | Ruta                                          |
//! |----------|-----------------------------------------------|
//! | Windows  | `%APPDATA%\xenner\`                          |
//! | macOS    | `~/Library/Application Support/xenner/`      |
//! | Linux    | `~/.config/xenner/` (o `$XDG_CONFIG_HOME`)   |
//!
//! Es el mismo criterio que usan opencode, VS Code o cualquier otra app que
//! quiere que su configuración se pueda copiar a otro equipo. Dentro:
//!
//! ```text
//! xenner/
//!   LEEME.txt        qué es esto y qué se puede tocar
//!   skins/           los temas, uno por carpeta
//!   skin-config.txt  qué tema está puesto
//! ```
//!
//! # Migración
//!
//! Quien ya usaba la v1 tiene sus skins en `AppLocalData/skins/`. La primera
//! vez que arranca la v2 se copian al directorio nuevo, y solo si allí no hay
//! nada equivalente: nadie pierde un tema, y volver atrás a la v1 sigue
//! funcionando. Las notas **no** se tocan: la biblioteca de notas es del usuario
//! y vive donde él eligió, no aquí.

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// El nombre de la carpeta. Corto a propósito: es lo que se ve en la barra de
/// direcciones del explorador de archivos y en el título de una ventana.
const CONFIG_DIR_NAME: &str = "xenner";
const SKINS_DIR: &str = "skins";
const SKIN_PREFERENCE_FILE: &str = "skin-config.txt";
const README_FILE: &str = "LEEME.txt";
/// Marca de que la migración ya se hizo, para no repetirla en cada arranque.
const MIGRATION_MARKER: &str = ".migrado-a-la-carpeta-de-xenner";

/// Lo que el frontend necesita para decirte dónde está todo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigInfo {
    /// La raíz de la carpeta de Xenner.
    pub root: String,
    /// La carpeta de temas, con un slash al final para poder concatenar.
    pub skins: String,
    /// Dónde estaba antes, si alguien tiene una instalación antigua. `None` si
    /// nunca hubo una, o si ya no queda nada que migrar.
    pub previous: Option<String>,
}

/// El texto que explica la carpeta a quien la abre. Sin jerga: es la primera
/// vez que esa persona ve estos archivos, y va a estar mirando el explorador
/// de archivos, no un editor.
///
/// Va en `r##"…"##` y no en `r#"…"#` porque el texto del ejemplo contiene
/// `text="#ff00ff"`, y el `"#` de ahí cerraría la cadena antes de tiempo.
const README: &str = r##"ESTA ES LA CARPETA DE XENNER
===========================

Aquí Xenner guarda su configuración. Puedes abrirla, copiarla a otro
equipo o guardarla como copia de seguridad: si la borras, Xenner vuelve a
su aspecto de fábrica y no se rompe nada.


QUÉ HAY DENTRO
--------------

  skins/            Tus temas. Cada carpeta es un tema, y su nombre es el
                    que Xenner muestra en la lista de Ajustes.

  skin-config.txt   Dice qué tema está puesto ahora mismo.


CÓMO CAMBIAR EL ASPECTO SIN TOCAR NADA MÁS
-------------------------------------------

1. Abre la carpeta skins/.
2. Copia una de las que ya hay, o crea una carpeta nueva con un nombre
   corto, sin espacios y en minúsculas. Por ejemplo: mi-tema
3. Abre con el Bloc de notas (o cualquier editor de texto) el archivo
   note.txt que está dentro.
4. Busca la línea que empieza por  text="..."  y cambia lo que hay
   entre las comillas por el color que quieras, en hexadecimal.
   Por ejemplo:  text="#ff00ff"   (es magenta)
5. Guarda el archivo. Xenner se entera solo: a los dos o tres segundos la
   ventana ya está distinta. No hace falta cerrar nada.

Para poner tu tema: Ajustes → Temas → el tuyo. O escribe aquí
skin-config.txt esta línea, cambiando mi-tema por el nombre de tu carpeta:

  skinPath="mi-tema"


SI ALGO NO FUNCIONA
-------------------

Lo peor que puede pasar es que Xenner ignore lo que no entiende y se
quede con su aspecto de fábrica. No se queda en blanco, no se cuelga y no
avisa de nada, porque un archivo mal escrito tiene que ser un archivo
inofensivo.

Para empezar de cero, borra la carpeta skins/ y vuelve a abrir Xenner.


MÁS INFORMACIÓN
---------------

La documentación completa está en la web de Xenner, en /doc/.
"##;

fn is_plain_directory(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_plain_file(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_file() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

/// La raíz de la carpeta de Xenner, sin crearla ni comprobar nada.
///
/// Sale de `app_config_dir()` y no de `app_local_data_dir()` a propósito: la
/// primera es donde un sistema operativo guarda lo que el usuario configura, y
/// la segunda donde deja lo que la app manages sola. En Windows la diferencia
/// se nota de verdad: `%APPDATA%` (roaming) se sincroniza con el perfil de la
/// empresa, `%LOCALAPPDATA%` no.
pub fn config_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(CONFIG_DIR_NAME))
        .map_err(|error| format!("no se pudo resolver la carpeta de configuración: {error}"))
}

/// La carpeta de temas, con la raíz ya resuelta pero sin crearla.
pub fn user_skins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_root(app)?.join(SKINS_DIR))
}

/// El archivo que dice qué tema está puesto.
pub fn skin_preference_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_root(app)?.join(SKIN_PREFERENCE_FILE))
}

/// Escribe el archivo de texto con la marca de migración.
fn write_marker(root: &Path) {
    let path = root.join(MIGRATION_MARKER);
    if is_plain_file(&path) {
        return;
    }
    let _ = fs::write(
        &path,
        "Migrado desde AppLocalData. Este archivo solo sirve para no repetir la operación.\n",
    );
}

/// Copia un archivo o, si es una carpeta, su contenido. No sobreescribe nada que
/// ya exista: si el destino está ocupado, se deja como está. Un tema que se
/// copió a medias es peor que un tema que no se copió.
pub(crate) fn copy_tree_if_absent(from: &Path, to: &Path) {
    let Ok(metadata) = fs::symlink_metadata(from) else {
        return;
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        if !is_plain_directory(to) && fs::create_dir_all(to).is_err() {
            return;
        }
        let Ok(entries) = fs::read_dir(from) else {
            return;
        };
        for entry in entries.flatten() {
            copy_tree_if_absent(&entry.path(), &to.join(entry.file_name()));
        }
    } else if metadata.is_file() && !metadata.file_type().is_symlink() && !is_plain_file(to) {
        let _ = fs::copy(from, to);
    }
}

/// Qué habría en el directorio antiguo. `None` si no existe.
fn legacy_root(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok()
}

/// La migración de la v1: copia lo que hubiera en `AppLocalData` al directorio
/// nuevo, una sola vez.
///
/// Que se copie y no se mueva es deliberado: si algo va mal, el directorio
/// antiguo sigue ahí, y volver a la versión anterior sigue funcionando.
fn migrate_once(app: &AppHandle, root: &Path) -> Option<PathBuf> {
    let legacy = legacy_root(app)?;
    // `app_config_dir()` y `app_local_data_dir()` coinciden en Windows y en
    // macOS cuando no se distingue roaming de local. Si apuntaran al mismo sitio
    // no habría nada que migrar y copiar sería un bucle sin fin.
    if legacy.join(CONFIG_DIR_NAME) == *root {
        return None;
    }
    if legacy == *root {
        return None;
    }

    if !is_plain_file(&root.join(MIGRATION_MARKER)) {
        copy_tree_if_absent(&legacy.join(SKINS_DIR), &root.join(SKINS_DIR));
        copy_tree_if_absent(
            &legacy.join(SKIN_PREFERENCE_FILE),
            &root.join(SKIN_PREFERENCE_FILE),
        );
        write_marker(root);
    }

    // Para poder avisar en la interfaz, solo si quedaba algo.
    let skins = legacy.join(SKINS_DIR);
    let preference = legacy.join(SKIN_PREFERENCE_FILE);
    if is_plain_directory(&skins) || is_plain_file(&preference) {
        return Some(legacy);
    }
    None
}

/// Deja la carpeta lista: creada, con su subcarpeta de temas y su LEEME.
///
/// Se llama una vez al arrancar. Si algo falla, se calla: una carpeta que no se
/// puede crear no puede impedir que se abra la aplicación. Devuelve si la
/// carpeta no existía, que es lo que le permite a la interfaz decir «la he
/// creado» en vez de hacerse la interesante.
pub fn ensure(app: &AppHandle) -> bool {
    let Ok(root) = config_root(app) else {
        return false;
    };
    let just_created = !is_plain_directory(&root);
    if fs::create_dir_all(root.join(SKINS_DIR)).is_err() {
        return false;
    }
    let readme = root.join(README_FILE);
    if !is_plain_file(&readme) {
        let _ = fs::write(&readme, README);
    }
    migrate_once(app, &root);
    just_created
}

/// Abre una carpeta en el explorador de archivos del sistema.
///
/// Se hace con el comando de cada sistema en vez de con un plugin porque son
/// tres llamadas y una de ellas por sistema: `explorer` en Windows, `open` en
/// macOS y `xdg-open` en Linux. Un plugin metería un permiso de apertura de
/// URLs para poder abrir un directorio propio, que es bastante más superficie
/// de la que hace falta.
///
/// En Linux se prueban varios porque no hay uno solo: `xdg-open` es lo normal,
/// pero en una sesión de Wayland sin `xdg-utils` están `gio` y los de KDE, y en
/// WSL `wslview`. Se acepta el primero que arranca, que es el que el sistema
/// acaba usando aunque no quede ninguno.
///
/// Fuera de Android, que no tiene explorador de archivos y donde ni siquiera
/// existe un `Command` con el que lanzar nada.
/// Abre una carpeta con el explorador de archivos del sistema.
///
/// Vive aquí y no en `vault` porque lo usan los dos: la carpeta de Xenner y la de
/// un adjunto de una nota. La comprobación de que es una carpeta de verdad va
/// aquí, que es donde está el sentido de la función.
#[cfg(any(not(target_os = "android"), test))]
pub(crate) fn open_directory(path: &Path) -> Result<(), String> {
    open_in_file_manager(path)
}

/// En Android no hay explorador de archivos, así que tampoco hay nada que abrir.
#[cfg(target_os = "android")]
pub(crate) fn open_directory(_path: &Path) -> Result<(), String> {
    Err("en Android no hay explorador de archivos: la carpeta está dentro de la app".into())
}

#[cfg(any(not(target_os = "android"), test))]
fn open_in_file_manager(path: &Path) -> Result<(), String> {
    if !is_plain_directory(path) {
        return Err("esa carpeta no existe todavía".into());
    }

    let candidates: &[&str] = if cfg!(target_os = "windows") {
        &["explorer"]
    } else if cfg!(target_os = "macos") {
        &["open"]
    } else {
        &["xdg-open", "gio", "gnome-open", "kde-open", "wslview"]
    };

    let mut ultimo_error = String::new();
    for programa in candidates {
        // `gio` y `wslview` reciben un verbo delante de la ruta.
        let con_verbo = *programa == "gio" || *programa == "wslview";
        let mut comando = std::process::Command::new(programa);
        if con_verbo {
            comando.arg("open");
        }
        let spawned = comando
            .arg(path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        match spawned {
            Ok(_) => return Ok(()),
            Err(error) => ultimo_error = error.to_string(),
        }
    }
    Err(format!(
        "no se pudo abrir el explorador de archivos: {ultimo_error}"
    ))
}

#[tauri::command]
pub async fn config_info(app: AppHandle) -> Option<ConfigInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = config_root(&app).ok()?;
        let previous = legacy_root(&app).filter(|legacy| {
            legacy != &root
                && (is_plain_directory(&legacy.join(SKINS_DIR))
                    || is_plain_file(&legacy.join(SKIN_PREFERENCE_FILE)))
        });
        let skins = root.join(SKINS_DIR);
        Some(ConfigInfo {
            root: root.to_string_lossy().into_owned(),
            skins: format!("{}/", skins.to_string_lossy().trim_end_matches(['/', '\\'])),
            previous: previous.map(|legacy| legacy.to_string_lossy().into_owned()),
        })
    })
    .await
    .ok()
    .flatten()
}

/// Abre la carpeta de Xenner en el explorador de archivos.
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn reveal_config_dir(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = config_root(&app)?;
        if !is_plain_directory(&root) {
            fs::create_dir_all(root.join(SKINS_DIR))
                .map_err(|error| format!("no se pudo crear la carpeta: {error}"))?;
        }
        open_in_file_manager(&root)
    })
    .await
    .map_err(|_| "no se pudo abrir la carpeta".to_string())?
}

/// En Android no hay a dónde abrir.
///
/// La carpeta de Xenner vive dentro del almacenamiento privado de la aplicación
/// y además no existe ningún explorador de archivos para mirarla: ni en el
/// gestor de archivos del sistema, que no ve apps, ni con un `Command`, que en
/// móvil no se puede lanzar. Se responde con el motivo en vez de intentar nada.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn reveal_config_dir(_app: AppHandle) -> Result<(), String> {
    Err("en Android no hay explorador de archivos: la carpeta está dentro de la app".into())
}

/// Un archivo que la persona ha elegido para meter en su tema.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChosenAsset {
    /// El nombre original, tal cual se llamaba en el disco.
    pub name: String,
    /// El contenido, en base64, como espera `SkinAssetUpload`.
    pub data_base64: String,
    /// Los bytes de verdad, para poder decir «1,2 MB» sin calcularlo en el otro
    /// lado con la misma regla.
    pub bytes: u64,
}

/// Abre el diálogo del sistema para elegir una imagen o una tipografía.
///
/// Devuelve el contenido, no lo copia a ninguna parte: el archivo entra en la
/// skin cuando se guarda el tema, en una sola operación. Así el tema se puede
/// seguir cambiando sin dejar restos en la carpeta, y cancelar no deja nada.
///
/// Es la pieza que hace que «poner un SVG de fondo en un botón» sea una cosa
/// que se hace, y no una cosa que hay que saber escribir.
#[tauri::command]
pub async fn choose_skin_asset(app: AppHandle) -> Result<Option<ChosenAsset>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Elige una imagen para tu tema")
            .add_filter(
                "Imágenes y tipografías",
                &[
                    "svg", "png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "ico", "woff2",
                    "woff", "ttf", "otf",
                ],
            )
            .blocking_pick_file();

        let Some(file) = selected else {
            return Ok(None);
        };
        let path: PathBuf = file
            .into_path()
            .map_err(|error| format!("no se pudo leer el archivo: {error}"))?;

        if !is_plain_file(&path) {
            return Err("eso no es un archivo normal".into());
        }
        let bytes = fs::metadata(&path)
            .map_err(|error| format!("no se pudo leer el archivo: {error}"))?
            .len();
        if bytes == 0 {
            return Err("el archivo está vacío".into());
        }
        if bytes > crate::skin::MAX_ASSET_BYTES {
            return Err("el archivo es demasiado grande para un tema".into());
        }

        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .ok_or("el archivo no tiene nombre")?
            .to_string();

        let content = fs::read(&path).map_err(|error| format!("no se pudo leer: {error}"))?;
        Ok(Some(ChosenAsset {
            name,
            data_base64: base64::engine::general_purpose::STANDARD.encode(&content),
            bytes,
        }))
    })
    .await
    .map_err(|_| "no se pudo elegir el archivo".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_migracion_no_ademas_una_crepacion() {
        let dir = tempfile::tempdir().expect("tempdir");
        let origen = dir.path().join("AppLocalData");
        let destino = dir.path().join("AppData/xenner");
        fs::create_dir_all(origen.join("skins/mi-tema")).expect("origen");
        fs::write(origen.join("skins/mi-tema/note.txt"), "text=\"#fff\"").expect("nota");
        fs::write(origen.join("skin-config.txt"), "skinPath=\"mi-tema\"").expect("config");
        fs::create_dir_all(destino.join("skins")).expect("destino");

        // El destino ya trae un tema propio con el mismo nombre: ese no se toca.
        fs::create_dir_all(destino.join("skins/mi-tema")).expect("tema propio");
        fs::write(destino.join("skins/mi-tema/otro.txt"), "text=\"#000\"").expect("propio");

        copy_tree_if_absent(&origen.join("skins"), &destino.join("skins"));
        copy_tree_if_absent(
            &origen.join("skin-config.txt"),
            &destino.join("skin-config.txt"),
        );

        let skin = destino.join("skins/mi-tema");
        assert!(skin.join("note.txt").is_file(), "el tema debe copiarse");
        assert!(skin.join("otro.txt").is_file(), "lo que ya había se queda");
        assert_eq!(
            fs::read_to_string(destino.join("skin-config.txt")).expect("config"),
            "skinPath=\"mi-tema\""
        );
    }

    #[test]
    fn la_migracion_no_sigue_enlaces_simbolicos() {
        let dir = tempfile::tempdir().expect("tempdir");
        let origen = dir.path().join("AppLocalData");
        let destino = dir.path().join("destino");
        let secreto = dir.path().join("secreto.txt");
        fs::create_dir_all(origen.join("skins")).expect("origen");
        fs::write(&secreto, "no.should.land.here").expect("secreto");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&secreto, origen.join("skins/vinculo.txt")).expect("symlink");

        copy_tree_if_absent(&origen.join("skins"), &destino.join("skins"));
        assert!(!destino.join("skins/secreto.txt").exists());
        #[cfg(unix)]
        assert!(!destino.join("skins/vinculo.txt").exists());
    }

    #[test]
    fn el_leeme_no_pide_editar_nada_que_no_sea_un_texto() {
        // Si el archivo existe, no se pisa: alguien lo ha retocado a mano y es
        // suyo.
        let dir = tempfile::tempdir().expect("tempdir");
        let leeme = dir.path().join(README_FILE);
        fs::write(&leeme, "retocado por la persona").expect("leeme");
        if !is_plain_file(&leeme) {
            let _ = fs::write(&leeme, README);
        }
        assert_eq!(
            fs::read_to_string(&leeme).expect("leeme"),
            "retocado por la persona"
        );
    }

    #[test]
    fn el_leeme_va_a_rutas_de_ejemplo_que_funcionan() {
        // El texto del LEEME es lo primero que lee quien no sabe de skins. Si
        // el nombre de ejemplo se cambiara en el sistema sin tocar el LEEME, la
        // persona lo seguiría al pie de la letra y no encontraría nada.
        assert!(README.contains("skinPath=\"mi-tema\""));
        assert!(README.contains("skinPath"));
        assert!(README.contains("skins/"));
    }

    #[test]
    fn abrir_una_carpeta_que_no_existe_falla_en_vez_de_crearla() {
        let dir = tempfile::tempdir().expect("tempdir");
        let error = open_in_file_manager(&dir.path().join("no-existe")).expect_err("debe fallar");
        assert!(error.contains("todavía"));
    }
}
