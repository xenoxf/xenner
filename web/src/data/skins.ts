/**
 * Referencia del sistema de skins, en datos y no en el HTML de cada página.
 *
 * La razón es que esta tabla y el código tienen que decir lo mismo. Si el
 * `parse.ts` acepta `textDim` en `toolbar` y la web no lo lista, alguien
 * descubre la diferencia probando, y para eso no hace falta una web. Al
 * contrario, si la lista se equivoca, la web miente.
 *
 * Cada clave se explica por **dónde se ve en pantalla**, no por su nombre
 * técnico en CSS. Quien va a hacer una skin no sabe qué es un `token`; sí sabe
 * que el texto de la lista de notas sale apagado.
 *
 * Origen de verdad: `xenner/src/skin/keys.ts` para las claves y los `data-x` que
 * cada componente escribe, uno a uno. El `SKIN_SPEC.md` que citaba antes aquí ya
 * no está en el repositorio —se fue con la migración del editor— así que esta web
 * es la documentación: por eso `skins.test.ts` la compara con el código y se
 * rompe si divergen, en las dos direcciones.
 */

export interface SkinKeyDoc {
  /** La clave, tal cual se escribe en el TXT. */
  key: string;
  /** Qué se ve en pantalla. Una frase, la decisión de quien hace la skin. */
  sees: string;
  /** Qué se escribe dentro de las comillas. */
  type: string;
  /** Un valor listo para copiar. */
  example: string;
  /** Lo que no se entiende hasta que lo pruebas. Opcional. */
  note?: string;
}

export interface SkinComponentDoc {
  file: string;
  /** Cómo lo llama la persona, no el archivo. */
  name: string;
  /** Qué parte de la ventana es. */
  sees: string;
  /** Solo las claves propias de este componente. Las compartidas van arriba. */
  keys: readonly SkinKeyDoc[];
}

/** Las claves que valen en cualquier archivo de componente. */
export const SHARED_KEYS: readonly SkinKeyDoc[] = [
  {
    key: 'background',
    sees: 'El color de relleno de ese trozo de la ventana.',
    type: 'un color',
    example: '"#202020"',
    note: 'En `background.txt` es el color de la ventana entera; en el resto, el de ese trozo. Con rgba se ve lo que hay detrás: "rgba(32,32,32,0.8)".',
  },
  {
    key: 'text',
    sees: 'El color de la letra de ese trozo de la ventana.',
    type: 'un color',
    example: '"#e7e7e4"',
  },
  {
    key: 'border',
    sees: 'El borde: grosor, estilo y color, los tres en la misma línea.',
    type: 'grosor + estilo + color',
    example: '"1px solid #3c3c39"',
    note: 'Estilos: `solid`, `dashed`, `dotted`, `double`, `none`. Para quitar un borde sin borrarlo: "1px solid transparent".',
  },
  {
    key: 'radius',
    sees: 'Lo redondeado que tienen las esquinas.',
    type: 'una longitud',
    example: '"10px"',
    note: 'A 0 son esquinas vivas. A la mitad de la altura del elemento es una cápsula.',
  },
  {
    key: 'blur',
    sees: 'Lo borroso que se ve el fondo a través de la superficie.',
    type: 'una longitud',
    example: '"16px"',
    note: 'Solo tiene efecto si el color de `background` es semitransparente (con `rgba`). Con un color opaco, no se ve nada.',
  },
  {
    key: 'shadow',
    sees: 'La sombra que se dibuja detrás.',
    type: 'la forma de una sombra de CSS',
    example: '"0 8px 28px rgba(0,0,0,0.28)"',
    note: 'Se leen tres cosas: cuánto se desplaza, cuánta se difumina y de qué color es. Con `inset` la sombra va por dentro. Varias separadas por comas encadenan sombras.',
  },
  {
    key: 'accent',
    sees: 'El color que marca lo elegido: la nota abierta, el borde del campo enfocado.',
    type: 'un color',
    example: '"#5b9bd5"',
    note: 'Es el color que más se nota de una skin, junto al texto. Conviene que contraste bien con `text`.',
  },
  {
    key: 'font',
    sees: 'La tipografía con la que se escribe ese trozo.',
    type: 'una pila de tipografías, de la más preferida a la de reserva',
    example: '"Georgia, \\"Noto Serif\\", serif"',
    note: 'Se escribe de la que más te gusta a la que peor te parece: la primera que encuentre el ordenador gana y la última es el plan B. Sin comillas: serif, sans-serif, monospace.',
  },
  {
    key: 'selection',
    sees: 'La marca que deja el texto seleccionado con el ratón.',
    type: 'un color',
    example: '"#3d5a80"',
    note: 'Si no escribes nada, Xenner la deduce: un tinte del `accent` de ese mismo trozo. Sale bien sola en cualquier tema, oscuro o claro, y por eso no hace falta tocarla.',
  },
  {
    key: 'selectionText',
    sees: 'La letra de lo que está seleccionado: la que se lee sobre `selection`.',
    type: 'un color',
    example: '"#ffffff"',
    note: 'También se deduce sola, y sale igual que el texto del trozo. Ponla solo si cambias `selection` a un color fuerte: con un color claro de fondo y la letra clara, lo seleccionado no se lee.',
  },
];

