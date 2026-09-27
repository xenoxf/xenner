/**
 * El índice de la documentación.
 *
 * Ocho páginas, una por capítulo. Es la fuente de verdad de las barras de
 * navegación (la de la izquierda, la de la derecha y el cajón del móvil), del
 * «anterior» y el «siguiente», y de las tarjetas del final. No se escribe a
 * mano en tres sitios: `doc.test.ts` compara esto contra los encabezados que
 * salen realmente en cada página, en las dos direcciones, así que un `<h3>`
 * nuevo sin su entrada aquí rompe la compilación, y una entrada sin página
 * rompe también.
 *
 * **Por qué ocho páginas y no una.** La versión anterior era una sola URL de
 * 36.000 píxeles. Es impracticable: el navegador tiene que construirla entera,
 * no se puede compartir un apartado suelto, todas las búsquedas aterrizan en la
 * misma dirección y no hay forma de saber qué se ha leído. Con una página por
 * capítulo cada URL responde a una intención de búsqueda, se puede enlazar y se
 * puede imprimir.
 *
 * **Ordenado a mano, no alfabético**, y con una razón: el ejemplo completo va
 * después de todo lo que necesita. Quien llega por él y salta a CSS tiene que
 * poder asumir que hay cuatro cosas antes. `doc.test.ts` lo comprueba.
 *
 * `subs` son los `<h3>` **de dentro de cada `<h2>`**, no los de la página entera:
 * la barra de la derecha dibuja la jerarquía, y una lista plana de cincuenta
 * entradas en una columna de 14rem es ilegible.
 */

export interface DocSub {
  /** El `id` del encabezado, sin la almohadilla. */
  id: string;
  /** El texto del encabezado. */
  label: string;
}

export interface DocSection extends DocSub {
  /** Los `<h3>` de dentro, en orden. */
  subs?: readonly DocSub[];
}

export interface DocPage {
  /** Ruta con barra final: `/doc/claves/`. */
  path: string;
  /** Lo que pone en la barra de la izquierda. Corto, porque la columna es estrecha. */
  label: string;
  /**
   * El `<title>` del documento. 50-60 caracteres, dentro del rango en el que
   * Google no recorta. **No es el titular**: el titular va en `heading`, igual
   * que en `GuideLayout`.
   */
  title: string;
  /** El `<h1>`, el texto grande de la página. */
  heading: string;
  /** El `meta description`: 140-160 caracteres, o Google lo recorta. */
  description: string;
  /** La frase de debajo del `<h1>`. También es el texto de su tarjeta. */
  lead: string;
  /** Los `<h2>` de la página, en orden, con sus apartados. */
  sections: readonly DocSection[];
}

