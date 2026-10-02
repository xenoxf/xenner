# SKIN_SPEC.md — Especificación del sistema de skins de xenner (v2)

> Fuente de verdad del formato. Si el código y este doc discrepan, se corrige
> el código. Regla: **una skin rota o ausente jamás cuelga la app**: siempre se
> resuelve contra la skin base embebida en el código, con su paleta del modo
> claro u oscuro activo.
>
> Para una guía de principio a fin, con ejemplos comentados y sin jerga, ver la
> sección *Guía* de la web (`/skins/`). Este documento es la referencia técnica.

## 0. Qué cambió en la v2

La v1 solo permitía cambiar colores. Cualquier otra cosa —una imagen de fondo,
un SVG, un marco alrededor de las notas, una paleta distinta para el modo claro
que para el oscuro, un espacio entre letras— era imposible, porque el formato
era `clave="valor"` y la lista de claves estaba cerrada en el código.

La v2 mantiene los TXT tal cual y **añade dos cosas**, sin romper nada de lo
anterior:

| Novedad | Dónde | Qué permite |
|---|---|---|
| Imágenes, SVG y tipografías | `assets/` + `url(...)` | Fondos, marcos, iconos propios |
| CSS libre | `custom.css` | Todo lo demás: geometría, animaciones, dos paletas |

Una skin escrita para la v1 sigue funcionando sin cambios.

## 1. Dónde viven las skins

Hay dos sitios, y se buscan en este orden:

**El de la persona usuaria** —donde se crean y se editan. Es la carpeta de
configuración del sistema, con un nombre corto y legible, y la crea la propia
aplicación al arrancar:

| Sistema | Ruta |
| --- | --- |
| Windows | `%APPDATA%\xenner\` |
| macOS | `~/Library/Application Support/xenner/` |
| Linux | `~/.config/xenner/` (o `$XDG_CONFIG_HOME/xenner/`) |

```
xenner/
  LEEME.txt             # qué es esto, en castellano, para quien la abra
  skin-config.txt       # qué skin está activa
  skins/
    <nombre-skin>/
      skin.txt          # manifiesto (obligatorio para que el scan la liste)
      custom.css        # CSS libre (opcional) — hoja de estilo de la skin
      background.txt    # fondo del desktop / ventana
      button.txt        # botones
      note.txt          # tarjetas de nota
      sidebar.txt       # barra lateral (lista de notas)
      input.txt         # inputs y textarea
      toolbar.txt       # barra superior
      assets/           # imágenes, SVG y fuentes de la skin (opcional)
