import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACHMENT_ICON,
  BLOCK_TYPE_ICONS,
  CREPE_BUTTON_LABELS,
  CREPE_FEATURE_KEYS,
  CREPE_FEATURES,
  CREPE_TEXT_LABELS,
  IMAGE_ICON,
  INSERT_MENU,
  SLASH_GROUPS,
  TEXT_BACKGROUND_ICON,
  TEXT_COLOR_ICON,
  WHITEBOARD_ICON,
} from "./crepe-config.ts";

/**
 * La configuración de Crepe está escrita a mano, no importada del enum, para que
 * este módulo se pueda probar en Node sin arrancar un navegador.
 *
 * Ese trato tiene un precio: si Crepe renombra una feature, la clave deja de
 * existir y la feature **se apaga en silencio**. No hay error, no hay aviso, solo
 * un editor que ha perdido la mitad de lo que tenía. Estos tests son el precio
 * que lo evita: comparan las claves contra el enum de verdad.
 */

test("las claves de Crepe son las de su enum", async () => {
  // El enum viene del paquete compilado, no del código fuente del que copiamos
  // las claves: si cambia, es que el paquete cambió.
  const crepe = (await import("@milkdown/crepe")) as unknown as {
    CrepeFeature: Record<string, string>;
  };
  for (const [name, value] of Object.entries(CREPE_FEATURE_KEYS)) {
    const real = crepe.CrepeFeature[name];
    assert.ok(real, `Crepe ya no tiene la feature ${name}`);
    assert.equal(value, real, `la clave de ${name} no coincide con el enum de Crepe`);
  }
});

test("las features que se apagan son las que no queremos", () => {
  // Si esto se invierte, aparece una barra superior que se solapa con la
  // flotante, o una IA que no es el objetivo de un editor local.
  assert.equal(CREPE_FEATURES[CREPE_FEATURE_KEYS.AI], false);
  assert.equal(CREPE_FEATURES[CREPE_FEATURE_KEYS.TopBar], false);
  assert.equal(CREPE_FEATURES[CREPE_FEATURE_KEYS.BlockEdit], true);
  assert.equal(CREPE_FEATURES[CREPE_FEATURE_KEYS.ImageBlock], true);
});

test("todo botón de Crepe tiene nombre accesible en español", () => {
  // Los botones solo llevan un SVG dentro: sin nombre, un lector de pantalla lee
  // «botón» a secas. Y el `title` sale de aquí, que es lo que se ve al pasar el
  // ratón. Los valores son los de Crepe, uno por cada `*Label` de su API.
  assert.deepEqual(Object.keys(CREPE_BUTTON_LABELS).sort(), [
    "bold",
    "code",
    "italic",
    "latex",
    "link",
    "strikethrough",
  ]);
  for (const [name, label] of Object.entries(CREPE_BUTTON_LABELS)) {
    assert.ok(label.trim().length > 0, `el botón ${name} se queda sin nombre`);
    assert.ok(!looksEnglish(label), `${name} sigue en inglés: ${label}`);
  }
});

/**
 * Palabras que solo aparecen en inglés dentro de las etiquetas de Crepe.
 *
 * No se puede preguntar «¿esto es español?» porque las palabras españolas
 * también son letras: «Subir archivo» es español y contiene «archivo». Lo que sí
 * delata un resto sin traducir es una palabra que no existe en español.
 */
const ENGLISH_WORDS = [
  "bold", "italic", "strike", "upload", "confirm", "paste", "link",
  "caption", "write", "search", "language", "result", "placeholder", "error",
];

function looksEnglish(text: string): boolean {
  const words = text.toLocaleLowerCase("es").match(/[a-z]+/g) ?? [];
  return words.some((word) => ENGLISH_WORDS.includes(word));
}

test("los textos de Crepe están en español y ninguno se queda vacío", () => {
  const textos: string[] = [
    ...Object.values(CREPE_TEXT_LABELS.image),
    ...Object.values(CREPE_TEXT_LABELS.link),
    ...Object.values(CREPE_TEXT_LABELS.codeMirror),
    CREPE_TEXT_LABELS.placeholder.text,
  ];
  for (const texto of textos) {
    assert.ok(texto.trim().length > 0, "un texto de Crepe se queda vacío");
    assert.ok(!looksEnglish(texto), `queda en inglés: ${texto}`);
  }
});