export const DOC_PAGES: readonly DocPage[] = [
  {
    path: '/doc/',
    label: 'Empezar aquí',
    title: 'Documentación de skins de Xenner: la guía completa',
    heading: 'Haz que Xenner se vea como quieras',
    description:
      'Documentación de las skins de Xenner: qué es una skin, cómo se hace la primera en cinco minutos y de qué archivos está hecha, con todos los enlaces.',
    lead: 'Una skin es una carpeta con unos archivos tuyos dentro: colores, imágenes, iconos, tipografías y un archivo de CSS. No hay que compilar nada, no hay que instalar nada y no hace falta saber programar. Cambias un color, guardas, y la ventana cambia mientras la estás mirando.',
    sections: [
      { id: 'que-es', label: 'Qué es una skin' },
      {
        id: 'cinco-minutos',
        label: 'La primera, en cinco minutos',
        subs: [
          { id: 'abre-la-carpeta-de-skins', label: 'Abre la carpeta de skins' },
          { id: 'duplica-una', label: 'Duplica una' },
          { id: 'cambia-un-color', label: 'Cambia un color' },
          { id: 'eligela', label: 'Elígela' },
        ],
      },
      { id: 'archivos', label: 'De qué archivos está hecha' },
    ],
  },
  {
    path: '/doc/formato/',
    label: 'El formato',
    title: 'Formato y colores de una skin de Xenner, explicados',
    heading: 'El formato y los colores',
    description:
      'Cómo se escribe una skin de Xenner: una línea por ajuste, comentarios, comillas, colores en hexadecimal o en rgba y qué se ignora sin avisar.',
    lead: 'Un archivo de skin son líneas de la forma clave="valor". Con eso, y sin nada más, ya se puede cambiar el aspecto de Xenner entero.',
    sections: [
      { id: 'formato', label: 'El formato, que son tres reglas' },
      { id: 'colores', label: 'Los colores' },
    ],
  },
  {
    path: '/doc/claves/',
    label: 'Las claves',
    title: 'Claves de las skins de Xenner: la lista completa',
    heading: 'Todas las claves',
    description:
      'Todas las claves que acepta una skin de Xenner con un ejemplo cada una: colores, bordes, sombras, imágenes, tipografías y los ajustes de cada archivo.',
    lead: 'Hay una lista cerrada de claves, y es cerrada a propósito: son painless. Si escribes una que no existe, Xenner la pasa por alto y sigue funcionando.',
    sections: [
      {
        id: 'claves',
        label: 'La lista y cada archivo',
        subs: [
          { id: 'como-se-escribe', label: 'Cómo se escribe' },
          { id: 'las-ocho-que-valen-en-todas-partes', label: 'Las ocho que valen en todas partes' },
          { id: 'las-claves-de-cada-archivo', label: 'Las claves de cada archivo' },
          { id: 'componente-background', label: 'background.txt — El fondo' },
          { id: 'componente-sidebar', label: 'sidebar.txt — La lista de notas' },
          { id: 'componente-note', label: 'note.txt — La nota' },
          { id: 'componente-button', label: 'button.txt — Los botones' },
          { id: 'componente-input', label: 'input.txt — Los campos de escritura' },
          { id: 'componente-toolbar', label: 'toolbar.txt — La barra del editor' },
          { id: 'el-manifiesto', label: 'El manifiesto' },
        ],
      },
    ],
  },
  {
    path: '/doc/imagenes/',
    label: 'Imágenes y letras',
    title: 'Imágenes, iconos SVG y tipografías en una skin de Xenner',
    heading: 'Imágenes, iconos y tipografías',
    description:
      'Cómo poner tus imágenes, tus iconos SVG y tu tipografía dentro de una skin de Xenner: la carpeta assets, las rutas que valen y el uso de custom.css.',
    lead: 'Los colores se acaban pronto. A partir de aquí hace falta una carpeta con tus fotos, tus iconos y tu letra, y algo de CSS para colocarlos donde toca.',
    sections: [
      {
        id: 'imagenes',
        label: 'La carpeta assets',
        subs: [
          { id: 'nombrar-un-archivo', label: 'Nombrar un archivo' },
          { id: 'un-fondo-de-foto', label: 'Un fondo de foto' },
          { id: 'iconos-propios-y-por-que-un-svg-solo', label: 'Iconos propios, y por qué un SVG solo' },
          { id: 'un-marco-alrededor-de-las-notas', label: 'Un marco alrededor de las notas' },
          { id: 'tipografias', label: 'Tipografías' },
        ],
      },
    ],
  },
  {
    path: '/doc/css/',
    label: 'Todo con CSS',
    title: 'Personalizar Xenner entero con custom.css, sin más',
    heading: 'Cambiarlo todo con CSS',
    description:
      'Todo lo que se puede cambiar en Xenner con custom.css: los data-x de cada zona de la ventana, el modo claro y el oscuro, iconos y animaciones.',
    lead: 'Lo que no cabe en una línea de clave=valor se hace aquí, con CSS normal dentro de la carpeta de la skin. Es el capítulo más largo, y el único que presupone algo de programación.',
    sections: [
      {
        id: 'css',
        label: 'Las reglas de custom.css',
        subs: [
          { id: 'empezar', label: 'Empezar' },
          { id: 'a-que-se-puede-agarrar-data-x', label: 'A qué se puede agarrar: data-x' },
          { id: 'y-dentro-del-texto-de-la-nota', label: 'Y dentro del texto de la nota' },
          { id: 'un-color-para-de-dia-y-otro-para-de-noche', label: 'Un color para de día y otro para de noche' },
          { id: 'anadir-cosas-que-no-estaban', label: 'Añadir cosas que no estaban' },
          { id: 'cosas-que-tambien-funcionan', label: 'Cosas que también funcionan' },
        ],
      },
    ],
  },
  {
    path: '/doc/ejemplo/',
    label: 'Una skin entera',
    title: 'Una skin de Xenner desde cero, con su CSS y su noche',
    heading: 'Una skin desde cero',
    description:
      'Ejemplo completo de una skin de Xenner, paso a paso: los colores elegidos, los seis archivos de texto, su custom.css y la variante de noche.',
    lead: 'Seis archivos de texto, un custom.css y dos modos de luz. Todo lo que cuentan los capítulos anteriores, junto y aplicado a un caso de principio a fin.',
    sections: [
      {
        id: 'ejemplo',
        label: 'Los seis archivos, uno a uno',
        subs: [
          { id: 'la-carpeta-y-el-manifiesto', label: '1. La carpeta y el manifiesto' },
          { id: 'elegir-los-colores-antes-de-escribir-nada', label: '2. Elegir los colores antes de escribir nada' },
          { id: 'los-seis-archivos', label: '3. Los seis archivos' },
          { id: 'activarla-y-mirarla', label: '4. Activarla y mirarla' },
          { id: 'la-variante-de-noche', label: '5. La variante de noche' },
          { id: 'un-detalle-la-tipografia-de-la-nota', label: '6. Un detalle: la tipografía de la nota' },
        ],
      },
    ],
  },
  {
    path: '/doc/problemas/',
    label: 'Si no funciona',
    title: 'Si tu skin de Xenner no funciona: causas y arreglo',
    heading: 'Si no funciona',
    description:
      'Por qué una skin de Xenner no cambia el aspecto, no aparece en la lista o no enseña las imágenes: cada causa con su arreglo, sin excepciones.',
    lead: 'La buena noticia es que hay muy pocas formas de romperlo, y están en el orden en el que se encuentran: lo primero lo más probable.',
    sections: [
      {
        id: 'problemas',
        label: 'Los fallos más habituales',
        subs: [
          { id: 'la-skin-no-aparece-en-la-lista', label: 'La skin no aparece en la lista' },
          { id: 'cambie-un-color-y-no-pasa-nada', label: 'Cambié un color y no pasa nada' },
          { id: 'una-imagen-no-se-ve', label: 'Una imagen no se ve' },
          { id: 'el-texto-no-se-lee', label: 'El texto no se lee' },
          { id: 'se-aplica-a-medias', label: 'Se aplica a medias' },
          { id: 'la-ventana-se-ve-rara-o-se-descuadra', label: 'La ventana se ve rara o se descuadra' },
          { id: 'el-texto-de-la-nota-no-cambia-de-aspecto', label: 'El texto de la nota no cambia de aspecto' },
          { id: 'y-si-nada-de-esto-es', label: 'Y si nada de esto es' },
        ],
      },
    ],
  },
  {
    path: '/doc/limites/',
    label: 'Los límites',
    title: 'Lo que una skin de Xenner no puede hacer, y por qué',
    heading: 'Lo que no se puede',
    description:
      'Los límites de las skins de Xenner: ni JavaScript, ni descargas, ni lectura de tus archivos. Por qué existe cada uno y cómo compartir la tuya.',
    lead: 'Una skin cambia el aspecto, no la estructura ni el comportamiento. Esto es lo que hay detrás de esa frase, y hay una razón para cada cosa.',
    sections: [
      {
        id: 'limites',
        label: 'Lo que está fuera de alcance',
        subs: [
          { id: 'para-compartirla', label: 'Para compartirla' },
          { id: 'skins-de-ejemplo-para-copiar', label: 'Skins de ejemplo para copiar' },
        ],
      },
    ],
  },
];

