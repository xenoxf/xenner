## Xenner 1.3.0

El editor está rehecho. Es la misma idea —escribes como en un procesador de
textos y Xenner guarda Markdown— pero ahora el motor es Tiptap, y con él se han
podido arreglar cosas que antes fallaban.

**Tus notas no cambian de formato.** Los archivos siguen siendo Markdown, se
abren en cualquier editor y se siguen viendo igual fuera de Xenner. Lo único
nuevo son dos detalles en las imágenes, abajo.

### Escribir sin saber Markdown

Es lo que se pedía: poder escribir una nota entera sin encontrase nunca con un
asterisco suelto.

- **Barra de formato encima del texto que selects.** Elige el estilo con su
  nombre —Texto, Título, Cita, Viñetas, Numerada, Tareas, Separador— y la
  píldora **te dice en cuál estás**, así que no hay que abrir nada para
  averiguarlo. Sale al pasar el ratón por encima de lo seleccionado y se queda
  quieta mientras la usas.
- **Las tablas se pueden tocar.** Antes se insertaba una tabla y no había forma
  de añadirle una fila: era un callejón sin salida. Ahora, con el cursor en una
  celda, sale una barrita encima para añadir o quitar filas y columnas, mover la
  tabla, poner cabecera y alinear el texto.
- **Atajos de bloque.** `Ctrl+Alt+0` a `Ctrl+Alt+6` para los títulos,
  `Ctrl+Shift+7` viñetas, `Ctrl+Shift+8` numerada, `Ctrl+Shift+9` tareas y
  `Ctrl+Shift+.` cita. En Mac, `⌘` en lugar de `Ctrl`.
- **Si pegas algo de otra parte, aterriza bien.** El Markdown que copies de
  cualquier sitio se convierte en bloques de verdad, y el texto que copies de
  Word, LibreOffice o Google Docs deja de traerse por delante sus estilos.

### Imágenes

Se pueden **redimensionar arrastrando** y **alinear** a izquierda, centro o
derecha, con botones que salen junto al pie de la foto.

Aquí hay un cambio en el fichero, y conviene saberlo: el tamaño y la alineación
se guardan en el *título* de la imagen, con un prefijo `@`.

```
![El pie](./.assets/captura.png "El pie @600 @center")
```

Markdown no tiene forma de decir el tamaño de una imagen, y esa es la única
casilla donde cabía sin inventar HTML. Si abres esa nota en otro visor, verás el
título tal cual y el resto se ve igual: **degrada sin perder nada**. Tus notas
antiguas no se tocan: las que no llevan nada de esto se abren tal cual.

### Lo que se ha arreglado

- **Cambiar el tipo de texto ya no come la nota.** Poner «Cita» y luego «Título 2»
  dejaba una cita con un título dentro y no había forma de quitarlo. Ahora
  sustituye.
- **La app ya no se ralentiza al escribir.** Antes se convertía la nota entera a
  Markdown en cada tecla; ahora espera a que pares.
- **Crear y guardar van a la par.** Escribir y cambiar de nota ya no
  pierde lo último que escribiste.
- **La primera vez que se abre una nota va más rápido.** El editor se descarga al
  abrir una nota, no al arrancar la app.

### Problemas

Las Issues están abiertas en
[el repositorio](https://github.com/xenoxf/xenner/issues). Si algo no cuadra,
[abre una](https://github.com/xenoxf/xenner/issues/new) y dilo.

Código abierto, licencia MIT.