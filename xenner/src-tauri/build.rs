use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    // Primero las skins del repo, para que el crate tenga su `include!` listo
    // cuando empiece a compilar. Lo de Tauri va detrás, igual que estaba.
    generar_skins_embebidas();

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "scan_skins",
            "read_skin_file",
            "read_skin_asset",
            "skin_file_stamp",
            "read_config",
            "set_active_skin",
            "create_skin",
            "choose_workspace",
            "scan_workspace",
            "read_note",
            "import_asset",
            "choose_image_asset",
            "read_asset",
            "update_asset",
            "delete_asset",
            "write_note",
            "create_note",
            "create_folder",
            "rename_entry",
            "move_entry",
            "delete_entry",
        ]),
    ))
    .expect("failed to build the Tauri application manifest");
}

/// Escribe `$OUT_DIR/embedded_skins.rs`: la lista de archivos de `../skins` con
/// sus bytes metidos en el binario.
///
/// Existe por Android. Allí `resource_dir()` no es una ruta del sistema de
/// archivos sino un URI de assets del APK, así que los recursos del bundle no se
/// pueden leer con `std::fs`; la carpeta `skins/` acabaría dentro del APK y
/// nadie podría abrirla. Al meter los bytes en el ejecutable, la app los copia a
/// su carpeta de datos al arrancar y ya son archivos de verdad. Ver
/// `src/embedded_skins.rs`.
///
/// Sin `skins/` no se rompe nada: se emite una lista vacía y se avisa. Un build
/// que no puede ni localizar la carpeta de skins tiene que salir con un aviso,
/// no con un `panic!`.
fn generar_skins_embebidas() {
    println!("cargo:rerun-if-changed=../skins");

    let destino =
        PathBuf::from(std::env::var("OUT_DIR").unwrap_or_default()).join("embedded_skins.rs");
    let raiz = match fs::canonicalize("../skins") {
        Ok(raiz) => raiz,
        Err(error) => {
            println!(
                "cargo:warning=xenner: no se encontró ../skins ({error}); la app saldrá sin skins del repo"
            );
            escribir(&destino, &[]);
            return;
        }
    };

    let mut encontradas: BTreeMap<String, PathBuf> = BTreeMap::new();
    let mut descartadas = 0usize;
    recorrer(&raiz, &raiz, &mut encontradas, &mut descartadas);
    if descartadas > 0 {
        println!(
            "cargo:warning=xenner: {descartadas} archivo(s) de ../skins quedaron fuera: nombre no válido en utf-8"
        );
    }

    println!("cargo:rerun-if-changed={}", raiz.display());
    let entradas: Vec<(&str, &Path)> = encontradas
        .iter()
        .map(|(relativa, absoluta)| (relativa.as_str(), absoluta.as_path()))
        .collect();
    escribir(&destino, &entradas);
}

/// Recorre `skins/` de arriba abajo. Un `BTreeMap` por ruta: el orden del
/// sistema de archivos cambia, y un binario que se compila distinto cada vez
/// hace imposible comparar dos builds.
///
/// Se ignoran los enlaces simbólicos: un enlace puede sacar archivos de fuera de
/// `skins/`, y lo que se mete en el binario tiene que ser exactamente lo que hay
/// en la carpeta del repo.
fn recorrer(
    raiz: &Path,
    actual: &Path,
    salida: &mut BTreeMap<String, PathBuf>,
    descartadas: &mut usize,
) {
    let Ok(entradas) = fs::read_dir(actual) else {
        println!("cargo:warning=xenner: no se pudo leer {}", actual.display());
        return;
    };

    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let Ok(tipo) = entrada.file_type() else {
            continue;
        };
        if tipo.is_symlink() {
            continue;
        }
        if tipo.is_dir() {
            recorrer(raiz, &ruta, salida, descartadas);
            continue;
        }
        if !tipo.is_file() {
            continue;
        }

        match ruta_relativa(raiz, &ruta) {
            Some(relativa) => {
                salida.insert(relativa, ruta);
            }
            None => *descartadas += 1,
        }
    }
}

/// Ruta del archivo dentro de `skins/`, con `/` y sin nada raro: `pixel/assets/logo.png`.
///
/// Es la misma forma que usa `skin.rs` para localizar un componente, así que lo
/// que se copia al disco es exactamente lo que el resto del backend espera.
fn ruta_relativa(raiz: &Path, ruta: &Path) -> Option<String> {
    let relativa = ruta.strip_prefix(raiz).ok()?;
    let partes: Vec<&str> = relativa
        .components()
        .map(|componente| componente.as_os_str().to_str())
        .collect::<Option<Vec<_>>>()?;
    if partes
        .iter()
        .any(|parte| parte.is_empty() || *parte == "." || *parte == "..")
    {
        return None;
    }
    Some(partes.join("/"))
}

/// Escribe el array de tuplas que `embedded_skins.rs` mete con `include!`.
///
/// Las rutas de `include_bytes!` son absolutas porque la macro se resuelve
/// relativo al fichero que la contiene, y este fichero vive en `OUT_DIR`.
fn escribir(destino: &Path, entradas: &[(&str, &Path)]) {
    let mut codigo = String::from("// Generado por build.rs. No editar a mano.\n&[\n");
    for (relativa, absoluta) in entradas {
        println!("cargo:rerun-if-changed={}", absoluta.display());
        codigo.push_str(&format!(
            "    ({:?}, include_bytes!({:?}) as &[u8]),\n",
            relativa,
            ruta_include(absoluta)
        ));
    }
    codigo.push_str("]\n");

    if let Err(error) = fs::write(destino, codigo) {
        // Ni `panic!` ni nada: si no se puede escribir, que lo diga el aviso y
        // que el crate falle al no encontrar el `include!`.
        println!(
            "cargo:warning=xenner: no se pudo escribir {}: {error}",
            destino.display()
        );
    }
}

/// Ruta apta para `include_bytes!`: separadores `/` y sin el prefijo verbatim
/// de Windows, que `include_bytes!` no entiende.
fn ruta_include(ruta: &Path) -> String {
    let texto = ruta.to_string_lossy().replace('\\', "/");
    texto
        .strip_prefix("//?/")
        .map_or(texto.clone(), |resto| resto.to_string())
}
