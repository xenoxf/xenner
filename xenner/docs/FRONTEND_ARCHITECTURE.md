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
  skin/                parser del formato TXT y catálogo de paletas
  styles/
    global.css         reset, html/body y TODOS los tokens
    components/*.module.css
  types/               contratos compartidos sin dependencias de runtime
  utils/               funciones auxiliares sin estado
  workspace/           estado, persistencia Markdown, árbol, note format e historial
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
- **todos los tokens**: los estructurales (z-index, duraciones), los de lectura
  que escribe Apariencia (`--skin-editor-size`, `--skin-content-width`, …) y la
  paleta base `--skin-<componente>-<clave>` en modo claro y su variante
  `:root[data-color-scheme="dark"]`.

No contiene selectores de componentes.

`global.css` es la única fuente de verdad de la paleta. Un TXT de skin o el
creador de Ajustes no redefinen el bloque: escriben la variable concreta en el
estilo inline de `<html>`, que gana por cascada. Por eso:

- una skin parcial nunca deja un componente sin estilo, sin código de mezcla que
  mantenga una segunda copia de la paleta en TypeScript;
- cambiar de modo claro/oscuro es conmutar `data-color-scheme` y no releer ningún
  TXT;
- el frontend consume `var(--skin-*)` y nada más. Si un componente necesita un
  color, se declara aquí y se puede sobreescribir desde una skin.

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

- La vista de escritorio son tres columnas: la barra de secciones
  (`ActivityBar`), el panel de notas (`ExplorerSidebar`) y el editor. La rejilla
  de `AppShell.module.css` es `auto auto minmax(0, 1fr)` y el ancho del panel lo
  pone `ExplorerSidebar.module.css`, no la rejilla: si el ancho estuviera en la
  rejilla, ocultar el panel dejaría una columna vacía de 236 px. `sidebarOpen` y
  `toggleSidebar` viven en `useAppController` porque los manejan dos sitios que
  no son el panel —el icono de la barra y el atajo `Ctrl+E`— y crear una nota
  desde el editor vuelve a abrirlo, ya que la fila para nombrarla está dentro.
- El ancho del panel llega como la variable `--sidebar-width`, no como un `width`
  en la hoja: si no se ha arrastrado el tirador no se escribe nada y manda el
  `clamp()` de `ExplorerSidebar.module.css`, que es lo que lo adapta a una
  ventana estrecha. Ese ancho y si el panel sale desplegado son preferencias de
  la ventana, no de Apariencia, y viven en `services/sidebarLayout.ts`. El
  tirador (`SidebarResizer`) es un `separator` con su papel: se arrastra con el
  puntero y también con las flechas, con `Shift` a saltos grandes y con
  `Inicio`/`Fin` a los topes; dos clics lo devuelven al ancho de la hoja.
- `workspace/store.ts` conserva el estado reactivo y la cola de autoguardado; el
  nombre del archivo es la fuente del título y el input superior lo renombra.
  El título se renombra al perder el foco del input, nunca en cada pulsación:
  renombrar reescribe el archivo y una recarga por palabra se sentía rota.
- El explorer usa drag-and-drop para mover entradas y un menú contextual para
  copiar Markdown, cortar/pegar, renombrar, crear, eliminar y abrir
  **Últimos cambios** de una nota.
- `workspace/history.ts` es el dominio puro del historial (coalescencia de
  guardados, límites y etiquetas relativas) y `services/noteHistory.ts` su
  persistencia en `localStorage`. `store.ts` registra una versión por guardado
  confirmado y expone `restoreNoteBody`, que antes de escribir vuelve a
  registrar el cuerpo actual: revertir también se puede revertir.
- El dock flotante del editor nunca roba el foco al `contenteditable`
  (`preventDefault` en `mousedown`). Gracias a eso el cursor de texto sobrevive
  al clic y los bloques insertados (pizarra, imagen) caen donde se estaba
  escribiendo. `MarkdownEditor` además recuerda la última posición de cursor
  válida y la repone antes de insertar, por si la selección fuese un
  `NodeSelection`.
- El hueco por debajo del texto de la columna devuelve el foco al editor al
  pulsarlo, en lugar de dejar el cursor en el aire.
- `services/workspace/` separa selección de gateway, adaptador Tauri, preview
  browser, estado preview y normalización de errores.
- `services/skinLoader.ts` mantiene la cadena de fallback y publica las claves
  `--skin-*` que define la skin activa como overrides inline; el resto lo
  resuelve `global.css`. No se movió el formato TXT.
- `services/appearance.ts` conserva preferencias y variables de lectura. Los
  valores con los que arranca Xenner viven en `data/appearance.ts`, porque son
  datos estáticos: el servicio los usa para sanear lo guardado y el modal para
  ofrecer «Restablecer» solo cuando algo se ha apartado de ellos.
- El texto de la interfaz nunca habla de implementación. Ni `global.css`, ni
  `--skin-*`, ni tokens, ni «Hover» o «Superficie»: en Ajustes el concepto de
  skin se llama **tema** y los colores se nombran por dónde se ven («Notas y
  barras», «Al pasar el ratón»). Lo técnico se queda en SKIN_SPEC.md. La regla
  sale de los patrones de Ajustes: los labels nombran la preferencia y las
  descripciones explican el resultado, nunca repiten la etiqueta.
- `services/toastService.ts` contiene estado y timers; `ToastRegion` solo
  renderiza y coordina animaciones de layout.
- `services/editorAssets.ts` es la única frontera usada por el editor para
  importar, leer, actualizar y eliminar assets. También trae los adjuntos, que
  son assets que no se previsualizan: `importAttachmentForEditor` y
  `chooseAttachmentForEditor` devuelven la ruta y el nombre, nunca el contenido.
- **Un adjunto es un enlace, no una imagen incrustada.** `insertAttachment` escribe
  `[Informe.pdf](./.assets/ab12….pdf)` usando la marca `link` de commonmark, en su
  propia línea: si el cursor estaba a media frase, `createParagraphNear` —o
  `splitBlock` al final del documento, donde `createParagraphNear` no hace nada—
  deja la frase arriba y el adjunto debajo. Por eso no pasa por
  `prepared.replacements`: ahí solo se sustituyen los `data:` que no caben en el
  archivo. El nombre y la extensión los decide `attachment_extension` en Rust y
  los necesita el frontend antes de que el archivo exista, así que la regla está
  también en `editor/attachment-paths.ts` y `src/editor/attachment-paths.test.ts`
  fija los dos lados. La vista previa del navegador guarda solo nombre y tamaño:
  los bytes de un PDF en `localStorage` tirarían la biblioteca entera.
- Adjuntar está en el menú del dock y también en el arrastre y el pegado: un
  archivo que no es imagen se adjunta, y uno que sí lo es se inserta como imagen,
  que es lo que se espera al soltar una foto en una nota.
- `services/editorSession.ts` coordina el modo texto/pizarra, el autoguardado
  del whiteboard y la protección al cambiar de nota.
- La pizarra es un nodo `whiteboard` de Milkdown con NodeView embebido en el
  flujo de la nota. El lienzo y la vista previa del dibujo comparten nodo, así
  que `shouldShowDrawingPreview` (puro, en `editor/whiteboard.ts`) es la única
  fuente de verdad de si la imagen se ve, y `WhiteboardNodeView.module.css`
  necesita `.preview[hidden] { display: none }` explícito: el `display` de la
  clase gana al `[hidden]` del navegador y sin él el lienzo se abriría debajo
  del dibujo. Se persiste como una imagen Markdown estándar bajo
  `.assets/`; al cerrarse se muestra solo el dibujo, recortado a sus bounds,
  sin una pizarra vacía alrededor. Mientras se edita, el lienzo queda aislado
  del editor para que sus gestos no muevan la nota.
- La barra flotante de formato de Crepe (`.milkdown-toolbar`) sale a los 20 ms
  de seleccionar, encima de lo seleccionado, y **no se esconde**. Se llegó a
  taparla con `opacity: 0` salvo que el puntero estuviera sobre el texto
  seleccionado, y era un desastre: al seleccionar con el teclado el puntero no
  se mueve, la barra no salía nunca y no había forma de poner negrita, cursiva o
  un título; con el ratón era una lotería, y la barra invisible seguía encima
  del texto cogiendo clics. Una interfaz oculta no es una interfaz. Lo que la
  hace desaparecer es Crepe, con `data-show="false"` (`display: none`), cuando
  la selección está vacía o el editor pierde el foco, que es lo correcto.
  `src/editor/toolbar.test.ts` vigila que nadie vuelva a esconderla.
- Los botones de esa barra los pone Crepe en su `buildToolbar` (negrita,
  cursiva, tachado, código, fórmula, enlace) y Xenner **añade** dos grupos al
  final, `blocks` y `appearance`. El orden importa: Crepe llama a
  `buildToolbar` después de montar sus propios grupos, así que añadir no quita
  nada.
  - El tipo de bloque entra por **un botón**, el `+` (`block-menu`), no por siete.
    Es el arreglo de un bug real: Crepe **no** pone ningún botón que cambie el
    tipo de bloque, así que el tipo solo se podía cambiar con el cursor en una
    línea. La primera versión del arreglo metió los siete botones en la barra y
    fue peor: dejó de caber sobre el texto y se partió en dos filas, tapando
    justo lo que se había seleccionado. El `+` abre `styles/components/
    MarkdownEditor.module.css` → `.blockMenu`, un panel **de 164 px y sin
    encabezados** que se ancla **debajo** de la barra flotante —encima está la
    propia barra— y que se recorta contra el borde de la nota con
    `BLOCK_MENU_WIDTH`, la misma medida que el CSS, porque los dos tienen que
    decir lo mismo o el panel se sale por la derecha. Los siete salen de
    `EDITOR_BLOCKS`, la misma lista que usa el dock. Qué botón va marcado lo dice
    `editor/block-type.ts` (`blockTypeAt`, `blockTypesInSelection`), que mira los
    ancestros del bloque y no solo su padre inmediato: el padre de un texto
    citado es un `paragraph`, y el de un elemento de lista un `list_item`. Con
    una selección de tipos mezclados no se marca ninguno, porque no hay un único
    tipo que poner.
- **El menú de tipos no puede robarle el foco al editor.** Vive dentro de la raíz
    del editor pero fuera del `contenteditable`, así que sin `keepEditorFocus()`
    en el `pointerdown` de sus filas, pulsar un tipo movía el foco al botón, el
    editor se quedaba sin selección y quien escribía veía desaparecer el texto
    que acababa de seleccionar. Es el mismo truco que el dock lleva usando con su
    `onMouseDown`, y por el mismo motivo. Además `toggleBlockMenu()` guarda la
    selección **al abrir**, no solo al perder el foco, para que el comando no
    dependa de que siga viva por el camino. `src/editor/toolbar.test.ts` vigila las
    dos cosas.
- Los menús de bloques son **listas cortas y planas**, sin buscador y sin
    encabezados de grupo: diez entradas de dos palabras se leen de un vistazo, y
    un filtro solo hace falta cuando hay muchas. El recorrido con teclado
    —flechas, Inicio, Fin, Escape— se conserva, que es como se usa sin ratón. Por
    eso `EDITOR_BLOCKS` ya no lleva `keywords`: si algún día hace falta filtrar,
    el filtro vuelve ahí como dato y no como un `input` metido en el menú.
  - Los dos botones de color no pueden usar el comando de Crepe porque abren el
    diálogo de color del sistema, que roba el foco y con él la selección: por eso
    `captureTextSelection()` la guarda antes y `applyTextStyleValue()` la vuelve a
    poner.
- **Cambiar el tipo de un texto seleccionado depende de la selección del
  `blur`.** El dock abre un menú que se queda con el foco —para que se pueda
  recorrer con el teclado— y la barra flotante lo conserva con un
  `onPointerdown`-preventDefault. Aun así el `contenteditable` se queda sin foco,
  y entre el clic y el comando el tipo acababa puesto en la línea del cursor en
  vez de en lo seleccionado. Por eso el plugin `xennerTextCursor` guarda la
  selección en `handleDOMEvents.blur` y `applyBlockType()` la recupera **antes**
  de llamar al comando. Guardarla solo en el `blur` es lo que evita el
  envejecimiento: cualquier clic o tecla posterior dentro del editor la borra,
  así que nunca se aplica un tipo a un texto que se dejó de seleccionar hace
  rato. `src/editor/toolbar.test.ts` vigila que la recuperación siga antes del
  comando.
- KaTeX es `white-space: nowrap`, así que una fórmula larga ensanchaba la
  columna de lectura. `span[data-type="math_inline"]` y `.katex-display` quedan
  acotados a `max-width: 100%` con desplazamiento horizontal interno, más una
  red de seguridad `overflow-wrap: anywhere` en párrafos, listas y celdas.
- En la pizarra, el texto en edición oculta su `<text>` del SVG: el input ocupa
  su hueco con el mismo tamaño de fuente y el color de la figura, para que no
  se lea dos veces superpuesto. Al arrastrar con el botón pulsado se dibuja el
  rastro del puntero en una capa `pointer-events: none` que se desvanece al
  soltar; nunca entra en el SVG ni en el historial de deshacer. Un clic en el
  dibujo marca el nodo como activo con un contorno, sin desplazar el layout.
- La pizarra selecciona en grupo como en un escritorio: con la herramienta de
  selección, arrastrar sobre el lienzo vacío dibuja un rectángulo (el lazo de
  Paint) y marca las figuras que toca, criterio de Miro y Figma. Pulsar sobre
  cualquier figura ya elegida arrastra el grupo entero; cada figura se mueve
  desde su posición original para que el desplazamiento no se acumule. Shift
  añade o quita figuras. Borrar, duplicar, recolorear y mover con flechas operan
  sobre toda la selección. Los tiradores de tamaño solo aparecen con una única
  figura, porque estirar un grupo exigiría decidir qué se mantiene fijo.
- El rectángulo de selección vive en `editor/drawing.ts` como
  `Marquee { origin, corner }`, NUNCA como rectángulo normalizado. El fallo que
  lo hacía funcionar solo hacia abajo: al guardar el rectángulo ya normalizado, su
  `x`/`y` pasan a ser el nuevo origen en cuanto el puntero cruza el punto de
  partida, y el área medida se queda corta (arrastrando 200×120 reportaba
  140×80). Guardando el origen aparte e inmutable, las cuatro direcciones dan el
  mismo rectángulo. `clampToCanvas` acota origen y puntero, y `marqueeHasArea`
  distingue un arrastre de un clic con 4 unidades de margen.
- El papel del lienzo es redimensionable: la esquina inferior derecha arrastra
  el borde, y el rectángulo elegido se serializa como `width`/`height` +
  `viewBox` del propio SVG, así que sobrevive al guardado. El `viewBox` es la
  unión de papel y contenido para que redimensionar nunca recorte una figura, y
  el historial de deshacer/rehacer de la pizarra incluye el tamaño del papel.
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
