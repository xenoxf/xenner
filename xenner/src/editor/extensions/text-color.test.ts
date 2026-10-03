import assert from "node:assert/strict";
import test from "node:test";

import { getSchema } from "@tiptap/core";

import { createEditorExtensions } from "./index.ts";
import { createNoteMarkdownManager } from "../markdown/manager.ts";
import {
  DEFAULT_TEXT_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  normalizeTextColor,
} from "./text-color.ts";

const manager = createNoteMarkdownManager();

test("normaliza colores de texto seguros", () => {
  assert.equal(normalizeTextColor("#ABC"), "#aabbcc");
  assert.equal(normalizeTextColor("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeTextColor("#a1b2c3dd"), "#a1b2c3dd");
  assert.equal(normalizeTextColor("  #A1B2C3  "), "#a1b2c3");
  assert.equal(normalizeTextColor("red; color: blue"), null);
  assert.equal(normalizeTextColor(""), null);
  assert.equal(normalizeTextColor(null), null);
});

test("los colores por defecto son los de la barra flotante", () => {
  assert.equal(DEFAULT_TEXT_COLOR, "#2563eb");
  assert.equal(DEFAULT_TEXT_BACKGROUND, "#fef3c7");
  assert.equal(normalizeTextColor(DEFAULT_TEXT_COLOR), DEFAULT_TEXT_COLOR);
  assert.equal(normalizeTextColor(DEFAULT_TEXT_BACKGROUND), DEFAULT_TEXT_BACKGROUND);
});

test("la marca se llama textColor y declara color y fondo", () => {
  // `getSchema` ya aplana y resuelve las extensiones: llamar antes a
  // `resolveExtensions` duplicaría `StarterKit` y avisaría por consola.
  const schema = getSchema(createEditorExtensions({ placeholder: "" }));
  const marca = schema.marks.textColor;
  assert.ok(marca, "el esquema no tiene la marca textColor");
  assert.deepEqual(Object.keys(marca.spec.attrs ?? {}).sort(), ["background", "color"]);
  assert.deepEqual(marca.spec.attrs?.color?.default, "");
  assert.deepEqual(marca.spec.attrs?.background?.default, "");
});

test("un span con data-xenner-color entra como marca y sale otra vez", () => {
  const entrada = '<span data-xenner-color="#FF0000" style="color:#ff0000">rojo</span>';
  const doc = manager.parse(entrada);
  assert.deepEqual(doc, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "rojo",
            marks: [{ type: "textColor", attrs: { color: "#ff0000", background: "" } }],
          },
        ],
      },
    ],
  });
  // Sale con el color en minúsculas: es como lo normaliza la marca.
  assert.equal(manager.serialize(doc), entrada.toLowerCase());
});

test("el fondo sale con su style de respaldo", () => {
  const entrada = '<span data-xenner-background="#FDE68A">un **resaltado**</span>';
  const salida = manager.serialize(manager.parse(entrada));
  assert.equal(
    salida,
    '<span data-xenner-background="#fde68a" style="background-color:#fde68a">un **resaltado**</span>',
  );
});

test("color y fondo a la vez", () => {
  const entrada =
    '<span data-xenner-color="#00FF00" data-xenner-background="#0000FF" style="color:#00ff00;background-color:#0000ff">los dos</span>';
  assert.equal(manager.serialize(manager.parse(entrada)), entrada.toLowerCase());
});

test("lo de dentro del span sigue siendo Markdown", () => {
  const entrada =
    'antes <span data-xenner-color="#123456">con [enlace](https://x.dev) y *cursiva*</span> despues';
  // El `style` siempre se escribe, aunque el Markdown de entrada no lo trajera:
  // es lo que hace que el color se vea en un visor que no es Xenner.
  assert.equal(
    manager.serialize(manager.parse(entrada)),
    'antes <span data-xenner-color="#123456" style="color:#123456">con [enlace](https://x.dev) y *cursiva*</span> despues',
  );
});

test("un span escrito con solo style también pinta, y en minúsculas", () => {
  const entrada = '<span style="color:#AABBCC">x</span>';
  assert.equal(
    manager.serialize(manager.parse(entrada)),
    '<span data-xenner-color="#aabbcc" style="color:#aabbcc">x</span>',
  );
});

