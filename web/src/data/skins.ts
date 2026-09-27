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
 * Origen de verdad: `xenner/docs/SKIN_SPEC.md` y `xenner/src/skin/keys.ts`.
 */

export interface SkinKeyDoc {
  /** La clave, tal cual se escribe en el TXT. */
  key: string;
  /** Qué se ve en pantalla. Una frase, la decisión de la persona que skin-ea. */
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

/** Las ocho claves que valen en cualquier archivo de componente. */
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
    sees: 'Lo redondeadas que están las esquinas.',
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
        sees: 'El aviso que sale cuando se selecciona un texto o una imagen.',
        type: 'un color',
        example: '"#f7f7f5"',
      },
    ],
  },
  {
    file: 'button.txt',
    name: 'Los botones',
    sees: 'El botón «Nueva nota», los botones de la cabecera y los de cada fila.',
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
    sees: 'La barra flotante que aparece sobre el texto, con negrita, títulos y demás.',
    keys: [
      {
        key: 'textDim',
        sees: 'El texto gris de la barra: los botones que son un separador o un detalle.',
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

/** Los ganchos `data-x`, para la página de `custom.css`. */
export interface HookDoc {
  hook: string;
  name: string;
  sees: string;
}

export const HOOKS: readonly HookDoc[] = [
  { hook: 'app', name: 'La ventana', sees: 'El fondo de todo, detrás de los paneles.' },
  { hook: 'sidebar', name: 'La lista de notas', sees: 'La columna de la izquierda.' },
  { hook: 'sidebar-header', name: 'La cabecera', sees: 'El título «Notas» y los tres botones de la esquina.' },
  { hook: 'sidebar-window-actions', name: 'Los botones de ventana', sees: 'Abrir carpeta, recargar y ajustes.' },
  { hook: 'sidebar-toolbar', name: 'La fila de arriba', sees: '«Nueva nota» y el contador.' },
  { hook: 'sidebar-count', name: 'El contador', sees: 'El número con cuántas notas hay en total.' },
  { hook: 'tree', name: 'El área de la lista', sees: 'Donde se hace scroll, con las notas dentro.' },
  { hook: 'tree-item', name: 'Una nota o carpeta', sees: 'La línea entera. Con `data-kind="note"` o `="directory"` para distinguirlas.' },
  { hook: 'tree-row', name: 'La fila', sees: 'La parte pulsable. Con `data-selected="true"` si está abierta.' },
  { hook: 'tree-row-chevron', name: 'La flechita', sees: 'La que indica si una carpeta está abierta.' },
  { hook: 'tree-row-icon', name: 'El icono', sees: 'El de nota o el de carpeta.' },
  { hook: 'tree-row-label', name: 'El nombre', sees: 'El nombre de la nota o carpeta, en una fila.' },
  { hook: 'tree-row-actions', name: 'Los botones de la fila', sees: 'Los que aparecen al pasar el ratón por encima.' },
  { hook: 'note', name: 'El editor', sees: 'La superficie grande de la derecha.' },
  { hook: 'note-empty', name: 'Sin nota abierta', sees: 'El estado en el que se pide crear una nota.' },
  { hook: 'note-workspace', name: 'La zona de trabajo', sees: 'La que acepta soltar una imagen.' },
  { hook: 'note-scroll', name: 'El texto con scroll', sees: 'La parte que se desplaza.' },
  { hook: 'note-document', name: 'La columna de texto', sees: 'La columna de texto, la que tiene el ancho de lectura.' },
  { hook: 'note-heading', name: 'La fila de arriba de la nota', sees: 'La ruta y el estado de guardado.' },
  { hook: 'note-path', name: 'La ruta', sees: 'El nombre de la carpeta y del archivo, apagado.' },
  { hook: 'note-status', name: 'El estado', sees: '«Guardado», «Sin guardar»…' },
  { hook: 'note-title', name: 'El título', sees: 'El campo de arriba, que también es el nombre del archivo.' },
  { hook: 'editor', name: 'El texto', sees: 'El editor. Dentro hay etiquetas normales: `h1`, `blockquote`, `code`…' },
  { hook: 'editor-surface', name: 'El editor por fuera', sees: 'Para poner algo detrás con `::before`.' },
  { hook: 'toolbar', name: 'La barra del editor', sees: 'La flotante sobre el texto.' },
  { hook: 'toolbar-button', name: 'Un botón de la barra', sees: 'Con `data-x-open="true"` si su menú está abierto.' },
  { hook: 'button', name: 'Cualquier botón', sees: 'Con `data-x-role="primary"`, `"icon"` o `"default"`, y `data-x-size` en los de icono.' },
  { hook: 'modal', name: 'Una ventana emergente', sees: 'Con `data-x-modal="settings"` o `"history"`.' },
];

/** Extensiones que se pueden dejar en `assets/`. */
export const ASSET_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  Imágenes: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg'],
  Tipografías: ['.woff2', '.woff', '.ttf', '.otf'],
};
