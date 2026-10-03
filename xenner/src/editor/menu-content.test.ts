import assert from "node:assert/strict";
import test from "node:test";

import type { EditorBlockType } from "../types/editor.ts";
import { crearEditorDePrueba } from "./editor-harness.ts";
import {
  EDITOR_BLOCKS,
  EDITOR_BLOCK_TYPES,
  EDITOR_BUTTON_LABELS,
  EDITOR_COLOR_ICONS,
  EDITOR_ICONS,
  INSERT_MENU,
  normalizeLinkHref,
  SLASH_MENU,
  STYLE_BLOCKS,
  stylesInSelection,
  TABLE_ACTION_GROUPS,
  type MenuActionKind,
  type MenuItem,
  type StyleBlockId,
  type TableActionKind,
} from "./menu-content.ts";

/**
 * Los menús son datos: aquí se comprueba que están completos y que se pueden
 * pintar.
 *
 * Es el sitio donde se pierde lo que se le enseña a quien escribe. Una entrada
 * sin icono se ve como un hueco, un rótulo vacío o en inglés es un botón que no
 * se puede elegir, y un `kind` que el componente no contempla es un botón que no
 * hace nada —y eso no se ve hasta que alguien lo pulsa.
 */

/** Todos los `kind` que el componente tiene que saber repartir. */
const KINDS: readonly MenuActionKind[] = [
  "block",
  "image",
  "whiteboard",
  "attachment",
  "codeBlock",
  "table",
  "math",
  "divider",
  "taskList",
];

/**
 * Palabras que solo aparecen en inglés dentro de las etiquetas.
 *
 * No se puede preguntar «¿esto es español?» porque las palabras españolas
 * también son letras: «Subir archivo» es español y contiene «archivo». Lo que sí
 * delata un resto sin traducir es una palabra que no existe en español.
 */
const ENGLISH_WORDS = [
  "heading",
  "paragraph",
  "bullet",
  "ordered",
  "quote",
  "image",
  "table",
  "code",
  "math",
  "divider",
  "task",
  "attach",
  "whiteboard",
  "text",
  "background",
  "link",
  "bold",
  "italic",
  "strike",
];

function looksEnglish(text: string): boolean {
  const words = text.toLocaleLowerCase("es").match(/[a-z]+/g) ?? [];
  return words.some((word) => ENGLISH_WORDS.includes(word));
}

function itemsOf(menu: readonly { items: readonly MenuItem[] }[]): MenuItem[] {
  return menu.flatMap((group) => group.items);
}

test("el menú del `+` tiene los siete tipos y las tres cosas de la app", () => {
  // El `+` es el sitio de todo lo que se puede poner en la nota: el Markdown
  // entero y las tres cosas que no son Markdown. Si pierde una entrada, esa
  // cosa solo se puede llegar por el dock.
  const items = itemsOf(INSERT_MENU);
  const bloques = items.filter((item) => item.kind === "block");
  const otros = items.filter((item) => item.kind !== "block");
  assert.deepEqual(
    bloques.map((item) => item.id).sort(),
    ["bullet", "heading1", "heading2", "heading3", "ordered", "paragraph", "quote"] as string[],
  );
  assert.deepEqual(
    otros.map((item) => item.kind).sort(),
    ["attachment", "image", "whiteboard"],
  );
});

test("el menú del `+` sale del catálogo de tipos, sin copiar iconos", () => {
  // El icono de cada tipo vive en `EDITOR_BLOCKS`. Si el menú lo copiara, un
  // cambio de dibujo se vería en un sitio y no en el otro.
  const delMenu = itemsOf(INSERT_MENU)
    .filter((item) => item.kind === "block")
    .map((item) => item.icon);
  assert.deepEqual(delMenu, EDITOR_BLOCKS.map((item) => item.icon));
});