```

**El del bundle** —las cuatro que vienen con la app, de solo lectura. Están en
`xenner/skins/` dentro del paquete instalado y solo se leen; no se pueden
escribir ahí, y por eso las que se tocan van en la carpeta de arriba.

El **scan** (backend Rust `scan_skins`) recorre las dos: cada subcarpeta con
`skin.txt` válido aparece en el selector, y las de la carpeta de la persona
usuaria salen marcadas como `origin="user"`. Si una de las dos no existe, no hay
permiso o está corrupta, el scan la salta y sigue con la otra. Si ninguna está,
la app usa la paleta embebida. Nunca lanza excepción al usuario.

**Por qué la carpeta de configuración y no el directorio interno de la app.**
`app_local_data_dir()` es el sitio correcto para una caché que la aplicación
reescribe sola. No lo es para archivos que alguien edita a mano: ahí no se llega
sin saber la ruta exacta, y la ruta cambia según el sistema. Nadie encuentra
`~/.local/share/com.juniorxf.xenner` por casualidad, y una documentación que
promete «edita tus archivos» sin decir cuáles es una promesa que no se puede
cumplir.

**Migración.** Quien usaba la versión anterior tiene sus skins en
`AppLocalData/skins/`. Al arrancar por primera vez se copian a la carpeta nueva,
y solo si allí no hay nada equivalente: nadie pierde un tema y volver a la
versión anterior sigue funcionando. Se copia, no se mueve, y se marca con un
archivo `.migrado-a-la-carpeta-de-xenner` para no repetirlo.

## 2. Selección de skin activa — `skin-config.txt`

```txt
# skin-config.txt, en la carpeta de Xenner
# skinPath = carpeta dentro de skins/. Vacío o inexistente = default embebida.
skinPath="webcore"
```

- `skinPath=""` o archivo ausente → la paleta embebida.
- Carpeta nombrada que no existe → la paleta embebida, con un aviso en consola y
  sin crash.

**Gana el archivo modificado más tarde.** El selector de Ajustes escribe en
`skin-config.txt`; el `config.txt` del bundle se lee cuando el primero no existe
o cuando su fecha de modificación es posterior. Así que editar `config.txt` a
mano después de haber usado el selector sí funciona, que era lo que la
documentación prometía y el código no cumplía.

## 2 bis. Escribir un tema, y editarlo

`create_skin` acepta dos vías de escritura y las dos producen los mismos
archivos:

- `components`: un mapa `componente → clave → valor`. Es lo que rellena el panel
  con deslizadores.
- `files`: el texto literal de cada `.txt`, tal cual se va a guardar. Si hay una
  clave aquí para un componente, **manda sobre `components`**.

Junto con ellas vienen `custom_css`, `assets` y `overwrite`:

- **`custom_css`** es `custom.css` entero. No se limpia ni se reordena: es CSS, y
  un CSS con un error de sintaxis solo pierde esa hoja.
- **`assets`** es una lista de `{ path, dataBase64 }` donde `path` es
  `assets/<nombre>.<ext>`. El nombre se valida pieza a pieza y no se limpia: si
  algo no cuadra, lo que tiene que pasar es un error con el motivo, no un
  archivo escrito donde no toca. Los valores de los `.txt` ya apuntan a
  `assets/<nombre>`, y la correspondencia es literal — sin traducción de ida y
  vuelta que se pueda desalinear.
- **`overwrite`** separa «crear» de «editar». Sin él, escribir sobre un tema
  propio que ya existe falla. Con él, se escribe en una carpeta aparte y se
  cambia al final, para que un fallo a mitad no deje el tema a medias.

Un `.txt` literal se guarda **sin tocar ni una letra**: comentarios, espacios,
orden y claves repetidas son de quien lo escribió. Y no se valida más que lo que
validaría el cargador: el creador es un editor de texto con deslizadores, no un
filtro. Lo que Xenner vaya a ignorar en un archivo escrito a mano se le dice en
la interfaz con el número de línea (`ignoredSkinLines` en `skin/parse.ts`), sin
bloquear el guardado. Bloquear obligaría a borrar lo que uno ha escrito para
poder guardarlo.

## 3. Formato de los TXT (todos los componentes)

- Una variable por línea: `clave="valor"` (comillas opcionales: `clave=valor`).
- `#` al inicio (o tras espacios) = comentario. Líneas vacías se ignoran.
- Sin secciones, sin tipos, sin imports. Todo es texto.
- Clave duplicada → **gana la última**.
- Clave desconocida → **se ignora** (permite experimentar sin romper nada).
- Claves que no pertenezcan al componente → se ignoran antes de crear variables CSS.
- Valor con `!important`, `;`, llaves o caracteres de control **fuera de un
  `url(...)`** → se ignora. Ver §3.1 para el caso de las imágenes.

### 3.1 Imágenes en los TXT

Un valor puede llevar un `url(...)` con dos formas y solo dos:

```txt
# una imagen de la carpeta assets/ de esta misma skin
overlay="url(assets/textura.png)"

# un SVG, que además se puede escalar sin perder nitidez
overlay="url(assets/iconos/hoja.svg)"

# un data: URL, para imágenes pequeñas que no merece la pena llevar en archivo
accent="url(data:image/svg+xml,%3Csvg%20viewBox='0%200%2024%2024'%3E%3C/svg%3E)"
```

Reglas, y por qué:

