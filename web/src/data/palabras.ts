/**
 * El diccionario de la documentación, en datos y no en el HTML de la página.
 *
 * Existe por una razón concreta: esta documentación explica cómo cambiar el
 * aspecto de un programa, y para cambiarlo hay que saber un puñado de palabras
 * que no son del español de cada día. «Degradado», «selector», «variable»,
 * «heredado». Quien no las conoce no se atasca en lo que está intentando hacer,
 * se atasca en la palabra, y se marcha.
 *
 * La entrada está escrita como se habla, no como se define: primero lo que es,
 * luego para qué está aquí, y solo después el ejemplo. Un diccionario que
 * empieza por la definición es un diccionario que solo lee quien ya sabe.
 *
 * Cada entrada lleva su propia página de ejemplo, y hay un test que comprueba
 * que los identificadores de aquí son los del HTML. Al revés que en
 * `data/skins.ts`: allí el HTML se genera, y aquí lo escribe una persona.
 */

export type PalabraGrupo = "sin-css" | "con-css";

export interface Palabra {
  /** El identificador del `<h3>`, sin almohadilla. */
  id: string;
  /** La palabra tal cual se escribe, para buscarla con el navegador. */
  term: string;
  /** Qué es, en una frase y sin jerga. */
  what: string;
  /** Para qué está aquí, o qué se puede hacer con ella. */
  why: string;
  /** Un ejemplo corto, o `null` si la palabra no se ve en pantalla. */
  example: string | null;
  /** Si la palabra sale de un grupo concreto de la página. */
  grupo: PalabraGrupo;
}

export const GRUPOS: readonly { id: PalabraGrupo; label: string; lead: string }[] = [
  {
    id: "sin-css",
    label: "Para cambiar colores y formas",
    lead:
      "Con esto se resuelve el noventa por ciento de lo que la gente quiere. No hace falta nada más.",
  },
  {
    id: "con-css",
    label: "Para cambiarlo todo",
    lead:
      "Solo hace falta si quieres algo que los archivos de color no pueden dar: la posición de las cosas, el movimiento, o un aspecto distinto de día y de noche.",
  },
];