test("el menú `/` cubre los seis títulos y las tres listas", () => {
  // El menú `/` es el camino para los títulos de 4 a 6, que la barra flotante no
  // tiene. Si este grupo pierde un nivel, ese título deja de existir.
  const items = itemsOf(SLASH_MENU);
  for (const level of [1, 2, 3, 4, 5, 6]) {
    assert.ok(
      items.some((item) => item.id === `heading${level}` && item.label === `Título ${level}`),
      `falta el Título ${level}`,
    );
  }
  for (const [id, label] of [
    ["paragraph", "Texto"],
    ["quote", "Cita"],
  ] as const) {
    assert.ok(
      items.some((item) => item.id === id && item.label === label),
      `falta ${label}`,
    );
  }
  assert.deepEqual(
    items.filter((item) => item.kind === "block").map((item) => item.id),
    ["paragraph", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6", "quote", "bullet", "ordered"],
  );
  assert.ok(items.some((item) => item.kind === "taskList" && item.label === "Tareas"));
  for (const kind of ["divider", "codeBlock", "table", "math", "image", "whiteboard"] as const) {
    assert.ok(items.some((item) => item.kind === kind), `falta ${kind} en el menú slash`);
  }
});

test("cada entrada dice a qué comando llamar, sin funciones dentro", () => {
  // El menú es dato puro: el componente decide a qué comando llama cada `kind`.
  // Una función aquí sería estado en un sitio que tiene que poder probarse en
  // Node, que es justo lo que no se puede.
  for (const item of [...itemsOf(INSERT_MENU), ...itemsOf(SLASH_MENU)]) {
    assert.ok(KINDS.includes(item.kind), `${item.label}: kind desconocido «${item.kind}»`);
    assert.equal(
      Object.values(item).some((value) => typeof value === "function"),
      false,
      `${item.label}: el menú lleva una función dentro`,
    );
    if (item.kind === "block") {
      assert.ok(item.id, `${item.label}: un bloque sin id no sabe a qué tipo volver`);
      assert.ok(
        typeof item.id === "string" && item.id.length > 0,
        `${item.label}: el id del bloque está vacío`,
      );
    }
  }
  // Los siete tipos del menú `+` son `EditorBlockType` de verdad: son los que
  // `setBlockType` acepta, y un id que no existe sería un botón que no cambia
  // nada.
  for (const item of itemsOf(INSERT_MENU).filter((entry) => entry.kind === "block")) {
    assert.ok(
      EDITOR_BLOCK_TYPES.includes(item.id as EditorBlockType),
      `${item.label}: «${item.id}» no es un tipo de bloque del editor`,
    );
  }
});

test("todos los rótulos están en español y ninguno se queda vacío", () => {
  const rotulos = [
    ...itemsOf(INSERT_MENU).map((item) => item.label),
    ...itemsOf(SLASH_MENU).map((item) => item.label),
    ...INSERT_MENU.map((group) => group.group),
    ...SLASH_MENU.map((group) => group.group),
    ...STYLE_BLOCKS.map((item) => item.label),
    ...TABLE_ACTION_GROUPS.map((group) => group.group),
    ...TABLE_ACTION_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
    ...Object.values(EDITOR_BUTTON_LABELS),
  ];
  for (const rotulo of rotulos) {
    assert.ok(rotulo.trim().length > 0, "un rótulo se queda vacío");
    assert.ok(!looksEnglish(rotulo), `queda en inglés: ${rotulo}`);
  }
  assert.equal(EDITOR_BUTTON_LABELS.bold, "Negrita");
  assert.equal(EDITOR_BUTTON_LABELS.underline, "Subrayado");
  assert.equal(EDITOR_BUTTON_LABELS.textBackground, "Fondo del texto");
});

test("ningún rótulo enseña sintaxis de Markdown", () => {
  // El editor es de los que se escriben sin ver el Markdown. Un rótulo como «---»
  // o «Título (#)» enseña al que escribe que por dentro hay algo que tiene que
  // aprender, y eso es justo lo que hay que quitar.
  const rotulos = [
    ...itemsOf(INSERT_MENU).map((item) => item.label),
    ...itemsOf(SLASH_MENU).map((item) => item.label),
    ...INSERT_MENU.map((group) => group.group),
    ...SLASH_MENU.map((group) => group.group),
    ...STYLE_BLOCKS.map((item) => item.label),
    ...TABLE_ACTION_GROUPS.map((group) => group.group),
    ...TABLE_ACTION_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
    ...Object.values(EDITOR_BUTTON_LABELS),
  ];
  for (const rotulo of rotulos) {
    assert.ok(!/markdown/i.test(rotulo), `habla de Markdown: ${rotulo}`);
    assert.ok(!/[#*|[\]()~`]/.test(rotulo), `tiene sintaxis: ${rotulo}`);
    assert.ok(!rotulo.includes("-"), `usa el guion del Markdown: ${rotulo}`);
    assert.ok(!rotulo.includes("---"), `es una regla de Markdown: ${rotulo}`);
  }
  // Las palabras del rótulo, que es donde se colaría la sintaxis de verdad.
  assert.equal(
    STYLE_BLOCKS.find((item) => item.id === "divider")?.label,
    "Separador",
    "el separador se llama Separador",
  );
  assert.equal(
    SLASH_MENU.flatMap((group) => group.items).find((item) => item.kind === "taskList")?.label,
    "Tareas",
    "las casillas de tarea se llaman Tareas",
  );
});

test("todos los iconos son SVG con `viewBox` y cerrados", () => {
  // Los menús los pintan con `innerHTML`, así que tienen que ser markup. Un SVG
  // sin `viewBox` sale con el tamaño por defecto y se ve enorme al lado de los
  // demás, que es lo que pasaba con los iconos que no lo traían.
  const iconos = [
    ...EDITOR_BLOCKS.map((item) => item.icon),
    ...STYLE_BLOCKS.map((item) => item.icon),
    ...TABLE_ACTION_GROUPS.flatMap((group) => group.items.map((item) => item.icon)),
    ...itemsOf(INSERT_MENU).map((item) => item.icon),
    ...itemsOf(SLASH_MENU).map((item) => item.icon),
    ...Object.values(EDITOR_ICONS),
    ...Object.values(EDITOR_COLOR_ICONS),
  ];
  for (const icono of iconos) {
    assert.ok(icono.startsWith("<svg"), "un icono no es markup");
    assert.ok(icono.endsWith("</svg>"), "un SVG no está cerrado");
    assert.match(icono, /viewBox="0 0 24 24"/, "un icono no tiene viewBox");
    assert.match(icono, /<(path|rect|circle)\b/, "un icono está vacío");
  }
  // Los títulos del 4 al 6 llevan su número dibujado, y el número tiene que ser el
  // del rótulo: un «Título 5» con un 4 dentro no es una errata, es un botón que
  // pone el título que no es.
  for (const nivel of [4, 5, 6] as const) {
    const icono = STYLE_BLOCKS.find((item) => item.id === `heading${nivel}`)?.icon ?? "";
    assert.match(icono, new RegExp(`>${nivel}</text>`), `el Título ${nivel} no lleva su número`);
  }
});

test("el catálogo de tipos y el menú `+` no tienen dos copias del mismo dibujo", () => {
  // Cada icono de bloque vive en un catálogo —`EDITOR_BLOCKS` para los siete
  // tipos, `STYLE_BLOCKS` para los estilos de la barra— y los menús lo toman de
  // ahí. Un icono repetido en dos sitios es un dibujo que se queda viejo en uno de
  // los dos sin que nadie se entere.
  const delCatalogo = new Set([
    ...EDITOR_BLOCKS.map((item) => item.icon),
    ...STYLE_BLOCKS.map((item) => item.icon),
  ]);
  for (const item of [...itemsOf(INSERT_MENU), ...itemsOf(SLASH_MENU)]) {
    if (item.kind === "block") {
      assert.ok(delCatalogo.has(item.icon), `${item.label}: icono fuera del catálogo`);
    }
  }
  // Y el icono de cada estilo es el del catálogo, no una copia: cambiar el dibujo
  // del «Título 2» lo tiene que cambiar en la barra, en el `+` y en la `/`.
  for (const estilo of STYLE_BLOCKS) {
    const enLaBarra = STYLE_BLOCKS.filter((item) => item.icon === estilo.icon);
    assert.ok(enLaBarra.length <= 1, `${estilo.label}: dos estilos con el mismo dibujo`);
  }
});

// ---------------------------------------------------------------------------
// La barra de formato: los estilos de bloque
// ---------------------------------------------------------------------------

test("la barra ofrece los seis títulos, los tres bloques y el separador", () => {
  // Los estilos de la barra son la forma de cambiar el bloque **sin** escribir
  // nada de Markdown. Si aquí falta un título, ese título solo se puede poner con
  // el menú `/`, que es escribir `/` y acertar con la palabra exacta.
  assert.deepEqual(
    STYLE_BLOCKS.map((item) => item.id),
    [
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "heading4",
      "heading5",
      "heading6",
      "quote",
      "bullet",
      "ordered",
      "divider",
    ] as StyleBlockId[],
  );
  // Los seis títulos tienen que estar juntos y en orden: es como se leen, y quien
  // está escribiendo una nota elige el nivel de un vistazo.
  const titulos = STYLE_BLOCKS.filter((item) => /^heading[1-6]$/.test(item.id));
  assert.equal(titulos.length, 6, "faltan niveles de título");
  // Y cada uno con su rótulo: un botón que pone «Título» a secas seis veces no dice
  // en qué nivel va a acabar la línea.
  for (const nivel of [1, 2, 3, 4, 5, 6]) {
    assert.equal(
      STYLE_BLOCKS.find((item) => item.id === `heading${nivel}`)?.label,
      `Título ${nivel}`,
    );
  }
  // Los siete primeros son los tipos del motor: son los que `setBlockType` pone.
  for (const tipo of EDITOR_BLOCK_TYPES) {
    assert.ok(
      STYLE_BLOCKS.some((item) => item.id === tipo),
      `la barra no puede poner ${tipo}`,
    );
  }
});

test("el estilo del cursor es el que hay, con el nivel exacto del título", () => {
  // Esto es el botón que enseña en qué estilo está el cursor, y es lo que hace que
  // nadie necesite saber qué es Markdown. El nivel del título tiene que leerse del
  // atributo y no de una cuenta: un `####` marcado como «Título 3» es una mentira.
  const editor = crearEditorDePrueba([
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "cuatro" }] },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "tres" }] },
    { type: "paragraph", content: [{ type: "text", text: "abajo" }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "cita" }] }] },
  ]);

  editor.cursorEn("cuatro");
  assert.deepEqual([...estilosDelCursor(editor)], ["heading4"]);
  editor.cursorEn("tres");
  assert.deepEqual([...estilosDelCursor(editor)], ["heading3"]);
  editor.cursorEn("abajo");
  assert.deepEqual([...estilosDelCursor(editor)], ["paragraph"]);
  editor.cursorEn("cita");
  assert.deepEqual([...estilosDelCursor(editor)], ["quote"]);
});

