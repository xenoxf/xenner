//! Las skins del repo, dentro del binario, y su copia real en disco.
//!
//! # Por qué existe esto
//!
//! Las skins sistémicas se declaran como recurso del bundle, así que en el
//! escritorio acaban en una carpeta junto al ejecutable y `skin.rs` las abre sin
//! más. En Android eso no funciona: `resource_dir()` devuelve un URI de assets
//! (`asset://tauri/resources`), no una ruta del sistema de archivos, y `std::fs`
//! no sabe leerlo. La carpeta `skins/` acabaría dentro del APK y no habría forma
//! de abrirla desde Rust: la app arrancaría sin ningún tema.
//!
//! La salida es meter los archivos en el ejecutable. `build.rs` los recorre y
//! genera una tabla con `include_bytes!`; aquí se copian a la carpeta de datos de
//! la aplicación, que sí es un sitio de verdad. A partir de ahí, `skin.rs` los
//! encuentra por su camino habitual y no hay que tocar nada más.
//!
//! Se copia a una carpeta propia, `skins-sistema/`, y no encima de la del
//! usuario: estas son las skins de fábrica, y quien edite un `.txt` a mano lo hace
//! en `skins/`, no aquí.
//!
//! # Cuándo se copia
//!
//! Al arrancar, y solo si hace falta. El sello es un hash de todo lo que trae el
//! binario: si el sello del disco es el mismo, no se toca ningún archivo. Si
//! cambia, se reescribe únicamente lo que falta o lo que difiere, y nunca se
//! borra nada: lo que alguien haya dejado a mano en esa carpeta se queda ahí.

use atomic_write_file::AtomicWriteFile;
use blake3::Hasher;
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::AppHandle;

use crate::config;

/// Nombre de la carpeta donde se copia lo que trae el binario. Lo lee
/// `skin::system_skins_dir` como último recurso.
pub const DIRECTORY: &str = "skins-sistema";

/// Dónde se guarda el sello de la copia. Un archivo suelto en la carpeta, así
/// que `skin.rs` lo ignora al recorrer las skins.
const STAMP_FILE: &str = ".sello";

/// Las skins del repo, con sus bytes, tal cual las recogió `build.rs`.
///
/// Las rutas son relativas a la carpeta de skins y van con `/`, como las que
/// arma `skin.rs` al leer un componente.
pub const EMBEDDED: &[(&str, &[u8])] = include!(concat!(env!("OUT_DIR"), "/embedded_skins.rs"));

/// Qué hay que escribir: todo lo del binario, resumido en un hash.
///
/// Se alimenta de la ruta y de los bytes de cada archivo, en el mismo orden en
/// que se recorrieron, para que el mismo binario dé siempre el mismo sello.
/// Del hash sale solo la mitad, en hexadecimal: no es una firma criptográfica,
/// es para saber si hay algo que copiar.
fn sello() -> String {
    let mut hasher = Hasher::new();
    for (ruta, bytes) in EMBEDDED {
        hasher.update(ruta.as_bytes());
        hasher.update(bytes);
    }
    let hash = hasher.finalize();
    let mut valor = [0u8; 8];
    valor.copy_from_slice(&hash.as_bytes()[..8]);
    format!("{:016x}", u64::from_le_bytes(valor))
}

/// Escribe un archivo de forma atómica: primero a un temporal al lado y luego de
/// un golpe al sitio, que es como se escriben los `.txt` de las skins en
/// `skin.rs`. Un corte a mitad de escribir no puede dejar una skin corrupta.
fn escribir_atomico(ruta: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(padre) = ruta.parent() {
        fs::create_dir_all(padre)
            .map_err(|error| format!("no se pudo crear {}: {error}", padre.display()))?;
    }
    let mut archivo = AtomicWriteFile::open(ruta).map_err(|error| error.to_string())?;
    archivo
        .write_all(bytes)
        .map_err(|error| error.to_string())?;
    archivo.sync_all().map_err(|error| error.to_string())?;
    archivo.commit().map_err(|error| error.to_string())?;
    Ok(())
}

