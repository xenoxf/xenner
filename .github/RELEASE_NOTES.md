## Xenner 1.1.0

La primera versión con instaladores para macOS, Windows y Linux. Los tres se
compilan y publican con cada release, así que ya no hace falta clonar nada
para usar Xenner.

### Instalar

Elige tu sistema en la [portada](https://xenner.app/#descargar) o descarga
directamente desde los archivos de abajo. No hay que registrarse ni dejar un
correo.

| Sistema | Archivo | Notas |
| --- | --- | --- |
| macOS | `.dmg` | Hay uno para Apple Silicon y otro para Intel. Como todavía no está firmado ni notarizado, Gatekeeper lo bloquea la primera vez: botón derecho sobre el archivo → **Abrir**. |
| Windows | `.exe` | Instalador NSIS para Windows 10 y 11 de 64 bits. SmartScreen puede pedir que confirmes que el editor es de confianza. |
| Linux | `.AppImage` · `.deb` · `.rpm` | El AppImage se ejecuta sin instalar nada, marcando el archivo como ejecutable. El `.deb` es para Debian y Ubuntu, el `.rpm` para Fedora. |

Tus notas no viajan con la app. Eliges la carpeta con el diálogo del sistema y
ahí se quedan, como archivos Markdown.

### Qué trae

- **Editor visual que guarda Markdown.** Escribes con formato y lo que queda en
  el disco es texto legible: encabezados, listas, tareas, tablas, código,
  enlaces, imágenes y fórmulas LaTeX.
- **La interfaz son archivos tuyos.** Una skin es una carpeta de TXT, con un
  archivo por componente, más tus imágenes, tus iconos y tu CSS. Se edita con el
  Bloc de notas y se recarga en vivo, sin compilar nada.
- **Tipografías para elegir**, agrupadas por sensación, con una barra flotante
  que aparece al pasar el ratón por encima del texto.
- **Pizarra dentro de la nota.** Doble clic y dibujas: trazos a mano alzada,
  figuras y texto. Se guarda como un SVG junto al archivo, así que la nota
  sigue siendo un Markdown que cualquier visor entiende.
- **Explorador jerárquico** con carpetas, notas y assets. Arrastrar para mover,
  menú contextual, renombrado en línea e historial de cambios por nota.
- **Guardado atómico.** Si el archivo cambió por fuera, Xenner lo detecta y te
  deja decidir en vez de pisar lo tuyo.
- **Cuatro skins de ejemplo** (`glass-default`, `webcore`, `aurora` y `pixel`) y
  un creador de skins dentro de la app.

Sin cuentas, sin nube, sin telemetría y sin peticiones de red. Si la
configuración de una skin falla o está corrupta, la app cae a la skin embebida:
nunca se queda en blanco.

### Problemas

Las Issues están abiertas en
[el repositorio](https://github.com/xenoxf/xenner/issues). Si algo no cuadra,
[abre una](https://github.com/xenoxf/xenner/issues/new) y dilo.

Código abierto, licencia MIT.
