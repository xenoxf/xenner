# FRONTEND_ARCHITECTURE.md — Fronteras del frontend SolidJS

> Estructura y reglas de mantenimiento del frontend. Este documento no cambia
> los contratos de archivos Markdown, Tauri o skins; solo define cómo se
> organizan sus capas.

## 1. Estructura

```text
src/
  app/                 composición y controladores de ciclo de vida
  components/          UI; agrupada por explorer, editor, settings, etc.
  data/                catálogos y valores estáticos sin efectos secundarios
  editor/              dominio puro: rutas, color, figuras y drawings
  notes/               modelo y compatibilidad legacy
  services/            Tauri, localStorage, assets, apariencia y notificaciones
  skin/                parser y skin base embebida
  styles/
    global.css         reset, html/body y tokens globales
    components/*.module.css
  types/               contratos compartidos sin dependencias de runtime
  utils/               funciones auxiliares sin estado
  workspace/           estado, persistencia Markdown, árbol y note format
```

`src/index.tsx` solo monta la aplicación e importa `styles/global.css`.
`src/app/App.tsx` compone el shell; no contiene acceso directo a Tauri ni
reglas visuales.

## 2. Regla de dependencias

```text
app/components → services/data/types/utils
services → domain/types/data
skin/editor/notes/workspace/domain → types
```

- `types/` no importa Solid, Tauri, DOM ni servicios.
- `data/` solo contiene datos estáticos y sus tipos.
- Los componentes no importan `@tauri-apps/api` ni el gateway del workspace.
- Los servicios son la frontera de Tauri, `localStorage`, assets y toasts.
- No hay barrels que reexporten casi todo el proyecto.

`workspace/store.ts` se mantiene como una unidad porque su cola de guardado,
revisiones, selección y watcher comparten estado mutable crítico. Extraer sus
signals sin una máquina de estados equivalente aumentaría el riesgo.

## 3. CSS

### `global.css`

Contiene exclusivamente:

- reset;
- `html`, `body` y `#root`;
- `background: transparent`, requisito de las skins de vidrio;
- tipografía base;
- `.sr-only`;
- estado global `disabled`;
- reduced motion;
- tokens estructurales como z-index y duraciones.

No contiene selectores de componentes ni una paleta estática `--skin-*`.

### CSS Modules

Todo CSS de componente vive en `src/styles/components/` como
`Componente.module.css` y se importa únicamente desde su componente. El mapa
de clases se consume con:

```tsx
import styles from "../styles/components/Componente.module.css";

<div class={styles.panel} />
```

Los componentes compartidos (`Button`, `IconButton` y `ModalBackdrop`) tienen
su propio módulo. Milkdown y ProseMirror son DOM de terceros: sus selectores
se limitan con `:global(...)` dentro de `MarkdownEditor.module.css`; no se
convierten en clases globales de aplicación.

## 4. Estado y servicios

- `workspace/store.ts` conserva el estado reactivo y la cola de autoguardado; el
  nombre del archivo es la fuente del título y el input superior lo renombra.
- El explorer usa drag-and-drop para mover entradas y un menú contextual para
  copiar Markdown, cortar/pegar, renombrar, crear y eliminar.
- `services/workspace/` separa selección de gateway, adaptador Tauri, preview
  browser, estado preview y normalización de errores.
- `services/skinLoader.ts` mantiene la cadena de fallback y publica variables
  `--skin-*`; no se movió el formato TXT.
- `services/appearance.ts` conserva preferencias y variables de lectura.
- `services/toastService.ts` contiene estado y timers; `ToastRegion` solo
  renderiza y coordina animaciones de layout.
- `services/editorAssets.ts` es la única frontera usada por el editor para
  importar, leer, actualizar y eliminar assets.
- `services/editorSession.ts` coordina el modo texto/pizarra, el autoguardado
  del whiteboard y la protección al cambiar de nota.
- La pizarra es un nodo `whiteboard` de Milkdown con NodeView embebido en el
  flujo de la nota. Se persiste como una imagen Markdown estándar bajo
  `.assets/`; al cerrarse se muestra solo el dibujo, recortado a sus bounds,
  sin una pizarra vacía alrededor. Mientras se edita, el lienzo queda aislado
  del editor para que sus gestos no muevan la nota.
- `BlockEdit` de Crepe proporciona el `+` contextual y el menú slash; el dock de
  Solid empieza por el selector de texto y deja imagen y pizarra como
  inserciones opcionales. El dock se oculta mientras una pizarra está activa.
- `notes/store.ts` permanece como compatibilidad del CRUD antiguo y no se
  mezcló con `NoteDocument`.

## 5. Verificación

```bash
pnpm test
pnpm typecheck
pnpm build
```

Los tests siguen enumerados en `package.json` porque usan el ejecutor nativo de
Node. Si se añade un test puro nuevo, debe incorporarse también a ese script.

## 6. Fuentes oficiales consultadas

- SolidJS, CSS Modules: <https://docs.solidjs.com/guides/styling-components/css-modules>
- Vite 6, CSS Modules: <https://v6.vite.dev/guide/features#css-modules>
- Vite, HMR de CSS: <https://v6.vite.dev/guide/features#css>
- Vite, tipos `CSSModuleClasses`: <https://github.com/vitejs/vite/blob/v6.4.3/packages/vite/client.d.ts>
- CSS Modules, scope local: <https://github.com/css-modules/css-modules/blob/master/docs/local-scope.md>
- CSS Modules, `composes` y escapes `:global`: <https://github.com/css-modules/css-modules/blob/master/docs/composition.md>

Vite 6 y `vite-plugin-solid` ya soportan CSS Modules y HMR; no se añadió un
plugin de CSS adicional ni configuración manual innecesaria.