- Solo se admite un `data:` de tipo `image/*`. Un `data:text/html` no es una
  imagen y no se carga.
- La ruta debe ser **relativa y estar dentro de la skin**. Se rechazan
  `/etc/passwd`, `//servidor/x.png`, `../../fuera.png` y `C:\...`.
- Nada de `https://`. Un `url()` remoto está bloqueado por el CSP de Tauri
  (`img-src` no incluye ningún origen remoto), no por el parser: es la diferencia
  entre "no se puede" y "no se puede aunque lo intentes".
- Máximo 4 MiB por asset, y solo extensiones de imagen y fuente (§4.2).
- Una referencia que no se puede resolver se deja tal cual. El CSS la ignora y
  la superficie conserva su aspecto por defecto: **perder una imagen siempre es
  mejor que romper el componente entero**.

Sobre por qué un `data:` de imagen no es un problema de seguridad: en un hueco de
imagen del DOM los bytes se decodifican como píxeles, sin documento, sin origen
y sin contexto de script. Los documentos `data:` son de origen opaco único y su
navegación de primer nivel está bloqueada en todos los navegadores
([MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data)).
Un SVG en un hueco de imagen tampoco ejecuta nada: en contexto de imagen el
script está deshabilitado y no se cargan recursos externos
([MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)).
El CSP del proyecto ya traía `data:` en `img-src` y en `font-src`.

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
`shadow`, `accent`, `font`, `selection` y `selectionText`. `textDim` está
permitido en `background`, `sidebar` y `toolbar`, donde la interfaz lo consume.

### 4.1 `selection` y `selectionText` — lo que se ve al seleccionar texto

Son las dos claves que se añadieron después de encontrar que **la selección del
texto la pintaba el navegador**. No hay ninguna regla `::selection` propia del
sistema de skins, así que el motor usaba su color de fábrica, que depende del
`color-scheme` del **sistema**, no de la skin. En un tema oscuro con el sistema
en claro salía una banda clarísima encima del texto y la nota se dejaba de leer.

- `selection` es el color de fondo de lo seleccionado.
- `selectionText` es el color del texto que queda seleccionado.

Si una skin no dice nada, Xenner las deduce de sus propias claves, y por eso
**toda skin, incluidas las escritas a mano antes de que existieran, quedan bien
sin tocar una línea**:

```css
--skin-<componente>-selection: color-mix(in srgb, var(--skin-<componente>-accent) 30%, transparent);
--skin-<componente>-selectionText: var(--skin-<componente>-text);
```

Un tinte del propio acento sobre el propio fondo conserva el contraste, porque
el texto seleccionado es el texto del tema. Una skin que pone un color fuerte
en `selection` tiene que poner también `selectionText`, o el texto lo seguirá
eligiendo el navegador: con `selection` sí gana la skin, con el texto no.

Cada componente usa el suyo en su región (`data-x`), así que una skin con la
lista clara y la nota oscura tiene una selección que casa con cada una. El
editor es el caso aparte: Milkdown/Crepe pone el fondo de la selección con más
especificidad que la regla global, y Xenner le pasa el token por
`--crepe-color-selected` (`styles/components/MarkdownEditor.module.css`).

| Fichero          | Claves propias extra                              |
|------------------|---------------------------------------------------|
| `background.txt` | `overlay`                                            |
| `button.txt`     | `backgroundHover`, `textHover`, `borderHover`     |
| `note.txt`       | `backgroundHover`, `accent` (borde lateral/fecha) |
| `sidebar.txt`    | `itemHover`, `itemActive`, `textDim`              |
| `input.txt`      | `placeholder`, `focus` (color borde en foco)      |
| `toolbar.txt`    | `textDim`, `backgroundHover`                       |
| `skin.txt`       | `name`, `version`, `author` (manifiesto, no estilo)|

Toda clave ausente en la skin activa se toma de la **default embebida**.
Un componente entero ausente (`button.txt` no existe) = todo ese componente
en default. Así una skin puede ser de un solo TXT y seguir funcionando.

