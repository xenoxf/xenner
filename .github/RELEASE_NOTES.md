## Xenner 1.1.1

Arregla los binarios de Linux de la [1.1.0](https://github.com/xenoxf/xenner/releases/tag/v1.1.0),
que no arrancaban en la mayoría de distribuciones. **Usa esta versión si venías
de la 1.1.0 y estabas en Linux.**

El fallo era el empaquetado: la 1.1.0 se compiló en un runner de Ubuntu 24.04 y
el binario pedía `GLIBC_2.39`, una versión de la glibc que solo tiene esa
distribución. En Debian 12 y Ubuntu 22.04 el programa se instalaba bien y fallaba
al arrancar, con `version 'GLIBC_2.39' not found`.

Ahora Linux se compila en Ubuntu 22.04, de modo que el binario pide `GLIBC_2.35`
como mucho y arranca en **Debian 12 en adelante y Ubuntu 22.04 en adelante**.
macOS y Windows no cambian respecto a la 1.1.0.

### Qué hace de más esta versión

- **Linux se compila en el runner más antiguo que se soporta**, para que el
  binario no quede atado a la glibc más reciente que se puede instalar.
- **Los binarios se comprueban antes de darlos por buenos.** Una comprobación
  nueva baja lo publicado y verifica que el `.deb` lleve lanzador, entrada de
  menú y skins, y que ni el `.deb` ni el AppImage pidan una glibc más nueva que
  la soportada. El empaquetado puede salir verde y el binario ser inútil para
  casi todo el mundo; ahora eso se ve en la propia release.
- La web muestra la fecha de la versión en UTC y no según la zona horaria de
  quien la mira.

### Instalar

Elige tu sistema en la [portada](https://xenner.app/#descargar) o descarga
directamente desde los archivos de abajo. No hay que registrarse ni dejar un
correo.

| Sistema | Archivo | Notas |
| --- | --- | --- |
| macOS | `.dmg` | Hay uno para Apple Silicon y otro para Intel. Como todavía no está firmado ni notarizado, Gatekeeper lo bloquea la primera vez: botón derecho sobre el archivo → **Abrir**. |
| Windows | `.exe` | Instalador NSIS para Windows 10 y 11 de 64 bits. SmartScreen puede pedir que confirmes que el editor es de confianza. |
| Linux | `.AppImage` · `.deb` · `.rpm` | El AppImage se ejecuta sin instalar nada, marcando el archivo como ejecutable. El `.deb` es para Debian y Ubuntu, el `.rpm` para Fedora. Necesitas glibc 2.35 o posterior. |

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