export const SKIN_COMPONENT_DOCS: readonly SkinComponentDoc[] = [
  {
    file: 'background.txt',
    name: 'El fondo',
    sees: 'Todo lo que rodea a la ventana: el escritorio detrás, los bordes del panel.',
    keys: [
      {
        key: 'overlay',
        sees: 'Un dibujo o degradado por encima del color de fondo.',
        type: 'un gradiente, o una imagen, o ninguno de los dos',
        example: '"radial-gradient(circle at 10% 10%, rgba(255,255,255,0.16), transparent 40%)"',
        note: 'Se pueden encadenar varios separándolos por comas, y el primero es el de encima. Es la ranura más útil de la v1: aquí caben degradados que se calculan solos y no ocupan espacio en el disco.',
      },
      {
        key: 'textDim',
        sees: 'El texto gris de las esquinas: la ruta de la nota, el estado de guardado.',
        type: 'un color',
        example: '"#9b9b98"',
      },
    ],
  },
  {
    file: 'sidebar.txt',
    name: 'La lista de notas',
    sees: 'La columna de la izquierda, con la biblioteca de notas.',
    keys: [
      {
        key: 'itemHover',
        sees: 'La fila por la que pasa el ratón.',
        type: 'un color',
        example: '"#292928"',
      },
      {
        key: 'itemActive',
        sees: 'La fila de la nota que está abierta.',
        type: 'un color',
        example: '"#343431"',
        note: 'Se nota más si además se usa `accent`, que la aplicación le pone a la fila elegida.',
      },
      {
        key: 'textDim',
        sees: 'El texto apagado: los iconos y la ruta.',
        type: 'un color',
        example: '"#9b9b98"',
      },
    ],
  },
  {
    file: 'note.txt',
    name: 'La nota',
    sees: 'La hoja donde se escribe, a la derecha.',
    keys: [
      {
        key: 'backgroundHover',
        sees: 'El fondo de los cuadros que salen encima de la nota: el aviso de «texto copiado», el historial y el del diálogo de ajustes.',
        type: 'un color',
        example: '"#f7f7f5"',
        note: 'Aquí no hay ningún botón al que pasar el ratón: son las cajas que aparecen y desaparecen. El color de la letra sale de `text` y el borde, de `accent`.',
      },
    ],
  },
  {
    file: 'button.txt',
    name: 'Los botones',
    sees: 'El botón «Nueva nota», los de las cabeceras y los de los menús.',
    keys: [
      {
        key: 'backgroundHover',
        sees: 'El fondo del botón al pasar el ratón.',
        type: 'un color',
        example: '"#2b2b2a"',
      },
      {
        key: 'textHover',
        sees: 'El color de la letra al pasar el ratón.',
        type: 'un color',
        example: '"#ffffff"',
      },
      {
        key: 'borderHover',
        sees: 'El borde del botón al pasar el ratón.',
        type: 'grosor + estilo + color',
        example: '"1px solid #5b9bd5"',
        note: 'Es lo que hace que un botón «se encienda» al acercarlo, sin necesidad de mover nada.',
      },
    ],
  },
  {
    file: 'input.txt',
    name: 'Los campos de escritura',
    sees: 'El campo del título de la nota y el de crear una nota o carpeta.',
    keys: [
      {
        key: 'placeholder',
        sees: 'El texto gris de dentro cuando el campo está vacío.',
        type: 'un color',
        example: '"#858580"',
      },
      {
        key: 'focus',
        sees: 'La línea que se enciende por debajo al escribir.',
        type: 'un color',
        example: '"#5b9bd5"',
      },
    ],
  },
  {
    file: 'toolbar.txt',
    name: 'La barra del editor',
    sees: 'Todo lo que flota por encima: la barra de abajo de la nota, la de formato, los menús, la paleta de comandos y los diálogos.',
    keys: [
      {
        key: 'textDim',
        sees: 'Lo apagado de la barra, y también los rótulos que no son botones: «Preparando editor…» y el estado del archivo.',
        type: 'un color',
        example: '"#9b9b98"',
      },
      {
        key: 'backgroundHover',
        sees: 'El fondo de un botón de la barra al pasar el ratón.',
        type: 'un color',
        example: '"#2b2b2a"',
      },
    ],
  },
];