La lista vive en un solo sitio por idioma: `src/skin/keys.ts` la usa el parser del
frontend y `allowed_component_keys` de `src-tauri/src/skin.rs` la replica para
validar lo que se le pide escribir con `create_skin`. **Cualquier clave nueva hay
que añadirla a las dos**, o la skin creada desde la aplicación se rechazará al
volver a cargarla. Duplicada, las dos se desincronizaban una vez: por eso
`keys.ts` lleva escrito en su comentario por qué existen las dos.

Ese par de listas, junto con los valores por defecto que el panel enseña en cada
fila, son tres copias del mismo dato en tres sitios. Las tres se vigilan con
tests en vez de con disciplina: `parse.test.ts` comprueba que el aviso de
«línea ignorada» no señala ninguna clave que sí valga, y `editor.test.ts`
compara los valores por defecto contra `styles/global.css` clave por clave. Las
dos listas ya se habían desincronizado una vez, y el test de los valores ya ha
encontrado una falta.

La cuarta copia es el CSS que consume esas variables, y también está vigilada: el
test «la selección del texto la manda la skin, no el navegador» comprueba que los
tokens existen, que alguna regla los usa y que el editor los recibe. Ya pasó:
los tokens estaban declarados, la regla `::selection` no existía, y nada se
enteró.

### 4.2 Assets (`assets/`)

Extensiones admitidas y el MIME con el que se sirven:

| Categoría | Extensiones |
|---|---|
| Imagen | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.avif` `.bmp` `.ico` `.svg` |
| Fuente | `.woff2` `.woff` `.ttf` `.otf` |

Máximo 4 MiB por archivo. Los SVG admitidos se pintan en un hueco de imagen, que
es un contexto restringido (§3.1), pero **no se valida su contenido**: un SVG con
filtros, `foreignObject` u otros trucos avanzados puede no verse igual en todos
los motores. Si algo no se ve, pre-renderízalo a PNG.

## 5. `custom.css` — la superficie de poder

Un `custom.css` opcional en la carpeta de la skin. Es **CSS normal**, con todo lo
que eso significa: selectores, `::before` y `::after`, gradientes, `filter`,
animaciones, consultas de medios, variables propias. Se inyecta en un `<style>`
propio (`#xenner-skin-custom`), que se quita entero al cambiar de skin.

Máximo 512 KiB. Es el archivo que hay que abrir para hacer cualquier cosa que no
quepa en `clave="valor"`.

### 5.0.1 Orden de cascada

1. `src/styles/global.css` — valores embebidos, claro y oscuro
2. los TXT de componente — variables CSS en el estilo inline de `<html>`
3. `custom.css`

**El último manda.** Como una declaración `!important` de una hoja gana al estilo
inline normal, `custom.css` puede corregir incluso las claves que la propia skin
se define en sus TXT. Es intencionado y es lo que hace que el archivo sea la
herramienta de escape: si algo no se puede expresar en los TXT, se dice aquí.

### 5.0.2 A qué se puede agarrarse: `data-x`

Los componentes de SolidJS usan CSS Modules, así que **los nombres de clase
cambian en cada compilación** y no sirven para escribir una skin a mano. Por eso
cada superficie lleva un atributo `data-x` estable. Es el vocabulario público y
es contrato: no se renombra sin actualizar este doc y la guía.

