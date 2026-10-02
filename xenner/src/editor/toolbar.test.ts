import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * El editor tiene que ser una sola superficie, en un solo idioma, y sin fallos
 * mudos. Estos tests vigilan las tres cosas.
 *
 * Migran de mirar el `.tsx` a mirar los módulos donde vive ahora cada cosa,
 * porque esa separación es el arreglo: un `catch` mudo o un `label` en inglés
 * dejaron de poder esconderse en el `new Crepe({...})`.
 *
 * Son tests de contrato sobre el código, no de comportamiento: comprueban que la
 * regla sigue escrita en el sitio que le toca, no que el editor funcione. Para
 * eso hace falta un navegador, y lo que no se puede probar sin uno se anota en
 * `docs/FRONTEND_ARCHITECTURE.md` como pendiente de un paseo manual.
 */

const COMPONENT = readFileSync(
  new URL("../components/editor/MarkdownEditor.tsx", import.meta.url),
  "utf-8",
);
const TOOLBAR = readFileSync(
  new URL("../components/editor/EditorToolbar.tsx", import.meta.url),
  "utf-8",
);
const CSS = readFileSync(
  new URL("../styles/components/MarkdownEditor.module.css", import.meta.url),
  "utf-8",
);
const COMMANDS = readFileSync(
  new URL("./editor-commands.ts", import.meta.url),
  "utf-8",
);
const CONFIG = readFileSync(new URL("./crepe-config.ts", import.meta.url), "utf-8");

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
  assert.ok(!CSS.includes("data-toolbar"), "la visibilidad vuelve a depender del puntero");
  assert.ok(!COMPONENT.includes("toolbarHover"), "el componente vuelve a medir el puntero");
  assert.ok(!COMPONENT.includes("selectionRect"), "el componente vuelve a medir la selección");
});

test("la barra flotante no ofrece tipos de texto", () => {
  // La barra flotante es para dar FORMATO a lo seleccionado: negrita, cursiva,
  // tachado, código, fórmula, enlace y los dos colores. El tipo de texto no va
  // aquí; su sitio es el `+` del lateral, que está junto al bloque al que se
  // aplica en vez de encima del texto.
  assert.ok(
    !COMPONENT.includes('addGroup("blocks"'),
    "la barra flotante vuelve a traer botones de tipo de texto",
  );
  assert.ok(
    !COMPONENT.includes("block-${item.id}"),
    "la barra flotante vuelve a traer un botón por cada tipo",
  );
  // Y el tipo se sigue cambiando en algún sitio, que era el bug original: solo
  // se puede cambiar con el cursor en una línea.
  assert.match(COMPONENT, /function chooseBlockType/);
  assert.match(COMPONENT, /runBlockCommand\(ctx, type, reportFailure\)/);
  // El dock tampoco los tiene: un solo sitio, el `+`.
  assert.ok(!TOOLBAR.includes("BLOCK_TYPE_ICONS"), "el dock vuelve a ofrecer los tipos");
  assert.ok(!TOOLBAR.includes("onApplyBlock"), "el dock vuelve a cambiar el tipo de texto");
});

test("cambiar el tipo de bloque no traga ninguna excepción", () => {
  // El síntoma que hizo falta reconstruir esto: al cambiar el tipo de un texto
  // seleccionado, el texto desaparecía, el editor dejaba de aceptar nada y al
  // reabrir la nota todo estaba bien y sin guardar. Los `catch` mudos se comían
  // justo la excepción que lo explica. Aquí no puede quedar ni uno.
  assert.ok(
    !/catch \{\s*\}/.test(COMPONENT),
    "queda un catch mudo en el componente: se traga la excepción que rompe el editor",
  );
  assert.ok(
    !/catch \{\s*\}/.test(COMMANDS),
    "queda un catch mudo en los comandos del documento",
  );
  assert.match(COMMANDS, /ReportFailure/);
});