export const PALABRAS: readonly Palabra[] = [
  /* ------------------------------------------------------ archivos de texto */
  {
    id: "archivo-de-texto",
    term: "Archivo de texto",
    grupo: "sin-css",
    what: "Un archivo que solo tiene letras dentro, y que se abre con el Bloc de notas.",
    why: "Es lo único que hace falta para cambiar el aspecto de Xenner. No hay que instalar nada, ni compilar, ni guardar nada más después.",
    example: "Un archivo que se llama «Bloc de notas» en Windows y «TextEdit» en el Mac, y que viene ya en el ordenador.",
  },
  {
    id: "clave-y-valor",
    term: "Clave y valor",
    grupo: "sin-css",
    what: "Cada línea de un archivo de skin tiene dos partes: qué se cambia, y el valor nuevo.",
    why:
      "La clave es el nombre de la cosa y no se toca. El valor es lo que escribes tú, siempre entre comillas.",
    example: 'text="#ff00ff" — la clave es «text», el valor es «#ff00ff», y lo que sale es texto magenta.',
  },
  {
    id: "color-hexadecimal",
    term: "Color hexadecimal",
    grupo: "sin-css",
    what: "La forma de escribir un color con una almohadilla delante: # seguido de seis letras y números.",
    why:
      "Es como lo escribe el ordenador por dentro, y funciona en todos los sistemas. Es más larga que el nombre del color, pero siempre acierta.",
    example: "#000000 es negro, #ffffff es blanco, #ff0000 es rojo. Las letras van de 0 a 9 y de la a a la f.",
  },
  {
    id: "transparente",
    term: "Transparencia",
    grupo: "sin-css",
    what: "Un color que deja ver lo que hay detrás, y se escribe con cuatro números entre paréntesis.",
    why: "Es lo que hace que un tema se vea de cristal. Los cuatro números son el rojo, el verde, el azul, y cuánto se transparenta —del 0 al 1.",
    example: "rgba(32,32,32,0.8) es un gris oscuro que se ve un poco. El 0 es invisible y el 1 es opaco.",
  },
  {
    id: "degradado",
    term: "Degradado",
    grupo: "sin-css",
    what: "Un color que se va convirtiendo en otro, en vez de ser uno solo.",
    why: "Sirve para fondos: un degradado da profundidad sin necesitar ninguna imagen.",
    example: 'background="linear-gradient(180deg, #1a1a2e, #16213e)" — de arriba abajo, de un color a otro.',
  },
  {
    id: "url",
    term: "url()",
    grupo: "sin-css",
    what: "La forma de decir «usa esta imagen en vez de un color plano».",
    why:
      "Es lo que permite poner un SVG, un dibujo o una foto tuyos detrás de un botón, de una nota o de la ventana.",
    example: 'background="url(assets/mi-fondo.svg)" — la imagen se llama mi-fondo.svg y está en la carpeta assets.',
  },
  {
    id: "assets",
    term: "La carpeta assets",
    grupo: "sin-css",
    what: "La carpeta donde Xenner busca tus imágenes y tus tipografías.",
    why:
      "Todo lo que pongas dentro se puede usar desde cualquier archivo de la skin. El nombre importa: tiene que ser exactamente el que escribes.",
    example: "assets/mi-fondo.svg — la carpeta assets, el archivo mi-fondo.svg.",
  },
  {
    id: "custom-css",
    term: "custom.css",
    grupo: "con-css",
    what: "Un archivo de texto donde se escribe CSS, que es el idioma con el que se pinta el aspecto de una página web.",
    why:
      "Es la diferencia entre cambiar el color de algo y cambiar cómo está colocado. Los archivos de color no llegan; este sí.",
    example: null,
  },
  {
    id: "regla",
    term: "Regla",
    grupo: "con-css",
    what: "Un bloque de texto que dice «esto se parece así», y siempre tiene la misma forma.",
    why:
      "Es la unidad de la que está hecho el CSS. Copiar una regla entera y cambiarle el color suele bastar.",
    example: '[data-x="note"] { background: #ffffff; } — «la nota» se pone blanca.',
  },
  {
    id: "selector",
    term: "Selector",
    grupo: "con-css",
    what: "La parte de arriba de una regla: a quién le hablas.",
    why: "Si el selector no coincide con nada, la regla no hace nada. Es lo más común que salga mal, y por eso hay una lista pública de selectores.",
    example: '[data-x="button"] habla a todos los botones. Con "primary" detrás, solo al grande.',
  },
  {
    id: "propiedad",
    term: "Propiedad",
    grupo: "con-css",
    what: "Cada línea dentro de una regla: una cosa que se cambia y su valor.",
    why: "Se leen de dos en dos: primero la propiedad, después el valor. El punto y coma separa una de otra.",
    example: "background es la propiedad y #ffffff es su valor.",
  },
  {
    id: "data-x",
    term: "data-x",
    grupo: "con-css",
    what: "El nombre que tiene cada trozo de la ventana, para poder hablar de él.",
    why:
      "Los nombres de clase cambian en cada compilación del programa, así que no sirven. Estos no cambian: la lista es pública y si cambia, se avisa.",
    example: 'data-x="sidebar" es la columna de la izquierda, data-x="note" es el editor.',
  },
  {
    id: "variable",
    term: "Variable",
    grupo: "con-css",
    what: "Un nombre al que le das un valor una vez, y luego usas en todas partes.",
    why:
      "Se escribe con dos rayas delante. Sirve para no repetir el mismo color veinte veces: si quieres cambiarlo, lo cambias en un sitio.",
    example: "--papel: #f6f8fd; y luego background: var(--papel);",
  },
  {
    id: "heredado",
    term: "Heredado",
    grupo: "con-css",
    what: "Cuando no dices nada, Xenner decide por su cuenta.",
    why:
      "Es lo que hace que un archivo de skin pueda tener dos líneas. Lo que no escribas, se queda como Xenner lo trae de fábrica, y por eso nunca se queda en blanco.",
    example: "Un note.txt con una sola línea cambia el color del texto y nada más. El resto sigue igual.",
  },
  {
    id: "inmediato",
    term: "Sin reiniciar",
    grupo: "con-css",
    what: "Xenner está mirando los archivos mientras los escribes.",
    why:
      "Guardas el archivo y a los dos o tres segundos la ventana ya está distinta. Es lo que hace que probar veinte ideas no sea un avance de veinte minutos.",
    example: "No hace falta cerrar Xenner ni reiniciar el ordenador. Solo guardar.",
  },
];

/** Todas las entradas, por orden de lectura. */
export function palabrasDe(grupo: PalabraGrupo): readonly Palabra[] {
  return PALABRAS.filter((palabra) => palabra.grupo === grupo);
}