| `data-x` | Qué es |
|---|---|
| `app` | La ventana entera: fondo, rejilla, imagen de fondo |
| `app-rail` | La casilla que aloja la barra de secciones |
| `app-notes` | La casilla que aloja la lista de notas |
| `app-editor` | La casilla que aloja el editor |
| `activity-bar` | La columna estrecha de secciones, pegada al borde izquierdo |
| `activity-bar-top` | Su grupo de arriba, donde vive la lista de notas |
| `activity-bar-bottom` | Su grupo de abajo, donde vive la configuración |
| `activity-tip` | El rótulo de un icono, el que sale al pasar por encima |
| `sidebar` | La columna de la lista de notas |
| `sidebar-header` | La cabecera del panel: el nombre de la sección y sus acciones |
| `sidebar-window-actions` | Los dos botones de la esquina (abrir, recargar) |
| `sidebar-toolbar` | La fila con «Nueva nota» y el contador |
| `sidebar-count` | El número de notas |
| `sidebar-resizer` | El tirador del borde derecho, para cambiar el ancho a pulso |
| `tree` | El área con scroll donde vive la lista |
| `tree-item` | Un nodo (nota o carpeta), con `data-kind="note\|directory"` |
| `tree-row` | La fila pulsable, con `data-selected="true"` y `data-drop-target` |
| `tree-row-chevron` | La flechita de carpeta |
| `tree-row-icon` | El icono de nota o carpeta |
| `tree-row-label` | El nombre |
| `note` | El panel del editor: la superficie de `note.txt` |
| `note-empty` | El estado «no hay nota abierta» |
| `note-workspace` | El contenedor que acepta arrastrar una imagen |
| `note-scroll` | La zona con scroll del editor |
| `note-document` | La columna de texto, con el ancho de `--skin-content-width` |
| `note-heading` | La fila con la ruta y el estado de guardado |
| `note-path` | La ruta del archivo, atenuada |
| `note-status` | «Guardado», «Sin guardar»… |
| `note-title` | El campo del título |
| `editor` | El editor Markdown en sí (y todo lo que lleva dentro) |
| `editor-surface` | El nodo que lo monta, para `::before`/`::after` |
| `toolbar` | La barra flotante del editor |
| `toolbar-button` | Un botón de la barra, con `data-x-open` si su menú está abierto |
| `button` | Cualquier botón. `data-x-role`: `primary`, `icon`, `rail` o `default`. `data-x-size` en los de icono |
| `modal` | Una ventana emergente. `data-x-modal`: `settings`, `history` o `command-palette` |
| `mobile` | La raíz de la vista móvil, la de los teléfonos. En el escritorio no existe |
| `mobile-topbar` | La barra de arriba de la lista: el título y sus dos iconos |
| `mobile-search` | El bloque del buscador. El campo de dentro lleva `data-x="input"` |
| `input` | Un campo de texto: la región de `input.txt`. Hoy, el buscador del móvil |
| `mobile-folder-strip` | La tira horizontal con todas las carpetas de la biblioteca |
| `mobile-folder-chip` | Una carpeta de la tira, con `data-selected="true"` si está filtrando la lista |
| `mobile-note-list` | El área con scroll donde están las notas |
| `mobile-note-row` | Una fila de nota, con `data-selected="true"` si es la abierta |
| `mobile-note-row-icon` | El icono de nota de la fila |
| `mobile-note-empty` | El estado «no hay nada que enseñar aquí» |
| `note-empty-icon` | El icono del estado «no hay nada que enseñar aquí» |
| `mobile-fab` | El botón flotante de nueva nota, abajo a la derecha |
| `mobile-editor` | La pantalla del editor, a pantalla completa |
| `mobile-editor-bar` | La barra del editor móvil: la flecha de vuelta y el nombre |

Los ganchos `mobile-*` solo existen en la vista móvil, que es una vista propia y
no el escritorio estrecho. Dos superficies reutilizan a propósito un gancho de
escritorio:

- `[data-x="sidebar"]` es la pantalla de la lista del móvil, porque es la misma
  superficie que la columna del explorador: el sitio donde vive la lista de
  notas. Las filas y los chips beben de los mismos tokens `--skin-sidebar-*`,
  así que una skin de la columna llega al móvil sin escribir una regla más. Lo
  que no se reutiliza son los ganchos del árbol (`tree-row` y compañía): en el
  móvil las filas son `mobile-note-row`.