/**
 * La página de una ruta, o un fallo ruidoso.
 *
 * Las páginas piden su propia ficha por aquí en vez de repetir título,
 * descripción y lista de apartados en su archivo. Si alguien se equivoca al
 * escribir la ruta, revienta la compilación en vez de sacar una página sin
 * título y sin apartados en la barra.
 */
export function pagina(path: string): DocPage {
  const hallada = DOC_PAGES.find((p) => p.path === path);
  if (!hallada) {
    throw new Error(
      `La ruta ${path} no está en DOC_PAGES (src/data/doc.ts). Añádela antes de usarla.`,
    );
  }
  return hallada;
}

/** Posición de una página en el recorrido, para el «anterior» y el «siguiente». */
export function vecinos(
  path: string,
): { anterior: DocPage | null; siguiente: DocPage | null } {
  const i = DOC_PAGES.findIndex((p) => p.path === path);
  return {
    anterior: i > 0 ? DOC_PAGES[i - 1] : null,
    siguiente: i >= 0 && i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : null,
  };
}

/** Cuántos apartados hay en toda la documentación, para los rótulos. */
export function totalApartados(): number {
  return DOC_PAGES.reduce(
    (total, page) =>
      total + page.sections.reduce((sub, s) => sub + (s.subs?.length ?? 0), 0),
    0,
  );
}