/**
 * Los ganchos `data-x`, para la página de `custom.css`.
 *
 * Cada trozo de la ventana lleva el suyo, y es la lista pública: no cambia sin
 * avisar. Lo que se documenta aquí es exactamente lo que la aplicación escribe en
 * el DOM —`skins.test.ts` recorre los componentes y compara en las dos
 * direcciones—, porque una lista que se queda corta hace que alguien descubra un
 * gancho probando, y una que se queda larga hace que una skin apunte al vacío.
 */
export interface HookDoc {
  /** El `data-x`, tal cual se escribe en el selector y sin las comillas. */
  hook: string;
  /** Cómo lo llama quien hace la skin, no el código. */
  name: string;
  /** Qué se ve en pantalla. Una frase. */
  sees: string;
  /** La zona de la ventana, para no perder a nadie en una tabla de cincuenta filas. */
  zone: 'ventana' | 'lista' | 'nota' | 'movil';
}

export const HOOKS: readonly HookDoc[] = [
  // ---- La ventana ----
  { hook: 'app', name: 'La ventana', sees: 'El fondo de todo, detrás de los paneles.', zone: 'ventana' },
  { hook: 'app-rail', name: 'La casilla de la barra', sees: 'La franja más estrecha del todo, a la izquierda.', zone: 'ventana' },
  { hook: 'app-notes', name: 'La casilla de la lista', sees: 'Donde vive la lista de notas.', zone: 'ventana' },
  { hook: 'app-editor', name: 'La casilla del editor', sees: 'Donde vive la nota abierta.', zone: 'ventana' },
  { hook: 'activity-bar', name: 'La barra de secciones', sees: 'La columna más estrecha, a la izquierda del todo.', zone: 'ventana' },
  { hook: 'activity-bar-top', name: 'Las secciones de arriba', sees: 'Donde está el icono de la lista de notas.', zone: 'ventana' },
  { hook: 'activity-bar-bottom', name: 'La sección de abajo', sees: 'Donde está el engranaje de configuración.', zone: 'ventana' },
  { hook: 'activity-tip', name: 'El rótulo de un icono', sees: 'El nombre que sale al pasar el ratón por encima.', zone: 'ventana' },
  { hook: 'modal', name: 'Una ventana emergente', sees: 'Ajustes, historial o paleta de comandos, encima de todo lo demás.', zone: 'ventana' },

  // ---- La lista de notas ----
  { hook: 'sidebar', name: 'La lista de notas', sees: 'La columna de la izquierda, al lado de la barra.', zone: 'lista' },
  { hook: 'sidebar-header', name: 'La cabecera', sees: 'El rótulo «Notas» y los botones de su esquina.', zone: 'lista' },
  { hook: 'sidebar-window-actions', name: 'Los botones de ventana', sees: 'Abrir carpeta y recargar. Los ajustes están en la barra de secciones.', zone: 'lista' },
  { hook: 'sidebar-toolbar', name: 'La fila de arriba', sees: '«Nueva nota» y el contador.', zone: 'lista' },
  { hook: 'sidebar-count', name: 'El contador', sees: 'El número con cuántas notas hay en total.', zone: 'lista' },
  { hook: 'sidebar-resizer', name: 'El tirador', sees: 'La franja del borde derecho que cambia el ancho del panel.', zone: 'lista' },
  { hook: 'tree', name: 'El área de la lista', sees: 'Donde se hace scroll, con las notas dentro.', zone: 'lista' },
  { hook: 'tree-item', name: 'Una nota o carpeta', sees: 'La línea entera, con su margen y su sangría.', zone: 'lista' },
  { hook: 'tree-row', name: 'La fila', sees: 'La parte pulsable, la que se pinta al pasar el ratón y al estar abierta.', zone: 'lista' },
  { hook: 'tree-row-chevron', name: 'La flechita', sees: 'La que indica si una carpeta está abierta.', zone: 'lista' },
  { hook: 'tree-row-icon', name: 'El icono', sees: 'El de nota o el de carpeta.', zone: 'lista' },
  { hook: 'tree-row-label', name: 'El nombre', sees: 'El nombre de la nota o carpeta, en una fila.', zone: 'lista' },
  { hook: 'button', name: 'Cualquier botón', sees: 'Los de la lista, los de la nota y los de los menús. Los que tienen un papel llevan `data-x-role`.', zone: 'lista' },

  // ---- La nota ----
  { hook: 'note', name: 'La nota', sees: 'La superficie grande de la derecha, la que se colorea con `note.txt`.', zone: 'nota' },
  { hook: 'note-empty', name: 'Sin nota abierta', sees: 'El estado en el que se pide crear una nota.', zone: 'nota' },
  { hook: 'note-empty-icon', name: 'El dibujo de espera', sees: 'El icono grande de la pantalla en blanco, antes de que haya nota.', zone: 'nota' },
  { hook: 'note-workspace', name: 'La zona de trabajo', sees: 'La que acepta soltar una imagen o un archivo.', zone: 'nota' },
  { hook: 'note-scroll', name: 'El texto con scroll', sees: 'La parte que se desplaza.', zone: 'nota' },
  { hook: 'note-document', name: 'La columna de texto', sees: 'La que tiene el ancho de lectura y el margen a los lados.', zone: 'nota' },
  { hook: 'note-heading', name: 'La fila de arriba de la nota', sees: 'La ruta, el estado de guardado y el título.', zone: 'nota' },
  { hook: 'note-path', name: 'La ruta', sees: 'El nombre de la carpeta y del archivo, apagado.', zone: 'nota' },
  { hook: 'note-status', name: 'El estado', sees: '«Guardado», «Sin guardar»…', zone: 'nota' },
  { hook: 'note-title', name: 'El título', sees: 'El campo de arriba, que también es el nombre del archivo.', zone: 'nota' },
  { hook: 'editor', name: 'El texto', sees: 'La envoltura del editor. Dentro hay etiquetas normales: `h1`, `blockquote`, `code`…', zone: 'nota' },
  { hook: 'editor-root', name: 'El texto que se escribe', sees: 'La parte editable en sí, la que recibe lo que escribes.', zone: 'nota' },
  { hook: 'editor-surface', name: 'El editor por fuera', sees: 'Para poner algo detrás con `::before`.', zone: 'nota' },
  { hook: 'toolbar', name: 'La barra de insertar', sees: 'La franja de abajo, con los tres botones que insertan: imagen, pizarra y adjunto.', zone: 'nota' },
  { hook: 'style-bar', name: 'La barra de formato', sees: 'La de encima del texto, con el tipo de bloque, los estilos y los colores.', zone: 'nota' },
  { hook: 'style-menu', name: 'El menú de estilos', sees: 'La lista que se abre desde el botón de estilos de la barra de formato.', zone: 'nota' },
  { hook: 'block-handle', name: 'El asa del bloque', sees: 'El tirador que aparece al lado del párrafo en el que está el cursor.', zone: 'nota' },
  { hook: 'insert-menu', name: 'El menú del asa', sees: 'La lista que se abre al pulsar el `+` del asa: texto, listas e inserts.', zone: 'nota' },
  { hook: 'slash-menu', name: 'El menú de la barra oblicua', sees: 'La lista que se abre al escribir una `/`: bloques y estilos.', zone: 'nota' },
  { hook: 'table-controls', name: 'Los botones de la tabla', sees: 'La barrita que sale encima de la celda en la que estás.', zone: 'nota' },
  { hook: 'input', name: 'Un campo de escritura', sees: 'Los campos con borde propio, como el buscador del móvil.', zone: 'nota' },

  // ---- El móvil ----
  { hook: 'mobile', name: 'La pantalla del móvil', sees: 'La pantalla completa cuando Xenner corre en un teléfono.', zone: 'movil' },
  { hook: 'mobile-topbar', name: 'La barra de arriba', sees: 'El título de la lista y sus botones.', zone: 'movil' },
  { hook: 'mobile-search', name: 'El buscador', sees: 'La caja de buscar notas.', zone: 'movil' },
  { hook: 'mobile-note-list', name: 'La lista', sees: 'Las notas, en la pantalla de la lista.', zone: 'movil' },
  { hook: 'mobile-note-row', name: 'Una nota en la lista', sees: 'Una fila pulsable de la pantalla del móvil.', zone: 'movil' },
  { hook: 'mobile-note-row-icon', name: 'El icono de la fila', sees: 'El de nota o el de carpeta, en el móvil.', zone: 'movil' },
  { hook: 'mobile-note-empty', name: 'La lista vacía', sees: 'Lo que sale cuando no hay ninguna nota que enseñar.', zone: 'movil' },
  { hook: 'mobile-folder-strip', name: 'La tira de carpetas', sees: 'Las carpetas, en fila, para filtrar la lista.', zone: 'movil' },
  { hook: 'mobile-folder-chip', name: 'Una carpeta de la tira', sees: 'Una de las carpetas de la tira horizontal.', zone: 'movil' },
  { hook: 'mobile-editor', name: 'La pantalla de la nota', sees: 'La pantalla donde se escribe, en el móvil.', zone: 'movil' },
  { hook: 'mobile-editor-bar', name: 'La barra de la nota', sees: 'La de arriba de la pantalla de escritura, con la flecha de volver.', zone: 'movil' },
  { hook: 'mobile-fab', name: 'El botón de nueva nota', sees: 'El círculo flotante de abajo a la derecha.', zone: 'movil' },
];

