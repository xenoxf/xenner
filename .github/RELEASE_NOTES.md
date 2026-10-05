## Xenner 1.4.0

Todo lo que hay aquí son arreglos y cosas que se piden. **El formato de tus notas no
cambia**: los archivos siguen siendo Markdown, se abren en cualquier editor y tus
notas antiguas se abren tal cual.

### Los fallos que más molestaban

- **El salto de línea al Intro era enorme.** Al dar Intro se metía casi el doble del
  alto del texto de espacio en blanco. Venía de que el hueco entre párrafos lo ponía
  el navegador por su cuenta, encima del interlineado que tú eliges en Apariencia:
  dos cosas que no se hablan y que ninguna de las dos se podía cambiar. Ahora el
  ritmo es tuyo y de nadie más.
- **La barrita de formato no salía nunca.** La que aparece encima del texto que
  seleccionas para poner negrita, elegir el estilo o poner un enlace: seleccionabas y
  no pasaba nada. Ya aparece, tanto si seleccionas con el ratón como con el teclado.
- **Cada opción de bloque decía que no se había podido aplicar.** Poner «Título 2» o
  «Viñetas» funcionaba, la nota cambiaba entera… y salía un aviso rojo de que no se
  había podido. El cambio estaba hecho; lo que fallaba era dejar el cursor donde
  tocaba.
- **Alinear una imagen no hacía nada.** Los tres botones de izquierda, centro y
  derecha salían, se pulsaban y la foto no se movía. Estaba mirando el eje que no
  era.
- **Al poner una imagen salía un campo para renombrarla.** Debajo de cada foto
  aparecía un campo de texto con el nombre del archivo, y eso no es una imagen, es un
  formulario. Ahora entra la imagen y ya. El pie sigue ahí, pero solo si eliges la
  foto.

### El explorador hace lo que se espera

Es lo que se hace en cualquier explorador de un clic, y aquí no lo hacía.

- **Puedes elegir una carpeta y se queda elegida.** Pinchas una carpeta, la pliega o
  la despliegas, y a partir de ahí «Nueva nota», «Nueva carpeta» y «Pegar» caen
  **dentro de ella** en vez de en la raíz. Si pinchas una nota, lo nuevo va junto a
  ella.
- **Soltar dentro de una carpeta ya no es puntería de francotirador.** No hace falta
  acertar a su borde: si sueltas el elemento en cualquier parte de la carpeta, cae
  dentro. Y si lo sueltas encima de un archivo que está dentro de una subcarpeta,
  cae en **esa** subcarpeta, no en la de arriba.
- **Las carpetas se pueden mover y renombrar con el teclado**, y `F2` o `Supr` actúan
  sobre lo que esté resaltado, que ahora puede ser una carpeta y no solo una nota.

### Los adjuntos se abren

Un archivo adjuntado era un enlace de texto y ya. Ahora es una **tarjeta**, como en
un chat: se ve el tipo y el peso, y **un clic lo abre** con el programa de siempre —un
PDF con el visor, una hoja de cálculo con su aplicación—.

Con el **botón derecho** salen las cuatro cosas que se pueden hacer con un archivo:

| | |
|---|---|
| Abrir | `Ctrl+O` |
| Mostrar en la carpeta | `Ctrl+Shift+O` |
| Copiar la ruta | `Ctrl+C` |
| Copiar el enlace Markdown | `Ctrl+Shift+C` |

En la nota sigue siendo un enlace de Markdown de toda la vida, así que se lee igual
en cualquier otro sitio. Y no hay «Abrir como…» porque la app no puede enseñarte el
diálogo del sistema para elegir programa: si un archivo no se abre con nada,
«Mostrar en la carpeta» lo deja a un clic de abrirlo como quieras.

### El menú de la lista tiene atajo en todo

El menú contextual de una nota o una carpeta enseñaba atajo en cinco de sus ocho
opciones, y dos de las que faltaban eran las de crear. Ahora **todas** lo tienen, a la
derecha de la opción, y los mismos atajos funcionan desde el árbol:

`Ctrl+N` nota nueva · `Ctrl+Shift+N` carpeta nueva · `Ctrl+H` últimos cambios ·
`Ctrl+C` copiar · `Ctrl+X` cortar · `Ctrl+V` pegar · `F2` renombrar · `Supr` eliminar.

### La configuración se ha rehecho

- **Buscador.** Escribe arriba y salen los ajustes que casan, con la sección de la que
  son. `Intro` lleva al primero. Sin escribir, la lista de secciones es la de siempre.
- **Sin cajas.** Las secciones se separan con una raya fina y aire. Antes cada grupo
  era una caja con borde y la página parecía un tablero.
- **Las explicaciones están detrás de un ⓘ.** Se abren al pasar el ratón por encima
  **y al pulsar**, que es lo que hace falta en una pantalla táctil. Lo que se sigue
  viendo siempre son los avisos y los estados.
- **El título va con el texto** y la «X» flota en la esquina, en vez de una cabecera
  fija que ocupaba una franja entera de la pantalla.

### Problemas

Las Issues están abiertas en
[el repositorio](https://github.com/xenoxf/xenner/issues). Si algo no cuadra,
[abre una](https://github.com/xenoxf/xenner/issues/new) y dilo.

Código abierto, licencia MIT.