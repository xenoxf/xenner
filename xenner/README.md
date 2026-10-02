# xenner

Editor de notas desktop construido con Tauri 2, SolidJS y TypeScript.

Xenner trabaja con una biblioteca local de archivos Markdown:

- explorer jerárquico con carpetas, páginas Markdown, arrastre para mover y
  menú contextual;
- título igual al nombre del archivo, renombrado desde el editor, autoguardado y
  apertura automática de una nota sin título cuando la biblioteca está vacía;
- editor visual Milkdown/Crepe con encabezados, listas, tareas, tablas, código,
  enlaces, imágenes y LaTeX;
- guardado Markdown atómico con detección de cambios externos;
- biblioteca local elegible mediante el diálogo nativo de Tauri;
- drawings visuales guardados como SVG relativo;
- temas en archivos de texto editables, con `assets/` para imágenes y fuentes y
  un `custom.css` para lo que no cabe en una línea de ajuste;
- creador de temas dentro de la app: deslizadores para lo rápido, una fila por
  clave y por parte de la ventana con el valor escrito a mano, editor de CSS, y
  elección de imágenes de tu propio disco;
- carpeta de configuración propia —`~/.config/xenner`, `%APPDATA%\xenner`,
  `~/Library/Application Support/xenner`— que la app crea al arrancar, con un
  `LEEME.txt` dentro y un botón en Ajustes que la abre.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Para ejecutar la aplicación desktop:

```bash
pnpm tauri dev
```

## Android

La misma app empaquetada con `tauri android`: el mismo `src-tauri`, el mismo
código Rust y el mismo frontend.

### Prerrequisitos

- Rust con los targets de Android (`rustup target add aarch64-linux-android
  armv7-linux-androideabi i686-linux-android x86_64-linux-android`);
- JDK 17, con `JAVA_HOME` apuntando al runtime de Android Studio;
- Android SDK con Platform, Platform-Tools, NDK (side by side), Build-Tools y
  Command-line Tools, con `ANDROID_HOME` y `NDK_HOME` exportadas.

La lista completa, con los comandos por sistema operativo, está en
<https://v2.tauri.app/start/prerequisites/#android>.

### Puesta en marcha

El proyecto Gradle se genera una única vez:

```bash
pnpm android:init
```

Después, `pnpm android:dev` levanta el servidor de Vite y empuja la app al
dispositivo. Hace falta un dispositivo con depuración USB activada o un
emulador. `pnpm tauri android dev --open` abre Android Studio sobre el proyecto
generado, y el `android:dev` sigue corriendo en la otra terminal.

### Construir

```bash
pnpm android:build
pnpm android:release
```

`android:build` genera el APK de depuración y `android:release` el AAB de
publicación; `pnpm android:apk` genera el APK de publicación. Todo cae dentro de
`src-tauri/gen/android/app/build/outputs/`.

### Limitaciones en Android

- No se puede elegir una carpeta del sistema como biblioteca, porque el plugin de
  diálogo de Tauri no tiene selector de carpetas en móvil; la biblioteca vive en
  la carpeta privada de la app, que la crea la propia app.
- No se puede abrir la carpeta de Xenner en un explorador de archivos, porque
  Android no tiene uno al que lanzar.
- Elegir una tipografía para un tema desde el disco no es fiable, porque el
  selector de archivos de Android no resuelve rutas de fuentes.
- Renombrar, mover, copiar y borrar notas se hacen con el botón `⋯` de cada
  nota, porque arrastrar y soltar y el clic derecho son gestos de ratón y no
  existen en una pantalla táctil.
- La biblioteca es local y se queda en el dispositivo, sin sincronización con el
  escritorio.

`src-tauri/gen/android` se versiona en el repositorio. Al actualizar
`@tauri-apps/cli` el template se regenera, así que ese directorio puede pedir
revisión manual.

## Verificación

```bash
pnpm build
cd src-tauri
PATH="$HOME/.cargo/bin:$PATH" cargo check
PATH="$HOME/.cargo/bin:$PATH" cargo test
```

La skin embebida y el sistema de skins se documentan en
[`docs/SKIN_SPEC.md`](docs/SKIN_SPEC.md). La arquitectura de archivos, editor,
assets y drawings está en [`docs/EDITOR_ARCHITECTURE.md`](docs/EDITOR_ARCHITECTURE.md).
La estructura por capas, servicios, tipos y CSS Modules del frontend está en
[`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md).
