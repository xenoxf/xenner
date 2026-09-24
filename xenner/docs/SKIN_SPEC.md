# SKIN_SPEC.md — Especificación del sistema de skins TXT de xenner (v1)

> Fuente de verdad del formato. Si el código y este doc discrepan, se corrige
> el código. Regla: **una skin rota o ausente jamás cuelga la app**: siempre se
> resuelve contra la skin base embebida en el código, con su paleta del modo
> claro u oscuro activo.

## 1. Dónde viven las skins

```
xenner/skins/
  config.txt            # selector de skin activa
  <nombre-skin>/
    skin.txt            # manifiesto (obligatorio para que el scan la liste)
    background.txt      # fondo del desktop / ventana
    button.txt          # botones
    note.txt            # tarjetas de nota
    sidebar.txt         # barra lateral (lista de notas)
    input.txt           # inputs y textarea
    toolbar.txt         # barra superior
```

El programa hace **scan** de `xenner/skins/` al arrancar (backend Rust
`scan_skins`): cada subcarpeta con `skin.txt` válido aparece en el selector.
Las skins creadas por la persona usuaria viven en
`AppLocalData/com.juniorxf.xenner/skins/` y se escanean en el mismo catálogo,
marcadas como `origin="user"`. Si la carpeta no existe, no hay permiso o está
corrupta, el scan devuelve `[]` y la app usa la default embebida. Nunca lanza
excepción al usuario.

## 2. Selección de skin activa — `config.txt`

```txt
# xenner skins config
# skinPath = carpeta dentro de skins/. Vacío o inexistente = default embebida.
skinPath="webcore"
```

- `skinPath=""` o archivo ausente → default embebida.
- Carpeta nombrada que no existe → default embebida (+ aviso en consola, sin crash).

## 3. Formato de los TXT (todos los componentes)

- Una variable por línea: `clave="valor"` (comillas opcionales: `clave=valor`).
- `#` al inicio (o tras espacios) = comentario. Líneas vacías se ignoran.
- Sin secciones, sin tipos, sin imports. Todo es texto.
- Clave duplicada → **gana la última**.
- Clave desconocida → **se ignora** (permite experimentar sin romper nada).
- Valor con `!important`, `;`, llaves, `url(...)`, `expression(...)`, `@import`,
  `javascript:`, `data:` o caracteres de control → se ignora. La v1 no
  permite cargar recursos ni estilos por red desde una skin.
- Claves que no pertenezcan al componente → se ignoran antes de crear variables CSS.

Ejemplo `note.txt`:

```txt
# tarjeta de nota
background="rgba(255,255,255,0.10)"
text="#ffffff"
border="1px solid rgba(255,255,255,0.18)"
radius="14px"
blur="16px"
shadow="0 4px 24px rgba(0,0,0,0.20)"
accent="#7dd3fc"
```

## 4. Claves por componente

Compartidas por todos: `background`, `text`, `border`, `radius`, `blur`,
`shadow`, `accent`, `font`. `textDim` está permitido en `background`,
`sidebar` y `toolbar`, donde la interfaz lo consume.

| Fichero          | Claves propias extra                              |
|------------------|---------------------------------------------------|
| `background.txt` | `overlay`                                            |
| `button.txt`     | `backgroundHover`, `textHover`, `borderHover`     |
| `note.txt`       | `backgroundHover`, `accent` (borde lateral/fecha) |
| `sidebar.txt`    | `itemHover`, `itemActive`, `textDim`              |
| `input.txt`      | `placeholder`, `focus` (color borde en foco)      |
| `toolbar.txt`    | `textDim`                                         |
| `skin.txt`       | `name`, `version`, `author` (manifiesto, no estilo)|

Toda clave ausente en la skin activa se toma de la **default embebida**.
Un componente entero ausente (`button.txt` no existe) = todo ese componente
en default. Así una skin puede ser de un solo TXT y seguir funcionando.

## 5. Cómo se aplican (SkinEngine, frontend)

1. Lee la preferencia de skin desde AppLocalData; si no existe, usa
   `config.txt` como fallback de compatibilidad.
2. Para cada componente, intenta cargar la skin sistémica o de usuario
   seleccionada; si falta un archivo o una clave, usa el fallback embebido
   del modo claro/oscuro activo.
