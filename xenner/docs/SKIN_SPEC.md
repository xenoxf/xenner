# SKIN_SPEC.md — Especificación del sistema de skins TXT de xenner (v1)

> Fuente de verdad del formato. Si el código y este doc discrepan, se corrige
> el código. Regla: **una skin rota o ausente jamás cuelga la app**: siempre se
> resuelve contra la skin default glassmorphism embebida en el código.

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
Si la carpeta no existe, no hay permiso o está corrupta, el scan devuelve
`[]` y la app usa la default embebida. Nunca lanza excepción al usuario.

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
`shadow`, `accent`, `font`.

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

1. Lee `config.txt` → `skinPath`.
2. Para cada componente, intenta cargar `skins/<skinPath>/<comp>.txt`;
   si falla, usa el diccionario embebido.
3. Parsea a `Record<clave, valor>` y lo publica como variables CSS:
   `--skin-<componente>-<clave>` en `:root` (ej. `--skin-note-blur`).
4. Los componentes SolidJS **solo** usan esas variables, nunca colores
   hardcodeados. Cambiar un TXT + recargar = nueva apariencia.

## 6. Skin default embebida (vidrio esmerilado)

Vive en el código (`src/skin/defaultSkin.ts`) y es idéntica al ejemplo
`skins/glass-default/`. Usa una paleta de humo frío, superficies translúcidas
y lechosas, `backdrop-filter: blur(...)`, bordes claros finos, sombras
difusas e iluminación interior sutil. Requiere ventana transparente
(`tauri.conf.json → "transparent": true` + `html,body{background:transparent}`)
para ver lo que hay detrás del desktop.

## 7. Límites v1 (declarados, no bugs)

- Sin imágenes ni recursos externos. `url(...)` se rechaza en el parser y la CSP
  de Tauri bloquea orígenes remotos. Una imagen local es trabajo futuro.
- Lecturas Rust limitadas a 4 KiB (`config.txt`), 16 KiB (`skin.txt`) y 64 KiB
  por componente; el scan inspecciona como máximo 512 entradas y lista 256 skins.
- El I/O de skins se ejecuta fuera del hilo principal. Se rechazan symlinks y
  rutas canonizadas que salgan de la carpeta `skins/`.
- Sin expresiones ni `calc()` con variables ajenas: el valor se inyecta tal cual.
- Recarga de skins con reinicio (hot-reload en fase futura).
- Skins de usuario fuera del bundle (AppData) → fase futura (Rust ya expone
  `scan_skins`/`read_skin_file` preparado para ello).

## 8. Transparencia de ventana y alcance del glass

Para que la skin glassmorphism muestre el escritorio hacen falta **dos**
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

