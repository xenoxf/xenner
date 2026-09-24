# xenner

Editor de notas desktop construido con Tauri 2, SolidJS y TypeScript.

Xenner trabaja con una biblioteca local de archivos Markdown:

- explorer jerárquico con carpetas, notas `.md`, renombrado y eliminación;
- editor visual Milkdown/Crepe con encabezados, listas, tareas, tablas, código,
  enlaces, imágenes y LaTeX;
- guardado Markdown atómico con detección de cambios externos;
- biblioteca local elegible mediante el diálogo nativo de Tauri;
- drawings visuales guardados como SVG relativo;
- skins TXT editables y skin Material 3 clara/oscura integrada.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Para ejecutar la aplicación desktop:

```bash
pnpm tauri dev
```

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