test("los grupos del menú slash cubren los bloques de Markdown", () => {
  // El menú `/` es el camino para los títulos 4 a 6, que la barra flotante no
  // tiene botones. Si este grupo pierde un nivel, ese título deja de existir.
  for (const key of ["h1", "h2", "h3", "h4", "h5", "h6", "quote", "divider"] as const) {
    assert.ok(SLASH_GROUPS.text[key], `falta ${key} en el menú slash`);
    assert.ok(SLASH_GROUPS.text[key].label.trim().length > 0);
  }
  for (const key of ["bulletList", "orderedList", "taskList"] as const) {
    assert.ok(SLASH_GROUPS.list[key], `falta ${key} en el menú slash`);
  }
  for (const key of ["image", "codeBlock", "table", "math"] as const) {
    assert.ok(SLASH_GROUPS.advanced[key], `falta ${key} en el menú slash`);
  }
});

test("los iconos son SVG con la forma que espera Crepe", () => {
  // Crepe los mete con `innerHTML`, así que tienen que ser markup, no un
  // componente. Un SVG sin `viewBox` sale con el tamaño por defecto y se ve
  // enorme al lado de los demás.
  for (const icon of [WHITEBOARD_ICON, TEXT_COLOR_ICON, TEXT_BACKGROUND_ICON]) {
    assert.ok(icon.startsWith("<svg"), "el icono no es markup");
    assert.ok(icon.includes('viewBox="0 0 24 24"'), "el icono no tiene viewBox");
    assert.ok(icon.includes("</svg>"), "el SVG no está cerrado");
  }
});

test("el menú del `+` tiene todo, no solo tipos de texto", () => {
  // El menú del `+` es el sitio de todo lo que se puede poner en la nota: el
  // Markdown entero y las tres cosas de la app. Si esto pierde una entrada, esa
  // cosa solo se puede llegar por el dock o por el menú slash.
  const items = INSERT_MENU.flatMap((group) => group.items);
  const bloques = items.filter((item) => item.kind === "block");
  const otros = items.filter((item) => item.kind !== "block");

  // Los siete tipos de texto.
  assert.deepEqual(
    bloques.map((item) => item.id).sort(),
    ["bullet", "heading1", "heading2", "heading3", "ordered", "paragraph", "quote"],
  );
  // Y las tres cosas de la app.
  assert.deepEqual(otros.map((item) => item.kind).sort(), ["attachment", "image", "whiteboard"]);
});

test("cada entrada del menú del `+` tiene icono y nombre", () => {
  // Un botón sin icono se ve como un hueco, y uno sin nombre no se puede elegir.
  for (const group of INSERT_MENU) {
    assert.ok(group.group.trim().length > 0, "un grupo sin nombre no se entiende");
    for (const item of group.items) {
      assert.ok(item.icon.includes("<svg"), `${item.label} se queda sin icono`);
      assert.ok(item.label.trim().length > 0, "una entrada sin nombre no se puede elegir");
    }
  }
});

test("las entradas de bloque del menú salen del catálogo, sin duplicar el icono", () => {
  // El icono de cada tipo vive en `EDITOR_BLOCKS`. Si el menú lo copiara, un
  // cambio de dibujo se vería en un sitio y no en el otro.
  const delMenu = INSERT_MENU.flatMap((group) => group.items)
    .filter((item) => item.kind === "block")
    .map((item) => item.icon);
  assert.deepEqual(delMenu, BLOCK_TYPE_ICONS.map((item) => item.icon));
});

test("los iconos de imagen y adjunto tienen la misma forma que el resto", () => {
  // El menú los pinta con `innerHTML`: sin `viewBox` salen con el tamaño por
  // defecto y se ven enormes al lado de los demás.
  for (const icon of [IMAGE_ICON, ATTACHMENT_ICON]) {
    assert.ok(icon.includes('viewBox="0 0 24 24"'), "el icono no tiene viewBox");
  }
});
