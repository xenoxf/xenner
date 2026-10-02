import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * El mini menú de formato tiene que estar visible y funcionar.
 *
 * Nació de un bug real: la barra flotante de Crepe se tapaba con `opacity: 0`
 * salvo que el puntero estuviera encima del texto seleccionado. Con el teclado
 * (Mayús flechas, doble clic, Ctrl+A) el puntero no se mueve, la barra no salía
 * nunca, y no había forma de poner negrita, cursiva o un título a lo
 * seleccionado. Con el ratón era una lotería, y además la barra invisible
 * seguía encima del texto cogiendo clics.
 *
 * Estos tests miran el CSS y el componente como texto, que es la única forma de
 * vigilarlo sin un navegador. No comprueban que la barra funcione: comprueban
 * que nadie vuelva a esconderla.
 */

const CSS = readFileSync(
  new URL("../styles/components/MarkdownEditor.module.css", import.meta.url),
  "utf-8",
);
const COMPONENT = readFileSync(
  new URL("../components/editor/MarkdownEditor.tsx", import.meta.url),
  "utf-8",
);
const TOOLBAR = readFileSync(
  new URL("../components/editor/EditorToolbar.tsx", import.meta.url),
  "utf-8",
);

test("el mini menú no se esconde", () => {
  // Ni transparente, ni con `visibility`, ni apagado por un atributo propio.
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*opacity:\s*0/.test(CSS),
    "el mini menú se vuelve a tapar con opacity: 0: deja de poder usarse con el teclado",
  );
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*visibility:\s*hidden/.test(CSS),
    "el mini menú se vuelve a esconder con visibility: hidden",
  );
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*pointer-events:\s*none/.test(CSS),
    "el mini menú no puede recibir clics: pointer-events está apagado",
  );
});

test("el mini menú no depende de por dónde esté el puntero", () => {
  assert.ok(
    !CSS.includes('data-toolbar'),
    "la visibilidad del mini menú depende otra vez de un atributo que pone el puntero",
  );
  assert.ok(
    !COMPONENT.includes("toolbarHover"),
    "el componente vuelve a calcular si el puntero está sobre el texto seleccionado",
  );
  assert.ok(
    !COMPONENT.includes("selectionRect"),
    "el componente vuelve a medir la selección para decidir si se muestra la barra",
  );
});

