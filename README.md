# xenner

Creador de notas de escritorio con la interfaz definida por archivos de texto:
la skin de la app es un conjunto de TXT que edita el usuario, no un tema
compilado. En este repositorio vive también el sitio público que explica el
producto.

| Ruta | Qué es | Stack |
| --- | --- | --- |
| [`xenner/`](xenner/) | App de escritorio | Tauri v2 + SolidJS + TypeScript + Rust |
| [`web/`](web/) | Sitio público | Astro, estático y sin framework de UI |

## La app

Xenner trabaja sobre una biblioteca local de archivos Markdown:

- **Explorer jerárquico** con carpetas, notas y assets: arrastre para mover,
  menú contextual, formatos de texto y renombrado en línea.
- **Editor visual** Milkdown/Crepe con encabezados, listas, tareas, tablas,
  código, enlaces, imágenes y fórmulas LaTeX (KaTeX).
- **Título ligado al nombre del archivo**, autoguardado con detección de
  cambios externos e historial acotado por nota.
- **Pizarra dentro de la nota**: trazo a mano alzada con grosor, texto,
  figuras e imágenes, y selección por rectángulo.
- **39 tipografías** agrupadas por sensación, con barra flotante al pasar el
  ratón por encima del texto y un modal de Ajustes con restablecer.
- **Ventana transparente** con skin de vidrio ahumado por defecto.

## Skins

Cada skin es una carpeta con `skin.txt` y un TXT por componente, más un
`custom.css` opcional y una carpeta `assets/`. El formato es una variable por
línea, `clave="valor"`, y `#` para comentarios. Un `.txt` puede llevar
`url(assets/imagen.svg)` en cualquier valor, así que un SVG propio puede ser el
fondo de un botón.

**Dónde están.** Las skins de la persona usuaria viven en la carpeta de
configuración del sistema, que la app crea al arrancar y que tiene un
`LEEME.txt` dentro:

| Sistema | Ruta |
| --- | --- |
| Windows | `%APPDATA%\xenner\` |
| macOS | `~/Library/Application Support/xenner/` |
| Linux | `~/.config/xenner/` |

La skin activa se elige en `skin-config.txt` con `skinPath="webcore"`. En
Ajustes sale la ruta exacta y hay un botón que la abre. Los temas que vienen con
la app viven en `xenner/skins/` dentro del paquete, y son de solo lectura.

Si el config falta, la ruta no existe o algún valor está corrupto, se usa la
paleta embebida en el código: la app nunca se queda en blanco ni se cuelga. Los
cuatro temas de ejemplo son `glass-default`, `webcore`, `pixel` y `aurora`.

El creador de skins vive dentro de la aplicación (*Ajustes → Crear un tema*):
tiene deslizadores para lo rápido, una fila por clave y por parte de la ventana
para lo que necesita texto, un editor de CSS y un botón para elegir una imagen o
una tipografía de tu disco. Las cuatro formas de escribir un tema producen los
mismos archivos.

## Desarrollo

Hace falta Node 22.12 o superior, pnpm y, para la app de escritorio, Rust
estable con las librerías de sistema que pida Tauri v2 para tu plataforma
([prerequisites](https://v2.tauri.app/start/prerequisites/)).

### App de escritorio

```bash
cd xenner
pnpm install
pnpm dev          # solo el frontend, en http://localhost:1420
pnpm tauri dev    # la ventana de escritorio
```

### Sitio público

```bash
cd web
pnpm install
pnpm dev
```

Copia `.env.example` a `.env` y define `SITE_URL` para que se generen los
canonical, el sitemap y el `robots.txt` con el dominio final.

## Verificación

```bash
cd xenner           && pnpm build   # 64 tests, typecheck y vite build
cd xenner/src-tauri && cargo check
cd web              && pnpm build   # 79 tests, astro check y build
```

Los detalles de cada pieza están en su propio README:
[`xenner/README.md`](xenner/README.md) y [`web/README.md`](web/README.md).

## Releases

Los dos workflows de `.github/workflows/` se encargan:

- **`ci.yml`**: en cada push a `main` y en cada pull request, corre los tests, el
  typecheck, `astro check` y `cargo check` de la app y de la web.
- **`release.yml`**: al publicar una release en GitHub, compila Xenner para
  macOS (Apple Silicon e Intel), Windows y Linux (AppImage, deb y rpm), y cuelga
  los instaladores en esa misma release.

La web lee esa release por la API de GitHub, así que **publicar una versión
muestra los botones de descarga sin volver a desplegar el sitio**.

Para probar el empaquetado sin publicar nada: **Actions → Release → Run
workflow**. Sube los binarios a una release nueva en borrador, así que no aparece
hasta que la publiques. El primer binario de una versión tarda bastante —Rust en
fresco, sin caché—; los siguientes, minutos.

### Linux se compila en Ubuntu 22.04, no en 24.04

Linux se compila en el runner más antiguo que se quiere soportar. Un binario
compilado en Ubuntu 24.04 pide `GLIBC_2.39` y no arranca en Debian 12 (2.36) ni
en Ubuntu 22.04 (2.35), que es justo donde se instala la mayoría de la gente.
Compilando en 22.04 el binario para en `GLIBC_2.35` y cubre todo lo posterior.

Por eso hay un job `verify` que baja los paquetes ya publicados y comprueba que
el binario no pida una glibc más nueva que esa, que el `.deb` tenga lanzador,
entrada de menú y skins, y que el AppImage tampoco pida una glibc nueva. El
empaquetado puede salir verde y el binario ser inútil para la mitad de la gente,
que es lo que pasó con la 1.1.0.

## Documentación

- [`xenner/docs/SKIN_SPEC.md`](xenner/docs/SKIN_SPEC.md) — especificación del
  sistema de skins en TXT, la fuente de verdad del formato.
- [`xenner/docs/EDITOR_ARCHITECTURE.md`](xenner/docs/EDITOR_ARCHITECTURE.md) —
  explorer, Markdown, editor, pizarra y configuración.
- [`xenner/docs/FRONTEND_ARCHITECTURE.md`](xenner/docs/FRONTEND_ARCHITECTURE.md) —
  capas del frontend, regla de dependencias, CSS y estado.

## Licencia

MIT. Ver [LICENSE](LICENSE).
