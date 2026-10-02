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

test("el mini menu cambia el tipo de texto desde un botón, no desde siete", () => {
  // Nació de un bug real: Crepe pone en su barra negrita, cursiva, tachado,
  // código, fórmula y enlace, pero ningún botón que cambie el bloque. Con un
  // botón por tipo, la barra dejó de caber sobre el texto y se partió en dos
  // filas, tapando justo lo que se había seleccionado. Ahora hay un `+` que
  // abre un menú con los siete tipos.
  assert.match(COMPONENT, /addGroup\(\s*"blocks"/);
  assert.match(COMPONENT, /addItem\(\s*"block-menu"/);
  assert.match(COMPONENT, /toggleBlockMenu/);
  // Ni un botón por tipo en la barra: es lo que la hacía más ancha que el texto.
  assert.ok(
    !/addItem\(\s*`block-/.test(COMPONENT),
    "vuelve un botón por cada tipo de texto en la barra flotante",
  );
});

test("el menú de tipos se ancla bajo la barra, no encima de la selección", () => {
  // Encima de la selección está la propia barra flotante: dos superficies
  // superpuestas sobre el texto es justo lo que se quería evitar.
  assert.match(COMPONENT, /anchor\.bottom - bounds\.top/);
  assert.match(CSS, /\.blockMenu\s*\{[^}]*position:\s*absolute/);
  // Y se recorta contra el borde de la nota para no salirse por la derecha.
  assert.match(COMPONENT, /bounds\.width - BLOCK_MENU_WIDTH/);
});

test("elegir un tipo no hace desaparecer el texto seleccionado", () => {
  // Nació de un bug real: el menú vive dentro de la raíz del editor pero fuera
  // del `contenteditable`, así que al pulsar un tipo el foco se iba al botón y el
  // editor se quedaba sin selección. Quien estaba escribiendo veía desaparecer
  // el texto que acababa de seleccionar, y el comando ya no tenía a qué
  // aplicarse. Es el mismo truco que el dock usa con su `onMouseDown`.
  assert.match(COMPONENT, /onPointerDown=\{keepEditorFocus\}/);
  assert.match(COMPONENT, /function keepEditorFocus\(event: PointerEvent\)/);
  const keep = COMPONENT.slice(
    COMPONENT.indexOf("function keepEditorFocus"),
    COMPONENT.indexOf("function toggleBlockMenu"),
  );
  assert.match(keep, /event\.preventDefault\(\)/);
  // Y la selección se guarda al ABRIR el menú, no solo al perder el foco: así el
  // comando no depende de que la selección siga viva por el camino.
  const toggle = COMPONENT.slice(
    COMPONENT.indexOf("function toggleBlockMenu"),
    COMPONENT.indexOf("function closeBlockMenu"),
  );
  assert.match(toggle, /selectionOnBlur\s*=/);
});

test("los dos menús de tipo de texto son pequeños y sin adornos", () => {
  // Diez entradas de dos palabras se leen de un vistazo. Un buscador y unos
  // encabezados de grupo solo agrandaban el menú y repetían en mayúsculas lo que
  // el icono ya decía.
  assert.ok(
    !TOOLBAR.includes('type="search"'),
    "el menú del dock vuelve a tener un buscador dentro",
  );
  assert.ok(
    !TOOLBAR.includes("menuGroup"),
    "el menú del dock vuelve a agrupar las entradas bajo un encabezado",
  );
  assert.ok(
    !CSS.includes("blockMenuTitle"),
    "el menú de tipos vuelve a poner un título encima de las opciones",
  );
  // El CSS y el cálculo de colocación no pueden quedar en medidas distintas: el
  // `left` se recorta contra el ancho real, y si no coinciden el menú se sale.
  const declared = /const BLOCK_MENU_WIDTH = (\d+)/.exec(COMPONENT)?.[1];
  const styled = /\.blockMenu\s*\{[^}]*width:\s*(\d+)px/.exec(CSS)?.[1];
  assert.equal(declared, styled, "el ancho del menú difiere entre el CSS y el código");
  assert.ok(Number(styled) <= 176, `el menú de tipos sigue siendo ancho: ${styled}px`);
});

test("cambiar el tipo de bloque no pierde el texto seleccionado", () => {
  // El dock y el menú se quedan con el foco al abrir. Si no se recupera la
  // selección del `blur` antes de aplicar el comando, el tipo acaba puesto en
  // la línea del cursor en vez de en lo seleccionado.
  assert.match(COMPONENT, /function applyBlockType/);
  const apply = COMPONENT.slice(
    COMPONENT.indexOf("function applyBlockType"),
    COMPONENT.indexOf("function captureTextSelection"),
  );
  assert.match(apply, /restoreSelectionOnBlur\(view\)/);
  assert.ok(
    apply.indexOf("restoreSelectionOnBlur") < apply.indexOf("commands.call"),
    "la selección se recupera después del comando: llega tarde",
  );
  assert.match(COMPONENT, /handleDOMEvents:\s*\{\s*blur:/);
});

test("la barra flotante no se parte en dos filas", () => {
  // Con los siete botones de tipo tenía que partirse; ahora cabe en una fila.
  // El tope de ancho sigue estando por si un tema cambia el tamaño de los
  // botones, pero sin `flex-wrap` no hay una segunda fila.
  assert.match(CSS, /\.milkdown-toolbar\)\s*\{[^}]*max-width:/);
  assert.ok(
    !/\.milkdown-toolbar\)\s*\{[^}]*flex-wrap:\s*wrap/.test(CSS),
    "la barra flotante vuelve a partirse en dos filas",
  );
});

test("el menú de tipos se cierra sin que el `+` se cierre y se abra a la vez", () => {
  // Crepe dispara sus botones en `pointerdown`. Si el menú se cerrara con un
  // clic en la barra, el `+` se cerraría en el `pointerdown` y su propio `onRun`
  // lo abriría otra vez en el mismo gesto: el botón no cerraría nunca.
  assert.match(COMPONENT, /closest\("\.milkdown-toolbar"\)/);
});

test("el menú de adjuntos existe en el dock", () => {
  // Adjuntar es insertar un archivo cualquiera en `.assets` y enlazarlo desde la
  // nota. Sin su entrada en el menú solo se llegaba arrastrándolo encima.
  assert.match(TOOLBAR, /id:\s*"attachment"/);
  assert.match(TOOLBAR, /onChooseAttachment/);
});