test("los spans anidados se leen hasta el cierre que toca", () => {
  // Un color metido dentro de otro no lo escribe este editor —una marca sustituye
  // a la otra—, pero puede venir en una nota vieja o escrita a mano. Lo que no
  // puede pasar es que el cierre que sobra salga como texto.
  const entrada =
    '<span data-xenner-color="#FF0000">rojo <span data-xenner-background="#00FF00">y verde</span> rojo otra vez</span>';
  const doc = manager.parse(entrada);
  const trozos = (doc.content?.[0]?.content ?? []).map((nodo) => nodo.text);
  assert.deepEqual(trozos, ["rojo ", "y verde", " rojo otra vez"]);
  const fondos = (doc.content?.[0]?.content ?? []).flatMap((nodo) =>
    (nodo.marks ?? []).map((marca) => marca.attrs?.background),
  );
  assert.ok(fondos.includes("#00ff00"), "el span de dentro también se lee");
  const salida = manager.serialize(doc);
  assert.ok(!salida.includes("&lt;/span&gt;"), "no debe quedar un cierre suelto: " + salida);
});

test("un span sin color hexadecimal no se marca", () => {
  const salida = manager.serialize(manager.parse('<span style="color:red">rojo</span>'));
  assert.ok(!salida.includes("textColor"));
  assert.ok(!salida.includes("data-xenner-color"));
  // Y tampoco se pierde el texto.
  assert.match(salida, /rojo/);
});

test("una marca sin color ni fondo no inventa un span", () => {
  const doc = manager.parse("plano");
  const conMarca = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "plano",
            marks: [{ type: "textColor", attrs: { color: "", background: "" } }],
          },
        ],
      },
    ],
  };
  assert.equal(manager.serialize(doc), manager.serialize(conMarca));
});

test("un «>» dentro de un atributo entre comillas no parte el texto", () => {
  // `title="a>b"` es HTML legal. Si el span se cerrara en el primer `>`, lo de
  // detrás se colaba dentro del color y el cierre sobrante salía como texto
  // suelto: la nota perdía `b">x` y ganaba `x` con la marca puesta.
  const entrada = '<span data-xenner-color="#ff0000" title="a>b">x</span>';
  const doc = manager.parse(entrada);
  assert.deepEqual(doc.content?.[0]?.content?.[0]?.text, "x");
  assert.equal(
    manager.serialize(doc),
    '<span data-xenner-color="#ff0000" style="color:#ff0000">x</span>',
  );
});

test("un atributo con la comilla sin cerrar no es un span de color", () => {
  // Al revés que el caso anterior: sin comilla que cierre no se puede saber
  // dónde acaba la etiqueta, así que lo honesto es dejarlo como texto.
  const salida = manager.serialize(manager.parse('<span data-xenner-color="#f00" title="a>x'));
  assert.equal(salida, '&lt;span data-xenner-color="#f00" title="a&gt;x');
});

test("nada que no sea un color hexadecimal llega al style", () => {
  /**
   * El allowlist es lo que separa «una nota» de «una nota con una etiqueta
   * dentro». Todo lo que no sea `#rgb`/`#rrggbb`/`#rrggbbaa` se queda fuera, y lo
   * que se escribe se **reconstruye** desde cero: nunca se copia el `style` que
   * venía en la nota, así que lo que no se reconoce no tiene dónde colarse.
   */
  const ataques = [
    '<span data-xenner-color="red; background:url(javascript:alert(1))">x</span>',
    '<span style="color:red">rojo</span>',
    '<span data-xenner-color="#fff}" onclick="alert(1)">x</span>',
    '<span data-xenner-background="javascript:alert(1)">x</span>',
  ];
  for (const ataque of ataques) {
    const salida = manager.serialize(manager.parse(ataque));
    assert.deepEqual(
      salida.match(/<span[^>]*>/g) ?? [],
      [],
      `no debe quedar ningún span vivo en ${JSON.stringify(ataque)}: ${salida}`,
    );
    assert.match(salida, /x|rojo/, "el texto no puede desaparecer");
  }
});

test("un style con una carga escondida se queda solo con el color", () => {
  // Aquí sí hay un color legítimo, así que el span se reconoce… pero el `style`
  // se vuelve a escribir desde cero, y la carga se queda en el camino.
  const entrada = '<span style="color:#ff0000; background:url(javascript:alert(1))">x</span>';
  assert.deepEqual(manager.serialize(manager.parse(entrada)).match(/<span[^>]*>/g), [
    '<span data-xenner-color="#ff0000" style="color:#ff0000">',
  ]);
});