test("el mini menu conserva los dos botones propios de Xenner", () => {
  // El `buildToolbar` de Crepe se llama DESPUÉS de añadir sus grupos, así que
  // esto no quita ni la negrita ni los títulos: los añade. Lo que sí hay que
  // vigilar es que los dos botones de color no desaparezcan.
  assert.match(COMPONENT, /addItem\(\s*"text-color"/);
  assert.match(COMPONENT, /addItem\(\s*"text-background"/);
});

test("un fallo al aplicar el tipo de texto se le dice a quien escribe", () => {
  // Un `console.error` no lo ve nadie. El síntoma era el peor posible: el texto
  // desaparecía sin explicación, y quien escribía se quedaba sin saber si había
  // hecho algo mal.
  assert.match(COMPONENT, /function reportEditorFailure/);
  assert.match(COMPONENT, /reportEditorFailure[\s\S]*?notifyError\(/);
  // Que el comando no haga nada también es un fallo, no un no-op silencioso.
  assert.match(COMPONENT, /else reportEditorFailure\(/);
  // Y el aviso de producción va dentro de DEV: fuera de desarrollo no hay nada
  // que reportar y no debe quedar ruido en la consola.
  assert.match(COMPONENT, /import\.meta\.env\.DEV/);
});

test("el tipo de texto se cambia en la barra flotante, no en otro sitio", () => {
  // Nació de un bug real: Crepe pone en su barra negrita, cursiva, tachado,
  // código, fórmula y enlace, pero ningún botón que cambie el bloque. Sin esto
  // el tipo solo se podía cambiar con el cursor en una línea, nunca sobre el
  // texto que se acababa de seleccionar.
  assert.match(COMPONENT, /addGroup\(\s*"blocks"/);
  assert.match(COMPONENT, /EDITOR_BLOCKS/);
  assert.match(COMPONENT, /for \(const item of EDITOR_BLOCKS\)/);
  // Y el dock no los repite: dos menús para lo mismo obligaban a decidir cuál
  // era el bueno.
  assert.ok(
    !TOOLBAR.includes("EDITOR_BLOCKS"),
    "el dock vuelve a ofrecer los tipos de texto: duplica el sitio donde se cambian",
  );
  assert.ok(
    !TOOLBAR.includes("onApplyBlock"),
    "el dock vuelve a poder cambiar el tipo de texto",
  );
});

test("cambiar el tipo de bloque no traga ninguna excepción", () => {
  // El síntoma que hizo falta reconstruir esto: al cambiar el tipo de un texto
  // seleccionado, el texto desaparecía, el editor dejaba de aceptar nada y al
  // reabrir la nota todo estaba bien y sin guardar. Los `catch` mudos de este
  // archivo se comían justo la excepción que lo explica. Aquí no puede quedar
  // ni uno, y el botón avisa de lo que hace.
  assert.ok(
    !/catch \{\s*\}/.test(COMPONENT),
    "queda un catch mudo: se vuelve a tragarse la excepción que rompe el editor",
  );
  assert.match(COMPONENT, /function reportEditorFailure/);
  assert.match(COMPONENT, /console\.debug\("xenner: tipo de bloque"/);
  // Si el largo del texto cambia, ha entrado un comando que borra.
  assert.match(COMPONENT, /caracteresAntes: before/);
  assert.match(COMPONENT, /caracteresDespues: after/);
});

test("cambiar el tipo no necesita recordar la selección", () => {
  // El camino está en la barra flotante, cuyos botones son de Crepe y no le
  // quitan el foco al editor: la selección viva ES la que hay que cambiar.
  // Guardarla y recuperarla era estado defensivo que nadie entendía.
  for (const gone of [
    "selectionOnBlur",
    "forgetStaleSelectionOnBlur",
    "restoreSelectionOnBlur",
    "keepEditorFocus",
    "blockMenuPanel",
    "BLOCK_MENU_WIDTH",
    "toggleBlockMenu",
  ]) {
    assert.ok(
      !COMPONENT.includes(gone),
      `vuelve \`${gone}\`: el camino del tipo de texto ya no lo necesita`,
    );
  }
});

test("la barra flotante es compacta para caber en una fila con los 7 tipos", () => {
  // La barra lleva formato y tipo de texto: quince botones. Para que siga
  // cabiendo sobre la columna de lectura se aprieta —28 px de botón, 3 px de
  // margen— y el `flex-wrap` queda solo como red de seguridad para ventanas
  // estrechas o temas con otros iconos, no como su forma normal.
  const items = /\.milkdown-toolbar \.toolbar-item\)\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
  assert.match(items, /width:\s*28px/);
  assert.match(items, /height:\s*28px/);
  assert.match(items, /margin:\s*3px/);
  assert.match(CSS, /\.milkdown-toolbar\)\s*\{[^}]*max-width:/);
});

test("el dock son tres botones y no hay dos caminos para lo mismo", () => {
  // El dock tuvo un botón «Insertar» con un menú Y los tres botones al lado, y los
  // dos caminos hacían lo mismo. Con tres acciones, iconos solos: un clic en vez
  // de dos y una barra que se ajusta a lo que ocupa.
  assert.ok(
    !TOOLBAR.includes("insertOpen"),
    "el dock vuelve a abrir un menú: los mismos botones en dos sitios",
  );
  assert.ok(
    !TOOLBAR.includes('type="search"'),
    "el menú del dock vuelve a tener un buscador dentro",
  );
  for (const action of [
    'aria-label="Insertar imagen"',
    'aria-label="Insertar pizarra"',
    'aria-label="Adjuntar archivo"',
  ]) {
    assert.ok(TOOLBAR.includes(action), `falta el botón ${action}`);
  }
  // Y los tres tienen el mismo feedback de «subiendo», no solo imagen y pizarra:
  // sin él, subir un PDF de varios megas parece que la app se ha colgado.
  const spinners = TOOLBAR.match(/styles\.busy/g) ?? [];
  assert.equal(spinners.length, 3, "un botón del dock se queda sin indicador de carga");
});

test("la interfaz del editor habla un solo idioma", () => {
  // La barra flotante la pinta Crepe, que por defecto pone los nombres en
  // inglés. Los botones solo llevan un SVG dentro, así que sin `label` no tienen
  // nombre accesible y un lector de pantalla lee «botón» a secas; con el nombre en
  // inglés, en una nota en español se lee *Bold* a mitad de frase.
  for (const label of [
    'boldLabel: "Negrita"',
    'italicLabel: "Cursiva"',
    'strikethroughLabel: "Tachado"',
    'codeLabel: "Código en línea"',
    'latexLabel: "Fórmula"',
    'linkLabel: "Enlace"',
  ]) {
    assert.ok(COMPONENT.includes(label), `la barra flotante no traduce ${label}`);
  }
  // Los textos de subir imagen y de pegar un enlace también venían en inglés.
  for (const label of [
    'blockUploadButton: "Subir archivo"',
    'blockConfirmButton: "Confirmar"',
    'blockUploadPlaceholderText: "o pega un enlace"',
    'blockCaptionPlaceholderText: "Escribe el pie de la imagen"',
    'inlineUploadButton: "Subir"',
    'inlineUploadPlaceholderText: "o pega un enlace"',
    'inputPlaceholder: "Pega el enlace…"',
    'searchPlaceholder: "Buscar lenguaje"',
    'noResultText: "Sin resultados"',
  ]) {
    assert.ok(COMPONENT.includes(label), `queda en inglés: ${label}`);
  }
});

test("arrastrar un archivo cualquiera lo adjunta de verdad", () => {
  // El `onDragOver` solo hacía `preventDefault` para imágenes mientras el `drop`
  // aceptaba todas: arrastrar un PDF no cancelaba el gesto, así que el WebView lo
  // abría por su cuenta en vez de adjuntarlo. Los dos tienen que mirar lo mismo.
  assert.ok(
    !/onDragOver=\{\(event\) => \{\s*if \([a-zA-Z]+FileFromDataTransfer/.test(COMPONENT.replace("EditorPane", "")),
    "el dragover vuelve a mirar solo imágenes",
  );
  const pane = readFileSync(
    new URL("../components/editor/EditorPane.tsx", import.meta.url),
    "utf-8",
  );
  assert.match(pane, /onDragOver=\{\(event\) => \{[^}]*droppedFile\(event\.dataTransfer\)/);
  assert.match(pane, /onDrop=\{handleFileDrop\}/);
  // La función que solo miraba imágenes era del `dragover` viejo y se quedaba
  // muerta en medio del archivo.
  assert.ok(!pane.includes("imageFileFromDataTransfer"), "queda la función muerta del dragover antiguo");
});