/**
 * Los atributos de estado, para atacar «solo cuando…».
 *
 * Un gancho dice **dónde**; un estado dice **en qué momento**. Los dos van en el
 * mismo selector, y esta lista está para que la combinación se escriba sin
 * adivinar: `[data-x="tree-row"][data-selected]` es la fila abierta, y sin la
 * segunda mitad se estaría pintando también la fila por la que pasa el ratón.
 */
export interface HookStateDoc {
  /** El atributo, tal cual se escribe en el selector. */
  state: string;
  /** En qué ganchos se pone. */
  where: string;
  /** Qué significa cada valor. */
  values: string;
}

export const HOOK_STATES: readonly HookStateDoc[] = [
  {
    state: 'data-selected',
    where: '`tree-item`, `tree-row`, `mobile-note-row` y `mobile-folder-chip`',
    values: 'Sin valor o con `="true"`: la nota que está abierta, o la carpeta elegida en la tira.',
  },
  {
    state: 'data-kind',
    where: '`tree-item`',
    values: '`="note"` o `="directory"`. Sirve para pintar las carpetas de otra manera.',
  },
  {
    state: 'data-x-role',
    where: '`button`, en toda la aplicación',
    values: '`="primary"` el botón grande de «Nueva nota», `="icon"` el que solo lleva un dibujo, `="rail"` los de la barra de secciones, `="default"` el resto.',
  },
  {
    state: 'data-x-size',
    where: '`button`, pero solo en los de `data-x-role="icon"`',
    values: '`="default"`, `="compact"` o `="small"`, de menos a más pequeños.',
  },
  {
    state: 'data-x-active',
    where: 'Los botones de `activity-bar`',
    values: '`="true"` en la sección que está abierta, `="false"` en las demás.',
  },
  {
    state: 'data-x-modal',
    where: '`modal`, la ventana emergente',
    values: '`="settings"` en Ajustes, `="history"` en Últimos cambios, `="command-palette"` en la paleta de comandos.',
  },
  {
    state: 'data-show',
    where: '`block-handle` y `table-controls`',
    values: '`="true"` cuando están a la vista, `="false"` cuando se esconden. El elemento sigue montado, así que se puede animar.',
  },
  {
    state: 'data-visible',
    where: '`style-bar`, la barra de formato',
    values: '`="true"` cuando la barra se está enseñando.',
  },
  {
    state: 'data-x-mobile',
    where: 'La pantalla de móvil y sus trozos',
    values: '`="shell"` la pantalla entera, `="list"` la de la lista, `="topbar"` y `="topbar-actions"` su barra, `="search"` el buscador, `="note-list"` y `="note-row"` la lista y una fila, `="folder-strip"` y `="folder-chip"` la tira de carpetas, `="editor"` la pantalla de escritura, `="editor-bar"` y `="editor-bar-title"` su barra, y `="fab"` el botón de nueva nota.',
  },
];

/** Extensiones que se pueden dejar en `assets/`. */
export const ASSET_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  Imágenes: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg'],
  Tipografías: ['.woff2', '.woff', '.ttf', '.otf'],
};