- El editor del móvil es el `EditorPane` del escritorio, así que dentro valen
  `note`, `note-title`, `editor`, `editor-surface` y `toolbar` tal cual. Una skin
  escrita para el escritorio ya llega al móvil sin escribir nada más.

Los atributos `data-x-mobile` que acompañan a varios de ellos no forman parte
del vocabulario: son para el CSS Modules de la vista y pueden cambiar. Para
escribir una skin, `data-x`.

Ejemplos:

```css
/* el fondo de la ventana */
[data-x="app"] { background-image: url(assets/fondo.jpg); background-size: cover; }

/* las notas seleccionadas */
[data-x="tree-row"][data-selected] { background: #ffd166; }

/* solo el botón principal */
[data-x="button"][data-x-role="primary"] { border-radius: 0; }

/* los iconos de la barra de secciones */
[data-x="activity-bar"] { background: #101828; }
[data-x="button"][data-x-role="rail"][data-x-active="true"] { color: #ffd166; }

/* una marca decorativa, sin tocar el layout */
[data-x="sidebar-header"]::after {
  content: "✦";
  float: right;
  color: #ffd166;
}

/* en el móvil: la fila abierta y la carpeta que está filtrando */
[data-x="mobile-note-row"][data-selected] { background: #ffd166; }
[data-x="mobile-folder-chip"][data-selected] { border-color: #7dd3fc; }
```

Dentro de `[data-x="editor"]` hay HTML normal, así que además de `data-x` valen
los selectores de etiqueta de Markdown: `h1`, `h2`, `blockquote`, `code`, `pre`,
`table`, `a`, `ul`.

### 5.0.3 Variantes clara y oscura

Los TXT solo guardan un color, así que una skin escrita con ellos se ve igual en
los dos modos y queda ilegible en uno de los dos. `custom.css` lo arregla sin
tocar el motor: `services/appearance.ts` pone `data-color-scheme="light"` o
`"dark"` en `<html>` según el modo de Apariencia.

```css
:root[data-skin-id="miskin"]            { --tinta: #0b1020; --papel: #f6f8fd; }
:root[data-skin-id="miskin"][data-color-scheme="dark"] { --tinta: #e8f0ff; --papel: #0b1020; }

[data-x="app"] { background: var(--papel); color: var(--tinta); }
```

Declarar las variables en el bloque de arriba y usarlas con `var()` es lo que
evita tener que escribir cada regla dos veces. El prefijo `--` en el nombre es
la convención para «esto no lo lee Xenner, es mío», y evita chocar con los
tokens `--skin-*`.

### 5.0.4 Lo que sigue bloqueado, y por qué

| Se bloquea | Razón real |
|---|---|
| `url(https://…)`, `url(//…)` | Una petición de red desde el ordenador de quien la escribe, sin preguntar. Lo corta el CSP, no el texto, así que no se puede esquivar ofuscando la URL. |
| `url()` fuera de la skin | Leer un archivo cualquiera del disco. Lo corta la canonicalización en Rust, que también corta los enlaces simbólicos. |
| Extensiones que no sean de imagen o fuente | Evita que un `.html` o un `.js` acabe en un hueco de imagen. |
| `expression()`, `-moz-binding`, `behavior:` | Muertos en todo motor actual; se comprueban por si hubiera un WebView viejo. |
| Assets de más de 4 MiB, más de 256 skins, más de 512 entradas por carpeta | Memoria y tiempo de arranque. |

Lo que **no** está bloqueado, y es deliberado: `!important`, `calc()`,
`color-mix()`, `oklch()`, animaciones, `filter`, `position`, `transform`,
`@font-face` con un asset local, y selectores tan complejos como quieras.

Un `custom.css` con un error de sintaxis no rompe la aplicación: el navegador
descarta solo esa declaración, y el resto de la skin sigue aplicándose.

## 6. Cómo se aplican (SkinEngine, frontend)

1. Lee la skin activa: `skin-config.txt` de la carpeta de Xenner o el
   `skins/config.txt` del bundle, el
   que se haya modificado más tarde (§2).
