## Xenner 1.2.0

Tu tema ya no está escondido en una carpeta que no se encuentra, y el creador
de temas ha dejado de tener techo.

### Dónde están tus cosas

Xenner ahora tiene **carpeta propia**, en el sitio donde tu sistema guarda la
configuración de los programas, y con un `LEME.txt` dentro que lo explica:

| Sistema | La carpeta |
| --- | --- |
| Windows | `C:\Users\TUUSUARIO\AppData\Roaming\xenner\` |
| macOS | `~/Library/Application Support/xenner/` |
| Linux | `~/.config/xenner/` |

Dentro están tus temas, con un archivo de texto por parte de la ventana, una
carpeta `assets/` con tus imágenes y tipografías, y un `custom.css`.

En **Ajustes → Temas** sale la ruta escrita y hay un botón que la abre en el
explorador de archivos. Antes la ruta era la del directorio interno de la
aplicación, que cambia según el sistema y que no se encuentra por casualidad.

Si venías de la 1.1.1, tus temas se han copiado solos a la carpeta nueva. La
antigua se puede borrar cuando quieras.

### Un creador de temas sin techo

El de Ajustes → Crear un tema tiene ahora tres formas de hacer lo mismo, y las
tres escriben los mismos archivos:

- **Con deslizadores**, como antes. Nueve colores y cuatro medidas.
- **Cada parte por separado**: fondo, lista de notas, nota, barra, botones y
  campos, con todas sus claves y el valor escrito a mano. Aquí caben
  degradados, sombras largas y medidas que no salen de un deslizador.
- **El CSS entero**, para lo que no cabe en una línea de ajuste: dónde está cada
  cosa, cuánto se mueve, y una paleta distinta de día y de noche.

Y en las dos primeras hay un botón para **elegir un archivo de tu disco**: un
SVG, un PNG, una tipografía. Poner un SVG de fondo en un botón es un campo de
texto, no un truco. Puedes renombrarlo sin romper las referencias, y el panel te
avisa si una imagen se queda sin usar.

También se pueden **volver a abrir los temas que creaste** y seguir
tocándolos. Antes solo se podían crear.

Un detalle que importa: los deslizadores solo pisan lo que ellos saben hacer, un
color o una medida. Si pusiste una imagen o un degradado a mano, siguen ahí
cuando muevas el resto.

### La documentación, para quien no sabe CSS

No hace falta que sepas de CSS ni de programación. Hay un
[capítulo nuevo con las quince palabras](https://xenner.app/doc/palabras/) que
salen en el resto de la documentación, cada una con su ejemplo, y la
[documentación entera](https://xenner.app/doc/) dice en la primera página que
hay tres caminos y cuál es el de mover el ratón.

La ruta de la carpeta de arriba también sale por escrito, para los tres
sistemas.

### Arreglos

Cosas que estaban rotas y no se sabían:

- **Un valor con letra acentuada tumbaba el backend.** Al comprobar los valores
  de un archivo de tema se recorría byte a byte, así que una `á` partía la
  cadena a la mitad. Escribir un nombre de tipografía con tilde, o cualquier
  texto en español, era un fallo del proceso.
- **Editar un tema borraba sus imágenes.** Al guardar encima de un tema que ya
  existía se vaciaba la carpeta entera, y las imágenes que ya estaban en el disco
  no volvían nunca. El `url()` se quedaba apuntando a un archivo que ya no
  estaba, sin ningún aviso.
- **Mover un deslizador borraba la imagen y el CSS** que habías puesto a mano.
- **El botón «Editar» de cada tema no funcionaba**, porque estaba dentro de otro
  botón, que es HTML que no vale.
- **Un selector de color con un tema transparente se ponía negro.** Los temas
  usan `rgba(...)` y `#rrggbbaa` a menudo, y el selector de color del sistema no
  los entiende.
- **La documentación decía «dentro de la carpeta de Xenner»** sin decir nunca
  cuál era la carpeta, y decía que la documentación era una sola página cuando
  eran ocho.
- **La miniatura de los cuatro temas de ejemplo se veía igual en los cuatro.**
- **El contador de notas decía «1 notas».**
- Erratas y palabras pegadas por toda la web, la app y los comentarios.
  «CaracteresEspeciales» salía tal cual en el desplegable de tipografías.

### Instalar

Elige tu sistema en la [portada](https://xenner.app/#descargar) o descarga
directamente desde los archivos de abajo. No hay que registrarse ni dejar un
correo.

| Sistema | Archivo | Notas |
| --- | --- | --- |
| macOS | `.dmg` | Hay uno para Apple Silicon y otro para Intel. Como todavía no está firmado ni notarizado, Gatekeeper lo bloquea la primera vez: botón derecho sobre el archivo → **Abrir**. |
| Windows | `.exe` | Instalador NSIS para Windows 10 y 11 de 64 bits. SmartScreen puede pedir que confirmes que el editor es de confianza. |
| Linux | `.AppImage` · `.deb` · `.rpm` | El AppImage se ejecuta sin instalar nada, marcando el archivo como ejecutable. El `.deb` es para Debian y Ubuntu, el `.rpm` para Fedora. Necesitas glibc 2.35 o posterior, como en la 1.1.1. |

Tus notas no viajan con la app. Eliges la carpeta con el diálogo del sistema y
ahí se quedan, como archivos Markdown.

### Qué trae

- **Editor visual que guarda Markdown.** Escribes con formato y lo que queda en
  el disco es texto legible: encabezados, listas, tareas, tablas, código,
  enlaces, imágenes y fórmulas LaTeX.
- **La interfaz son archivos tuyos.** Una skin es una carpeta de TXT, con un
  archivo por componente, más tus imágenes, tus iconos y tu CSS. Se edita con el
  Bloc de notas y se recarga en vivo, sin compilar nada.
- **Un creador de temas dentro de la app**, con deslizadores, con el valor
  escrito a mano, con CSS, y con tus propias imágenes.
- **Una carpeta de configuración que se encuentra**, con la ruta escrita en
  Ajustes y un botón para abrirla.
- **39 tipografías** agrupadas por sensación, con una barra flotante que
  aparece al pasar el ratón por encima del texto.
- **Pizarra dentro de la nota.** Doble clic y dibujas: trazos a mano alzada,
  figuras y texto. Se guarda como un SVG junto al archivo, así que la nota
  sigue siendo un Markdown que cualquier visor entiende.
- **Explorador jerárquico** con carpetas, notas y assets. Arrastrar para mover,
  menú contextual, renombrado en línea e historial de cambios por nota.
- **Guardado atómico.** Si el archivo cambió por fuera, Xenner lo detecta y te
  deja decidir en vez de pisar lo tuyo.
- **Cuatro temas de ejemplo** (`glass-default`, `webcore`, `aurora` y `pixel`).

Sin cuentas, sin nube, sin telemetría y sin peticiones de red. Si la
configuración de una skin falla o está corrupta, la app cae a los valores
embebidos: nunca se queda en blanco.

### Problemas

Las Issues están abiertas en
[el repositorio](https://github.com/xenoxf/xenner/issues). Si algo no cuadra,
[abre una](https://github.com/xenoxf/xenner/issues/new) y dilo.

Código abierto, licencia MIT.