test("con más de un estilo en la selección no se marca ninguno", () => {
  // Un texto y un título debajo no son «un título»: si se marcara uno, el botón
  // mentía, y aplicaría el estilo solo al primero. Es lo mismo que hace Word con
  // su galería de estilos.
  const editor = crearEditorDePrueba([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "uno" }] },
    { type: "paragraph", content: [{ type: "text", text: "dos" }] },
  ]);
  editor.seleccionarTodo();
  const estilos = estilosDelCursor(editor);
  assert.equal(estilos.size, 2, "una selección con dos estilos tiene que dar dos");
  for (const estilo of estilos) {
    assert.ok(STYLE_BLOCKS.some((item) => item.id === estilo), `${estilo}: no está en la barra`);
  }
});

// ---------------------------------------------------------------------------
// La barrita de la tabla
// ---------------------------------------------------------------------------

test("la tabla se puede hacer grande, pequeña y dejarla como estaba", () => {
  // Sin esto, insertar una tabla es un callejón sin salida para quien no sabe
  // Markdown: se podía crear de 3×3 y no había manera de tocarla. Los once botones
  // son los que hacen falta para eso, ni uno más.
  const botones = TABLE_ACTION_GROUPS.flatMap((group) => group.items);
  assert.deepEqual(
    [...new Set(botones.map((item) => item.kind))].sort(),
    [
      "alignCenter",
      "alignLeft",
      "alignRight",
      "columnLeft",
      "columnRight",
      "deleteColumn",
      "deleteRow",
      "deleteTable",
      "headerRow",
      "rowAbove",
      "rowBelow",
    ] as TableActionKind[],
  );
  // Los tres de alinear llevan el valor de `text-align` delante, y cada uno el
  // suyo: es lo que los distingue del resto de los botones.
  const alineaciones = botones
    .filter((item) => item.align !== undefined)
    .map((item) => item.align)
    .sort();
  assert.deepEqual(alineaciones, ["center", "left", "right"]);
  // Y los grupos existen para poder separar con una raya: once botones en hilada no
  // se leen, y el nombre del grupo es lo que lee un lector de pantalla.
  assert.ok(TABLE_ACTION_GROUPS.length >= 2);
  for (const grupo of TABLE_ACTION_GROUPS) {
    assert.ok(grupo.group.trim().length > 0, "un grupo sin nombre no se puede leer");
    assert.ok(grupo.items.length > 0, `el grupo ${grupo.group} está vacío`);
  }
});