2. Para cada componente, intenta cargar la skin sistémica o de usuario
   seleccionada. Un archivo ausente simplemente no aporta claves.
3. Parsea a `Record<clave, valor>` y escribe **solo esas claves** como
   variables `--skin-<componente>-<clave>` en el estilo inline de `:root`
   (ej. `--skin-note-blur`), con los `url()` ya resueltos a `data:`.
4. Inyecta `custom.css` como hoja propia y pone `data-skin-id` en `<html>`.
5. Los componentes SolidJS **solo** usan `var(--skin-*)` y `data-x`, nunca
   colores hardcodeados.

### 6.1 Recarga en vivo

`src/services/skinWatcher.ts` sondea cada 2,5 s los sellos (`tamaño` +
`mtime`) de los archivos de la skin activa, y recarga si alguno cambió. Guardar
un TXT o `custom.css` con la aplicación abierta **ya no exige reiniciar**. El
mismo patrón que el watcher de la biblioteca de notas.

### 6.2 Dónde vive el valor por defecto

`src/styles/global.css` es la **única fuente de verdad** de los tokens:

```css
:root { --skin-note-background: #ffffff; /* ... modo claro */ }
:root[data-color-scheme="dark"] { --skin-note-background: #202020; /* ... */ }
```

Consecuencias de ese reparto:

- El estilo inline de `<html>` gana al bloque `:root` por cascada, así que la
  clave que la skin define manda y **las que no define caen en el CSS**. Una
  skin parcial nunca deja un componente sin estilo, sin código de mezcla.
- Cambiar de modo claro/oscuro solo conmuta `data-color-scheme`; no hay que
  releer ningún TXT ni reescribir variables. Es lo que hace
  `services/appearance.ts`.
- No existe una segunda copia de la paleta en TypeScript. Antes vivía en
  `src/skin/defaultSkin.ts`, ya no.

## 7. Skin base embebida

Vive en `src/styles/global.css` (no en código) y tiene dos paletas neutras, una
clara y otra oscura, seleccionadas por `data-color-scheme`. Las claves ausentes
de una skin de usuario reciben el valor del CSS del modo activo.

La interfaz prioriza lectura y jerarquía antes que decoración:

- superficies blancas o gris carbón;
- texto principal de alto contraste y texto secundario atenuado;
- un único acento azul para selección, foco y enlaces;
- bordes sutiles, sombras reservadas para capas flotantes y controles de 6–10 px;
- controles planos que solo muestran superficie al pasar el cursor o recibir foco.

La skin de ejemplo `skins/glass-default/` se conserva como skin sistémica de
vidrio, pero ya no es el fallback default de la aplicación.

### 7.1 Skins de ejemplo que enseña

Dos, y las dos están para copiar:

- **`skins/pixel/`** — retro 8-bit. Enseña `border-image` con un marco 9-slice
  de 24×24 que estira sin deformarse, `mask-image` para teñir un SVG propio en
  vez de llevar un archivo por color, y las dos paletas claro/oscura.
- **`skins/aurora/`** — la mitad opuesta: ni una sola imagen, todo gradientes,
  `filter`, `backdrop-filter`, `::before` decorativo y una animación lenta.

## 8. Límites v2 (declarados, no bugs)

- **Nada de red.** Una skin no puede descargar nada: ni imágenes, ni hojas, ni
  tipografías. Es una restricción deliberada — una skin es código de terceros
  que se ejecuta en la máquina de quien la instala, y la regla es que no hable
  con nadie. El bloqueo es del CSP, no del parser, así que no se esquiva
  escribiendo la URL de otra forma.
- **Las imágenes solo desde `assets/`.** No hay `url()` a rutas absolutas ni de
  fuera de la carpeta de la skin (§3.1, §5.0.4).
- Lecturas Rust limitadas a 4 KiB (`config.txt`), 16 KiB (`skin.txt`), 64 KiB por
  componente, 512 KiB (`custom.css`) y 4 MiB por asset; el scan inspecciona como
  máximo 512 entradas y lista 256 skins.
