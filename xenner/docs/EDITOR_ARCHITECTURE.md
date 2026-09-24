# EDITOR_ARCHITECTURE.md — Explorer, Markdown, editor y configuración

> Especificación de producto y técnica para sustituir el CRUD de tarjetas por una
> biblioteca de notas basada en archivos Markdown. La implementación evoluciona en
> fases verificables; el formato en disco no depende de la interfaz.

## 1. Decisiones de producto

- Una nota es un archivo UTF-8 con extensión `.md`.
- Una biblioteca es una carpeta local elegida por la persona usuaria.
- En el primer inicio se ofrece una biblioteca interna de Xenner; después puede
  abrirse o cambiarse otra con el selector de carpeta.
- El explorador ocupa la izquierda y el editor ocupa todo el espacio restante.
- Las carpetas organizan notas; el título de una nota es exactamente el nombre
  de su archivo Markdown, sin la extensión técnica `.md`. Editar el título
  renombra el archivo.
- El contenido enriquecido se escribe como Markdown, no como JSON oculto.
- Imágenes y dibujos se guardan como recursos relativos a la biblioteca.
- Los dibujos visuales usan SVG editable. El Markdown solo contiene una
  referencia Markdown a ese SVG, por ejemplo:

  ```md
  ![Diagrama del proyecto](Idea.assets/diagrama.svg)
  ```

## 2. Código de barras permitido

La primera versión reconoce únicamente:

- Markdown: `#`, `##`, `###`, párrafos, énfasis, negrita, tachado, citas,
  enlaces, listas, tareas, código y tablas compatibles con el editor.
- SVG: drawings editables dentro de la aplicación.
- Imágenes locales importadas a una carpeta de recursos relativa.

No se ejecutará HTML remoto ni Markdown arbitrario. Los recursos externos se
pueden mostrar como enlaces, pero no se incrustan de origen.

## 3. Flujo de una nota

1. La persona pulsa **Nueva nota**.
2. Xenner crea internamente un `.md` único y abre directamente el editor; no se
   solicita un nombre de archivo.
3. El campo superior de la página representa el nombre del archivo. Al
   confirmarlo, el archivo se renombra y el título visible se actualiza con él.
4. Si la biblioteca está vacía, la aplicación crea y abre automáticamente una
   nota sin título al entrar para que el editor esté siempre listo.
5. El nombre del archivo es la única fuente del título. El primer H1 se conserva
   como espejo Markdown para mantener el formato portable, pero nunca como
   metadato independiente del nombre.
6. Antes de cambiar de nota se vacía la cola de guardado para evitar cruces.

La nota no depende de una entrada `localStorage`: ese formato anterior solo se
usará una vez como origen de migración y se conservará como respaldo.

## 4. Persistencia en Rust

El backend será la autoridad sobre el sistema de archivos. Las operaciones
principales son:

- obtener o cambiar la biblioteca activa;
- escanear carpetas y archivos Markdown sin seguir symlinks;
- leer con límite de tamaño;
- crear carpeta o nota;
- renombrar y eliminar con confirmación en la UI;
- guardar de forma atómica;
- importar recursos dentro de la biblioteca.

La selección de una carpeta arbitraria se hace con el diálogo nativo de Tauri.
Una vez elegida, los comandos de archivos trabajan con esa raíz y validan todos
los componentes internos.

### 4.1 Seguridad de rutas

- Las rutas públicas del frontend son relativas y usan `/` como separador.
- Se rechazan rutas absolutas, `..`, componentes vacíos, controles y NUL.
- La raíz y cada padre se canonicalizan y se comprueba containment.
- No se siguen symlinks durante scan, lectura, escritura o rename.
- Los nombres se validan también contra ambiguidades de Windows.
- El I/O pesado se ejecuta con `spawn_blocking`.
- El contenido de notas tiene un límite de tamaño antes de escribir.
- El guardado usa un archivo temporal en el mismo directorio y un commit
  atómico: si falla, el Markdown anterior permanece intacto.

## 5. Editor visual

Se usará **Milkdown + Crepe**:

- Milkdown es un framework WYSIWYG Markdown basado en ProseMirror y Remark.
- Crepe aporta edición por bloques, comandos slash, listas y tareas, enlaces,
  imágenes, tablas, código, barra de formato y LaTeX.
- Milkdown documenta una receta para SolidJS usando su API vanilla; Solid no
  requiere una dependencia React.
- El flujo interno es Markdown → Remark AST → ProseMirror → Markdown. El primer
  H1 se conserva como espejo del nombre del archivo y no se edita dentro del
  cuerpo visual. El JSON del editor es solo estado de sesión; el archivo `.md`
  es la fuente de verdad.
  Las pizarras mutables incluyen un `drawingId` estable dentro del SVG y se
  copian al guardar si se detectan pizarras antiguas sin identidad. El cambio de
  nota o a Markdown espera a que la sesión de pizarra termine de guardar.

Cada instancia de editor se destruye al cambiar de nota para evitar que un
listener antiguo escriba sobre el archivo nuevo.

## 6. Dibujos visuales