test("el enlace se guarda con el protocolo que le falta", () => {
  // `ejemplo.com` a secas se guarda como `[texto](ejemplo.com)`, y Markdown lee eso
  // como una ruta **de la nota**: el enlace apuntaría a un fichero que no existe.
  // Es el mismo fallo que se ve al abrir la nota en otro programa.
  assert.equal(normalizeLinkHref("ejemplo.com"), "https://ejemplo.com");
  assert.equal(normalizeLinkHref("  ejemplo.com/ruta  "), "https://ejemplo.com/ruta");
  // Con protocolo, se respeta: hay enlaces que no son `https` de verdad.
  assert.equal(normalizeLinkHref("http://ejemplo.com"), "http://ejemplo.com");
  assert.equal(normalizeLinkHref("mailto:quien@ejemplo.com"), "mailto:quien@ejemplo.com");
  assert.equal(normalizeLinkHref("#ancla"), "#ancla");
  // Vacío es «quitar el enlace», no «enlazar a la página en blanco».
  assert.equal(normalizeLinkHref("   "), "");
});

/** Los estilos que la barra marcaría con el cursor donde está en el editor. */
function estilosDelCursor(editor: ReturnType<typeof crearEditorDePrueba>): Set<StyleBlockId> {
  const { doc, selection } = editor.estado();
  return stylesInSelection(doc, selection.from, selection.to);
}