- El I/O de skins se ejecuta fuera del hilo principal. Se rechazan symlinks y
  rutas canonizadas que salgan de la carpeta permitida.
- `custom.css` **no** se valida como CSS: se le pasa el navegador. Una regla con
  sintaxis inválida se descarta sola, y el resto de la skin sigue aplicando.
- Los SVG se pintan en contexto de imagen, donde el script está deshabilitado
  (§3.1), pero su contenido no se valida. Los rasgos avanzados de SVG
  (`filter`, `foreignObject`) pueden no renderizar igual en todos los motores;
  pre-renderiza a PNG si te Importa que se vea idéntico en todas partes.
- No hay modo «video»: un `assets/` con un `.mp4` no carga. El límite es de
  extensión, no de intención.
- La skin activa se puede cambiar desde el modal; la selección temporal de una
  skin sistémica no reescribe el bundle de recursos.
- Las skins creadas por la persona usuaria viven en la carpeta de Xenner (§1), se
  escanean junto a las del bundle y mantienen el mismo fallback.
- Editar un tema propio no puede romperlo a medias: se escribe en una carpeta
  aparte y se cambia al final. Si algo falla, el tema estaba entero antes.
- Lo que un `.txt` escrito a mano diga de más se guarda igual. El creador avisa
  con el número de línea, pero no bloquea: quien escribe un archivo de texto
  tiene que poder guardarlo entero.
- El historial de versiones de las notas es otra sesión local aparte
  (`xenner:note-history:v1`, máximo 25 versiones por nota). No es un backup: los
  `.md` siguen siendo la fuente de verdad.

## 9. Transparencia de ventana y alcance del glass

La skin base embebida es opaca y no necesita transparencia. La transparencia
sigue siendo una característica opcional de las skins sistémicas de vidrio.

Para que una skin glassmorphism muestre el escritorio hacen falta **dos**
cosas (ambas presentes):

1. `xenner/src-tauri/tauri.conf.json` → `"transparent": true` (ventana ARGB).
2. `xenner/src/styles/global.css` → `html, body { background: transparent; }`.

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


## 10. Los dos niveles del creador: empezar sin saber nada

El creador de temas tiene dos puertas a lo mismo, y ambas escriben los
mismos archivos `.txt`:

- **El camino corto sin jerga.** Color principal + modo claro/oscuro
  (`paletaDesdeColor` en `src/skin/palette.ts` rellena los nueve colores),
  una imagen de fondo elegida con botón (y `overlay` en `background.txt`),
  tipografía, redondeo y sombra. No se escribe ninguna clave a mano.
- **Cada parte por separado**, la edición por archivos y el `custom.css`
  libre de siempre.

El modo claro/oscuro del camino corto **no** reinicia la paleta: deriva del
color principal activo, para que cambiar de claro a oscuro conserve el tema
de la persona.

**Exportar un tema** copia la carpeta del tema con todo (`skin.txt`, los
`.txt`, `custom.css` y `assets/`) a la carpeta que elija la persona
(comando `export_skin`). El destino nunca se pisa: si ya hay algo con ese
nombre, se avisa.

**Traer un tema** es lo mismo del revés (comando `import_skin`): se elige la
carpeta del tema y queda instalada en la carpeta de la persona, lista para usar.
Valida tres cosas antes de copiar nada:

1. Que dentro haya `skin.txt`. Una carpeta cualquiera no es un tema, y el error
   lo dice con el nombre del archivo que falta.
2. Que el nombre de la carpeta sea un identificador válido (`valid_skin_id`): es
   el nombre con el que se va a guardar y con el que se busca después.
3. Que ese identificador esté libre. Si ya hay un tema tuyo con ese nombre, o si
   choca con uno incluido, se avisa en vez de pisar.

El nombre que sale en la lista de Ajustes sale de `skin.txt`, no del nombre de la
carpeta: quien exportó pudo llamarla como quiso.