Un dibujo es un bloque visual compuesto dentro de la interfaz que produce un SVG
relativo. El editor de lienzo tendrá como mínimo:

- selección y movimiento;
- rectángulos, elipses y líneas;
- flechas;
- trazo libre;
- texto;
- color, grosor y eliminación;
- deshacer/rehacer;
- guardar/cerrar.

Al insertar un dibujo, Milkdown conservará una referencia Markdown al SVG. Al
volver a abrirlo, Xenner recognize el recurso y permite editar el mismo archivo
SVG. La sanitización de SVG eliminate scripts, enlaces externos, handlers y
elementos HTML no permitidos antes de leer o mostrar un recurso.

## 7. Apariencia y skins

### 7.1 Apariencia

La sección **Apariencia** controla opciones ortogonales a la skin:

- modo `claro`, `oscuro` o `sistema`;
- tipografía de interfaz;
- tipografía del editor;
- tamaño de fuente del editor;
- interlineado;
- ancho máximo de lectura;
- densidad de interfaz.

Las preferencias se guardan de forma validada y se aplican como variables CSS.
El modo claro/oscuro solo altera la skin base embebida; una skin de usuario
declara su propio modo para evitar результаados ambiguos.

### 7.2 Skin base predeterminada

La skin embebida usa una interfaz neutra inspirada en herramientas de escritura
moderna, no en una superficie decorativa:

- superficies blancas o gris carbón;
- texto principal de alto contraste y texto secundario atenuado;
- un único acento azul para selección, foco y enlaces;
- bordes discretos y sombras reservadas para menús y barras flotantes;
- controles de 6–10 px que ganan superficie únicamente al interactuar.

La selección de colores sigue pasando por variables de skin, nunca por colores
hardcodeados en los componentes.

### 7.3 Catálogo

El modal de configuración tendrá tres secciones:

1. **Apariencia**
2. **Skins**: sistema y creadas por la persona usuaria
3. **Crear skin**

Las skins sistémicas son de solo lectura. Las de usuario viven en AppData, se generan
como carpetas TXT y conservan la validación y el fallback del SkinEngine actual.

El creador ofrece una base, color de acento, tipografía, radio y densidad. No
permite CSS arbitrario. El resultado sigue siendo editable como archivos TXT.

## 8. Modal de configuración

El acceso principal es un botón con icono de engranaje en la esquina superior
del explorador. El modal:

- es una superficie grande centrada;
- tiene navegación izquierda;
- mantiene foco dentro mientras está abierto;
- cierra con Escape o clic en el fondo;
- anuncia errores y cambios mediante regiones accesibles;
- guarda automáticamente las preferencias simples.

## 9. Fases

### Fase A — Biblioteca y explorer

- Backend seguro y biblioteca local elegible.
- Scanner jerárquico de carpetas y `.md`.
- Explorer, creación inmediata de páginas sin título, selección y autoguardado atómico.
- Migración única y no destructiva desde `xenner:notes:v1`.

### Fase B — Editor

- Milkdown/Crepe y serialización Markdown.
- Superficie de lectura con título arriba y barra flotante de assets abajo.
- Acciones de inserción accesibles por icono y menú `+` para imagen, figura y SVG.
- Cola de guardado y recuperación de errores.

### Fase C — Configuración y skin base

- Modal y preferencias de apariencia.
- Skin base light/dark y modo sistema.
- Galería separada entre skins del sistema y de usuario.

### Fase D — Skins de usuario

- Creación visual segura.
- Persistencia en AppData.
- Activación, edición mediante TXT y fallback embebido.

### Fase E — Dibujos

- Importación de imágenes relativas.
- Bloque de dibujo SVG y editor visual.
- Sanitización y apertura de referencias existentes.

## 10. Fuentes verificadas

- Milkdown SolidJS recipe: <https://milkdown.dev/docs/recipes/solidjs>
- Milkdown Crepe features: <https://milkdown.dev/docs/guide/using-crepe>
- Milkdown architecture: <https://milkdown.dev/docs/guide/architecture-overview>
- Milkdown FAQ/listeners: <https://milkdown.dev/docs/guide/faq>
- Tauri dialog plugin v2: <https://v2.tauri.app/plugin/dialog/>
- Tauri file-system plugin v2: <https://v2.tauri.app/plugin/file-system/>
- Tauri state management v2: <https://v2.tauri.app/develop/state-management/>

## 11. Criterios de aceptación

- Cerrar y reiniciar la aplicación conserva exactamente el Markdown escrito.
- Un corte durante el guardado no deja un `.md` truncado.
- Una rutaTraversal o symlink no permite leer/escribir fuera de la biblioteca.
- Cambiar de nota no puede guardar el contenido en la nota anterior.
- El archivo se puede abrir y editar fuera de Xenner sin perder su formato.
- Un SVG drawing sigue siendo visible como imagen en un visor Markdown.
- La skin rota o ausente nunca deja la app sin una interfaz utilizable.
- Los modos claro y oscuro cumplen el contraste de texto y mantienen controles
  de foco visibles.