3. Parsea a `Record<clave, valor>` y lo publica como variables CSS:
   `--skin-<componente>-<clave>` en `:root` (ej. `--skin-note-blur`).
4. Los componentes SolidJS **solo** usan esas variables, nunca colores
   hardcodeados. Cambiar un TXT + recargar = nueva apariencia.

## 6. Skin base embebida

Vive en el código (`src/skin/defaultSkin.ts`) y tiene dos paletas neutras, una
clara y otra oscura. La selección de modo se hace desde **Apariencia** y solo
modifica la skin embebida; las claves ausentes de una skin de usuario reciben
el fallback del modo activo.

La interfaz prioriza lectura y jerarquía antes que decoración:

- superficies blancas o gris carbón;
- texto principal de alto contraste y texto secundario atenuado;
- un único acento azul para selección, foco y enlaces;
- bordes sutiles, sombras reservadas para capas flotantes y controles de 6–10 px;
- controles planos que solo muestran superficie al pasar el cursor o recibir foco.

La skin de ejemplo `skins/glass-default/` se conserva como skin sistémica de
vidrio, pero ya no es el fallback default de la aplicación.

## 7. Límites v1 (declarados, no bugs)

- Sin imágenes ni recursos externos **dentro de una skin**. `url(...)` se
  rechaza en el parser y la CSP de Tauri bloquea orígenes remotos. Los assets
  de una nota se gestionan como archivos relativos, no como CSS de skin.
- Lecturas Rust limitadas a 4 KiB (`config.txt`), 16 KiB (`skin.txt`) y 64 KiB
  por componente; el scan inspecciona como máximo 512 entradas y lista 256 skins.
- El I/O de skins se ejecuta fuera del hilo principal. Se rechazan symlinks y
  rutas canonizadas que salgan de la carpeta permitida.
- Sin expresiones ni `calc()` con variables ajenas: el valor se inyecta tal cual.
- La skin activa se puede cambiar desde el modal; la selección temporal de una
  skin sistémica no reescribe el bundle de recursos.
- Las skins creadas por la persona usuaria viven en AppLocalData, se escanean
  junto a las sistémicas y mantienen el mismo fallback.

## 8. Transparencia de ventana y alcance del glass

La skin base embebida es opaca y no necesita transparencia. La transparencia
sigue siendo una característica opcional de las skins sistémicas de vidrio.

Para que una skin glassmorphism muestre el escritorio hacen falta **dos**
cosas (ambas presentes):

1. `xenner/src-tauri/tauri.conf.json` → `"transparent": true` (ventana ARGB).
2. `xenner/src/skin/skin.css` → `html, body { background: transparent; }`.

**Qué blurea qué:**

- `backdrop-filter` del CSS **solo blurea el DOM** (lo que hay detrás del
  elemento dentro de la página). No blurea el escritorio de detrás de la
  ventana.
- El blur nativo de lo que hay detrás de la ventana lo pone el
  **compositor/SO** (Linux) o el crate **`window-vibrancy`**
  (Windows/macOS — fase futura). Sin eso, el escritorio se ve **a través**
  de la ventana pero **sin difuminar** (borde del fondo nítido): es el
  comportamiento esperado, no un bug.

**Riesgo conocido:** `transparent: true` + Nvidia en Linux puede fallar
([tauri-apps/tauri#14924](https://github.com/tauri-apps/tauri/issues/14924)).
Mitigación prevista: conmutador `transparent: false` en `tauri.conf.json`
(la app pierde el efecto de escritorio pero sigue funcionando).

**Estado de verificación (2026-09-23):**

- Verificado en desktop real X11 + xfwm4 con compositor activo
  (`use_compositing=true`): patrón de prueba verde|azul detrás de la
  ventana **se ve a través** de toolbar, sidebar y editor (muestra de
  padding: G=244 con verde detrás, vs G=10 del fondo plano sin ventana).
- Blur del escritorio detrás de la ventana: **no activo** en xfwm4
  (coherente con el alcance de `backdrop-filter` descrito arriba) ?;
  `window-vibrancy` en Windows/macOS sin verificar aún.