test("un fallo al aplicar el tipo se le dice a quien escribe", () => {
  // Un `console.error` no lo ve nadie. El texto desaparecía sin explicación y
  // quien escribía no tenía forma de saber si había hecho algo mal.
  assert.match(COMPONENT, /function reportFailure/);
  assert.match(COMPONENT, /reportFailure[\s\S]*?notifyError\(/);
  // Cada camino en el que el cambio **no** se aplica avisa, con su motivo: que el
  // botón no haga nada en silencio parece roto, y era justo lo que pasaba con las
  // listas —«Viñetas» sobre un título devolvía `false` sin lanzar excepción y no
  // había ni rastro. En `block-change.test.ts` está medido, no supuesto.
  assert.match(COMMANDS, /report\("no hay un cursor en el texto que cambiar"/);
  assert.match(COMMANDS, /report\("aquí no se puede cambiar el tipo"/);
  assert.match(COMMANDS, /report\(`el tipo \$\{type\} no se pudo aplicar`, error\)/);
  // Y que ya esté del tipo pedido **no** cuenta como fallo: es un gesto que ha
  // funcionado bien.
  assert.match(COMMANDS, /if \(plan\.yaEsta \|\| !plan\.cambios\.length\) return true/);
});

test("el editor no guarda ni recupera la selección para cambiar el tipo", () => {
  // Los botones del menú los dispara un `pointerdown` con `preventDefault`, así
  // que nunca le quitan el foco al `contenteditable`: la selección viva *es* la
  // que hay que cambiar. Antes había un `selectionOnBlur` que la recordaba al
  // perder el foco y la volvía a poner, y era estado defensivo que nadie
  // entendía.
  for (const gone of [
    "selectionOnBlur",
    "forgetStaleSelectionOnBlur",
    "restoreSelectionOnBlur",
    "keepEditorFocus",
    "blockMenuPanel",
    "BLOCK_MENU_WIDTH",
    "prepareInsertionPoint",
    "setInsertAnchor",
    "updateInsertAnchor",
  ]) {
    assert.ok(!COMPONENT.includes(gone), `vuelve \`${gone}\`: el camino ya no lo necesita`);
  }
  // Y el punto de inserción tampoco se prepara: el `+` no inserta.
  assert.ok(!COMMANDS.includes("prepareInsertionPoint"));
  // Menos código muerto por el mismo motivo: sin botón propio no hace falta
  // ninguna de las piezas que existían solo para colocarlo.
  assert.ok(!COMPONENT.includes("inlineInsert"), "queda rastro del botón propio");
  assert.ok(!COMPONENT.includes("canShowBlockHandle"), "queda el cálculo del asa propio");
});

test("el `+` es el de Crepe, con su UI, y solo se le cambia el gesto", () => {
  // No se sustituye el botón: se le cambia lo que pasa al pulsarlo. Rehacerlo
  // obligaba a medir y colocar el botón a mano, y eso es lo que salía mal —el
  // `+` se quedaba donde estaba al moverse el cursor. El de Crepe lo coloca
  // `floating-ui`, que ya lo hace bien.
  assert.match(COMPONENT, /function interceptHandleAdd/);
  assert.match(COMPONENT, /\.milkdown-block-handle \.operation-item:first-child/);
  // Se come el evento en captura para que el `onAdd` de Crepe no lo vea.
  assert.match(COMPONENT, /addEventListener\("pointerup", onPointerUp, true\)/);
  assert.match(COMPONENT, /event\.stopPropagation\(\)/);
  // Y el botón de Crepe NO se esconde: si se escondiera, esto sería otro botón
  // propio con otro posicionamiento, que es justo el problema.
  assert.ok(
    !CSS.includes("operation-item:first-child"),
    "el `+` de Crepe vuelve a esconderse: eso rehace el botón y su posición",
  );
  assert.ok(!COMPONENT.includes("blockInsert"), "vuelve el botón propio del editor");
});

test("el menú se ancla al asa, no a una posición calculada", () => {
  // El bug era que el `+` no entendía el cambio de posición. La causa: se medía
  // el cursor y se colocaba a mano. El menú sale de la posición **real** del asa,
  // que `floating-ui` ya tiene, y espera un `rAF` porque esa posición se aplica
  // en un `then`.
  assert.match(COMPONENT, /handle\.getBoundingClientRect\(\)/);
  assert.match(COMPONENT, /requestAnimationFrame/);
  // Y no queda ningún cálculo de posición del cursor.
  assert.ok(
    !COMPONENT.includes("coordsAtPos"),
    "el menú vuelve a medirse con el cursor, que es lo que se descolocaba",
  );
});

test("el `+` no inserta nada: solo abre el menú", () => {
  // El gesto es poner algo en la nota, no abrir una línea nueva. Si el `+` tocara
  // el documento, cada pulsación metería un párrafo que nadie pidió.
  const abrir = COMPONENT.slice(
    COMPONENT.indexOf("function toggleInsertMenu"),
    COMPONENT.indexOf("function closeInsertMenu"),
  );
  assert.ok(
    !/splitBlock|createParagraphNear|insertText|delete\(/.test(abrir),
    "el + vuelve a tocar el documento: mete una línea que nadie pidió",
  );
});

test("el menú del `+` pinta los tres grupos, no solo los de texto", () => {
  // Markdown entero y las tres cosas de la app, en el mismo menú.
  assert.match(COMPONENT, /<For each=\{INSERT_MENU\}>/);
  assert.match(COMPONENT, /class=\{styles\.insertGroup\}/);
  assert.match(COMPONENT, /class=\{styles\.insertGroupTitle\}/);
  // Cada entrada va a lo que le toca según su `kind`.
  assert.match(COMPONENT, /if \(item\.kind === "block"\)/);
  assert.match(COMPONENT, /item\.kind === "image"/);
  assert.match(COMPONENT, /item\.kind === "whiteboard"/);
  assert.match(COMPONENT, /props\.requestAttachment\?\.\(\)/);
});

test("el menú no se roba el foco ni se come el clic del asa", () => {
  // El `pointerdown` con `preventDefault` en cada fila: sin él el botón recibe el
  // foco y el editor pierde la selección justo antes de aplicar el tipo.
  assert.match(COMPONENT, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  // Y el asa queda excepta del cierre: el gesto del `+` pasa por ahí, así que si
  // el menú se cerrara con el clic en el asa, se cerraría antes de abrirse.
  assert.match(COMPONENT, /closest\("\.milkdown-block-handle"\)/);
});

test("la barra flotante es compacta con lo que lleva", () => {
  // Sin los siete botones de tipo son ocho, y caben de sobra. Se aprieta igual
  // para que un tema con otros iconos no las parta en dos filas.
  const items = /\.milkdown-toolbar \.toolbar-item\)\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
  assert.match(items, /width:\s*28px/);
  assert.match(items, /height:\s*28px/);
  assert.match(CSS, /\.milkdown-toolbar\)\s*\{[^}]*max-width:/);
});

test("el dock son tres botones y no hay dos caminos para lo mismo", () => {
  // El dock tuvo un botón «Insertar» con un menú Y los tres botones al lado, y
  // los dos caminos hacían lo mismo. Con tres acciones, iconos solos.
  assert.ok(!TOOLBAR.includes("insertOpen"), "el dock vuelve a abrir un menú");
  for (const action of [
    'aria-label="Insertar imagen"',
    'aria-label="Insertar pizarra"',
    'aria-label="Adjuntar archivo"',
  ]) {
    assert.ok(TOOLBAR.includes(action), `falta el botón ${action}`);
  }
  // Los tres con el mismo feedback: sin él, subir un PDF de varios megas parece
  // que la app se ha colgado.
  assert.equal((TOOLBAR.match(/styles\.busy/g) ?? []).length, 3);
});

test("la configuración de Crepe no vuelve al componente", () => {
  // El arreglo estructural: todo vivía en el `new Crepe({...})`, así que un
  // cambio del `+` acababa tocando la configuración del menú de enlaces.
  assert.match(CONFIG, /CREPE_BUTTON_LABELS/);
  assert.match(CONFIG, /SLASH_GROUPS/);
  // El componente puede *asignar* `boldLabel:` —eso es cablear—, pero no puede
  // escribir el texto ahí: tiene que salir del módulo de configuración.
  assert.ok(
    !/boldLabel:\s*"/.test(COMPONENT),
    "las etiquetas de Crepe vuelven a escribirse a mano en el componente",
  );
  assert.match(COMPONENT, /boldLabel:\s*CREPE_BUTTON_LABELS\.bold/);
  assert.ok(
    !COMPONENT.includes("Título 1"),
    "los rótulos del menú slash vuelven a escribirse a mano en el componente",
  );
});

test("arrastrar un archivo cualquiera lo adjunta de verdad", () => {
  // El `onDragOver` solo hacía `preventDefault` para imágenes mientras el `drop`
  // aceptaba todas: arrastrar un PDF no cancelaba el gesto, así que el WebView
  // lo abría por su cuenta. Los dos tienen que mirar lo mismo.
  const pane = readFileSync(
    new URL("../components/editor/EditorPane.tsx", import.meta.url),
    "utf-8",
  );
  assert.match(pane, /onDragOver=\{\(event\) => \{[^}]*droppedFile\(event\.dataTransfer\)/);
  assert.match(pane, /onDrop=\{handleFileDrop\}/);
  assert.ok(
    !pane.includes("imageFileFromDataTransfer"),
    "queda la función muerta del dragover antiguo",
  );
});