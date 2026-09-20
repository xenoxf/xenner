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
- Valor con `!important`, `;` o llaves → se ignora (higiene mínima anti-CSS-injection).

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
| `background.txt` | `image` (url o ruta, opcional), `overlay`         |
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

## 6. Skin default embebida (glassmorphism)

Vive en el código (`src/skin/defaultSkin.ts`) y es idéntica al ejemplo
`skins/glass-default/`. Estilo: superficies `rgba(255,255,255,0.08–0.14)`,
`backdrop-filter: blur(...)`, bordes `1px solid rgba(255,255,255,0.18)`,
texto `#ffffff`, acento `#7dd3fc`. Requiere ventana transparente
(`tauri.conf.json → "transparent": true` + `html,body{background:transparent}`)
para ver lo que hay detrás del desktop.

## 7. Límites v1 (declarados, no bugs)

- Sin imágenes externas salvo `background.image` (ruta/URL tal cual en CSS).
- Sin expresiones ni `calc()` con variables ajenas: el valor se inyecta tal cual.
- Recarga de skins con reinicio (hot-reload en fase futura).
- Skins de usuario fuera del bundle (AppData) → fase futura (Rust ya expone
  `scan_skins`/`read_skin_file` preparado para ello).
