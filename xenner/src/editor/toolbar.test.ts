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
  // Y el tipo se sigue cambiando en algún sitio, que era el bug original: lo
  // hace el menú del `+` de Crepe. Ni la barra ni el dock añaden botones.
  assert.ok(!TOOLBAR.includes("block-${item.id}"), "el dock vuelve a traer un botón por cada tipo");
  assert.ok(!TOOLBAR.includes("BLOCK_TYPE_ICONS"), "el dock vuelve a ofrecer los tipos");
  assert.ok(!TOOLBAR.includes("onApplyBlock"), "el dock vuelve a cambiar el tipo de texto");
});

test("insertar en la nota no traga ninguna excepción", () => {
  // El síntoma que hizo falta reconstruir esto: al insertar, el texto
  // desaparecía, el editor dejaba de aceptar nada y al reabrir la nota todo
  // estaba bien y sin guardar. Los `catch` mudos se comían justo la excepción que
  // lo explica. Aquí no puede quedar ni uno.
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

test("un fallo al insertar se le dice a quien escribe", () => {
  // Un `console.error` no lo ve nadie. El texto desaparecía sin explicación y
  // quien escribía no tenía forma de saber si había hecho algo mal.
  assert.match(COMPONENT, /function reportFailure/);
  assert.match(COMPONENT, /reportFailure[\s\S]*?notifyError\(/);
  // Cada camino en el que la inserción **no** se hace avisa, con su motivo: un
  // botón que no hace nada en silencio parece roto. En
  // `editor-commands.test.ts` está ejecutado, no supuesto.
  assert.match(COMMANDS, /report\("no se pudo escribir el enlace al archivo"/);
  assert.match(COMMANDS, /report\("no se pudo insertar el bloque"/);
  assert.match(COMMANDS, /report\("no se pudo devolver el cursor al texto"/);
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

test("el `+` es el de Crepe, entero: no se intercepta ni se coloca a mano", () => {
  // Lo que había aquí era un `pointerup` en fase de captura sobre `document` que
  // se comía el gesto del `+` de Crepe, más un `rAF` que medía el rectángulo del
  // asa para colocar un menú propio. Todo eso sustituía algo que Crepe ya hace
  // bien —su botón bien puesto por `floating-ui` y su menú con todo Markdown— y
  // además era el único trozo del editor que escuchaba en `document`, o sea el
  // único que podía comerse el evento de alguien más.
  for (const sobra of [
    "interceptHandleAdd",
    "toggleInsertMenu",
    "insertMenu",
    "insertAnchor",
    "coordsAtPos",
    "requestImage",
  ]) {
    assert.ok(!COMPONENT.includes(sobra), `vuelve \`${sobra}\`: el + es de Crepe, no nuestro`);
  }
  // Ni un solo listener nuestro en `document`.
  assert.ok(
    !/document\.addEventListener/.test(COMPONENT),
    "el editor vuelve a escuchar en `document`, que roba el evento del resto",
  );
});

test("el menú del `+` es el de Crepe, y solo se le añade lo que no tiene", () => {
  // El menú de Crepe ya trae texto, los seis títulos, viñetas, numerada, tareas,
  // cita, código, separador, tabla, imagen y fórmula. Lo único que hay que
  // añadir son las dos cosas de la app: adjuntar archivo y pizarra.
  assert.match(COMPONENT, /buildMenu\(builder\)/);
  assert.match(COMPONENT, /addItem\("attachment"/);
  assert.match(COMPONENT, /addItem\("whiteboard"/);
  assert.match(COMPONENT, /props\.requestAttachment\?\.\(\)/);
  // Y no queda ninguna regla CSS de un menú propio.
  assert.ok(!CSS.includes("insertMenu"), "vuelve el CSS del menú propio");
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