/// Escribe un archivo solo si falta o si su contenido es otro.
///
/// Devuelve si llegó a escribir. Nunca borra: un archivo de más es de alguien
/// que lo puso ahí a mano, y eso no es asunto de esta función.
fn escribir_si_cambia(destino: &Path, ruta: &str, bytes: &[u8]) -> Result<bool, String> {
    let archivo = destino.join(ruta);
    if fs::read(&archivo).is_ok_and(|actual| actual == bytes) {
        return Ok(false);
    }
    escribir_atomico(&archivo, bytes)?;
    Ok(true)
}

/// Instala las skins del binario en la carpeta de datos de la aplicación.
///
/// Devuelve si se escribió algo. Es deliberadamente inocua: un fallo no puede
/// tumbar la app, así que el error se devuelve como texto y quien llama decide
/// qué hacer con él.
pub fn install(app: &AppHandle) -> Result<bool, String> {
    let raiz = config::config_root(app)?;
    install_into(&raiz.join(DIRECTORY))
}

/// El trabajo de verdad, con la carpeta de destino ya resuelta: así se puede
/// probar con un `tempfile` sin levantar una aplicación.
fn install_into(destino: &Path) -> Result<bool, String> {
    let esperado = sello();
    let marca = destino.join(STAMP_FILE);
    if fs::read_to_string(&marca).is_ok_and(|actual| actual.trim() == esperado) {
        return Ok(false);
    }

    fs::create_dir_all(destino)
        .map_err(|error| format!("no se pudo crear {}: {error}", destino.display()))?;

    let mut escrito = false;
    for (ruta, bytes) in EMBEDDED {
        // Las rutas las pone `build.rs`, no la persona usuaria, pero un `..` en
        // medio de esta función escribiría fuera de la carpeta de destino sin
        // avisar. Se descarta antes de tocar el disco.
        if ruta
            .split('/')
            .any(|parte| parte.is_empty() || parte == "." || parte == "..")
        {
            return Err(format!("ruta de skin no válida: {ruta}"));
        }
        escrito |= escribir_si_cambia(destino, ruta, bytes)?;
    }

    // El sello va al final: si se escribiera antes, un corte a mitad de la copia
    // dejaría la carpeta marcada como al día con la mitad de los archivos.
    escribir_atomico(&marca, esperado.as_bytes())?;
    Ok(escrito)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Las dos rutas que se miran en las pruebas: el manifiesto de una skin y el
    /// archivo del sello, tal como quedan en la carpeta instalada.
    fn piezas(destino: &Path) -> (PathBuf, PathBuf) {
        (
            destino.join("glass-default/skin.txt"),
            destino.join(STAMP_FILE),
        )
    }

    /// Los bytes que trae el binario para esa ruta: es lo que tiene que acabar
    /// escrito en el disco, byte a byte.
    fn bytes_de(ruta: &str) -> &'static [u8] {
        EMBEDDED
            .iter()
            .find(|(embebida, _)| *embebida == ruta)
            .map(|(_, bytes)| *bytes)
            .expect("esa skin va embebida")
    }

    #[test]
    fn el_por_defecto_del_tema_no_viaja_en_el_binario() {
        // `skins/config.txt` es el `skinPath` por defecto, no una skin. Si se
        // copiara, su mtime sería el del momento de instalar, y
        // `read_config_blocking` da el archivo modificado más tarde entre ese y
        // `skin-config.txt`: la elección de la persona perdería en silencio.
        assert!(
            !EMBEDDED.iter().any(|(ruta, _)| *ruta == "config.txt"),
            "config.txt no debe embeberse: es la preferencia, no un tema"
        );
    }

    #[test]
    fn instalar_no_toca_el_por_defecto_del_tema() {
        // El caso completo, sin levantar la app: una preferencia escrita antes
        // tiene que seguir mandando después de instalar las skins.
        let dir = tempfile::tempdir().expect("tempdir");
        let destino = dir.path().join(DIRECTORY);
        install_into(&destino).expect("instalar");

        assert!(
            !destino.join("config.txt").exists(),
            "la copia no puede traer config.txt"
        );
        assert!(
            EMBEDDED
                .iter()
                .all(|(ruta, _)| !ruta.starts_with("config.txt")),
            "ni con una subcarpeta por delante"
        );
    }

    #[test]
    fn las_skins_del_repo_llegan_dentro_del_binario() {
        // Si `build.rs` no encuentra la carpeta, la lista sale vacía y la app
        // se queda sin temas sin decir nada. Esto es lo primero que lo delata.
        assert!(
            !EMBEDDED.is_empty(),
            "build.rs no metió ninguna skin en el binario"
        );
        assert!(
            EMBEDDED.iter().all(|(ruta, bytes)| {
                !ruta.starts_with('/') && !ruta.contains('\\') && !bytes.is_empty()
            }),
            "las rutas van sin raíz y con `/`"
        );
    }

    #[test]
    fn instala_las_skins_y_no_repite_trabajo() {
        let dir = tempfile::tempdir().expect("tempdir");
        let destino = dir.path().join(DIRECTORY);

        assert!(install_into(&destino).expect("instalar"));
        let (manifiesto, marca) = piezas(&destino);
        assert!(manifiesto.is_file(), "la skin tiene que estar en disco");
        assert!(marca.is_file(), "el sello tiene que estar escrito");

        let bytes = fs::read(&manifiesto).expect("leído");
        assert_eq!(
            bytes,
            bytes_de("glass-default/skin.txt"),
            "los bytes tienen que ser los del binario"
        );

        // Al segundo arranque no se toca nada: el sello sigue valiendo.
        assert!(!install_into(&destino).expect("reinstalar"));
    }

    #[test]
    fn repara_lo_que_falta_o_cambio_y_deja_el_resto() {
        // El sello manda: mientras coincida, esta función no toca el disco. Un
        // archivo borrado a mano vuelve cuando cambie el binario, no antes. En
        // el móvil nadie edita esa carpeta a mano, y en el escritorio hay copia
        // del bundle por delante.
        let dir = tempfile::tempdir().expect("tempdir");
        let destino = dir.path().join(DIRECTORY);
        install_into(&destino).expect("instalar");

        let (manifiesto, marca) = piezas(&destino);
        fs::remove_file(&manifiesto).expect("borrar");
        assert!(!install_into(&destino).expect("sello al día"));

        // Ahora sí cambia el sello, que es lo que dice «vuelve a copiar»: lo que
        // faltaba se repone, lo que cambió se arregla y lo que hay de más se
        // respeta.
        let nota = dir.path().join("nota.txt");
        fs::write(&nota, "esto no se toca").expect("nota");
        fs::write(&marca, "0000000000000000").expect("sello falso");
        fs::write(&manifiesto, "roto").expect("corromper");

        assert!(install_into(&destino).expect("reparar"));
        assert_eq!(
            fs::read(&manifiesto).expect("leído"),
            bytes_de("glass-default/skin.txt"),
            "el archivo cambiado vuelve a ser el del binario"
        );
        assert_eq!(
            fs::read_to_string(&nota).expect("nota"),
            "esto no se toca",
            "lo que hay en la carpeta no se borra"
        );
        assert_eq!(fs::read_to_string(&marca).expect("sello").trim(), sello());
    }

    #[test]
    fn un_sello_que_no_manda_vuelve_a_copiar_todo() {
        // Alguien (o una copia de la carpeta entre dos máquinas) dejó el sello de
        // otra versión. Copiar de nuevo es lo que deja el disco como debe.
        let dir = tempfile::tempdir().expect("tempdir");
        let destino = dir.path().join(DIRECTORY);
        install_into(&destino).expect("instalar");
        let (_, marca) = piezas(&destino);
        fs::write(&marca, "0000000000000000").expect("sello falso");

        assert!(!install_into(&destino).expect("reinstalar"));
        assert_eq!(
            fs::read_to_string(&marca).expect("sello").trim(),
            sello(),
            "un sello que no coincide se arregla sin escribir skins"
        );
    }

    #[test]
    fn si_el_destino_no_se_puede_crear_falla_sin_tumbar_nada() {
        let dir = tempfile::tempdir().expect("tempdir");
        let ocupado = dir.path().join(DIRECTORY);
        fs::write(&ocupado, "esto es un archivo, no una carpeta").expect("archivo");

        assert!(install_into(&ocupado).is_err());
    }
}
