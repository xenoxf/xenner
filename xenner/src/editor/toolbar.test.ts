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

test("el tipo de texto se cambia en la barra flotante, no en otro sitio", () => {
  // Crepe pone negrita, cursiva, tachado, código, fórmula y enlace, pero ningún
  // botón que cambie el tipo de bloque: sin este grupo el tipo solo se podía
  // cambiar con el cursor en una línea, nunca sobre el texto seleccionado.
  assert.match(COMPONENT, /addGroup\("blocks"/);
  assert.match(COMPONENT, /BLOCK_TYPE_ICONS/);
  // Y el dock no los repite: dos menús para lo mismo obligaban a decidir cuál
  // era el bueno.
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
  // Que el comando devuelva `false` sin lanzar también cuenta como fallo: un
  // botón que no hace nada en silencio parece roto.
  assert.match(COMMANDS, /if \(!applied\) report\(/);
});

test("el editor no guarda ni recupera la selección para cambiar el tipo", () => {
  // Los botones de la barra los dispara Crepe en `pointerdown` con
  // `preventDefault`, así que nunca le quitan el foco al `contenteditable`: la
  // selección viva *es* la que hay que cambiar. Antes había un `selectionOnBlur`
  // que la recordaba al perder el foco y la volvía a poner, y era estado
  // defensivo que nadie entendía.
  for (const gone of [
    "selectionOnBlur",
    "forgetStaleSelectionOnBlur",
    "restoreSelectionOnBlur",
    "keepEditorFocus",
    "blockMenuPanel",
    "BLOCK_MENU_WIDTH",
    "toggleBlockMenu",
  ]) {
    assert.ok(!COMPONENT.includes(gone), `vuelve \`${gone}\`: el camino ya no lo necesita`);
  }
});

test("el `+` del asa se sustituye por el nuestro", () => {
  // El de Crepe inserta siempre por debajo del bloque y abre el menú de tipos:
  // a media frase partía el texto y además metía una línea de más. Su `onAdd` no
  // es configurable, así que se oculta por CSS y se pone el nuestro al lado.
  assert.match(CSS, /\.milkdown-block-handle \.operation-item:first-child\)\s*\{[^}]*display:\s*none/);
  assert.match(COMPONENT, /function showInlineInsertMenu/);
  assert.match(COMPONENT, /prepareInsertionPoint/);
  // El menú se abre escribiendo `/`, que es lo que hace el menú slash al
  // teclearlo; `menuAPI` no está exportado por el paquete.
  assert.match(COMPONENT, /insertText\("\/"\)/);
});

test("el `+` y el asa aparecen y desaparezcan juntos", () => {
  // Si tuvieran condiciones distintas, un `+` suelto sin tirador al lado parece
  // un botón que se ha quedado a medias.
  assert.match(COMPONENT, /shouldShow: \(\) => \{[\s\S]*?canShowBlockHandle\(view\)/);
  assert.match(COMPONENT, /Show when=\{insertAnchor\(\)\}/);
});

test("la barra flotante es compacta para caber en una fila con los 7 tipos", () => {
  // La barra lleva formato y tipo de texto: quince botones. Para que siga
  // cabiendo sobre la columna de lectura se aprieta —28 px de botón, 3 px de
  // margen— y el `flex-wrap` queda solo como red de seguridad.
  const items = /\.milkdown-toolbar \.toolbar-item\)\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";
  assert.match(items, /width:\s*28px/);
  assert.match(items, /height:\s*28px/);
  assert.match(items, /margin:\s*3px/);
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