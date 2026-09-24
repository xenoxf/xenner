import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTextColor, textColorToMarkdown, transformTextColorAst } from "./text-color.ts";

test("normaliza colores de texto seguros", () => {
  assert.equal(normalizeTextColor("#ABC"), "#aabbcc");
  assert.equal(normalizeTextColor("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeTextColor("red; color: blue"), null);
  assert.equal(normalizeTextColor(null), null);
});

test("convierte spans de color y conserva formato interno", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Antes " },
          { type: "html", value: '<span data-xenner-color="#FF0000" style="color:#ff0000">' },
          { type: "text", value: "rojo " },
          { type: "strong", children: [{ type: "text", value: "negrita" }] },
          { type: "html", value: "</span>" },
          { type: "text", value: " después" },
        ],
      },
    ],
  };

  transformTextColorAst(tree);

  const paragraph = tree.children[0];
  assert.equal(paragraph?.type, "paragraph");
  if (paragraph?.type !== "paragraph") return;
  const marked = paragraph.children[1];
  assert.equal(marked?.type, "textColor");
  if (!marked || marked.type !== "textColor") return;
  assert.equal(marked.data?.color, "#ff0000");
  assert.equal(marked.children[1]?.type, "strong");
});

test("convierte fondo y color de un span", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "html", value: '<span data-xenner-background="#FDE68A">' },
          { type: "text", value: "resaltado" },
          { type: "html", value: "</span>" },
        ],
      },
    ],
  };

  transformTextColorAst(tree);

  const paragraph = tree.children[0];
  if (paragraph?.type !== "paragraph") throw new Error("No se encontró el párrafo");
  const marked = paragraph.children[0];
  if (marked?.type !== "textColor") throw new Error("No se encontró el estilo");
  assert.equal(marked.data?.background, "#fde68a");
});

test("serializa el color como HTML inline seguro", () => {
  const output = textColorToMarkdown.handlers.textColor(
    {
      type: "textColor",
      data: { color: "#ff0000" },
      children: [],
    },
    null,
    { containerPhrasing: () => "rojo **negrita**" },
    null,
  );

  assert.equal(
    output,
    '<span data-xenner-color="#ff0000" style="color:#ff0000">rojo **negrita**</span>',
  );
});

test("serializa el fondo como HTML inline seguro", () => {
  const output = textColorToMarkdown.handlers.textColor(
    {
      type: "textColor",
      data: { background: "#FDE68A" },
      children: [],
    },
    null,
    { containerPhrasing: () => "resaltado" },
    null,
  );

  assert.equal(
    output,
    '<span data-xenner-background="#fde68a" style="background-color:#fde68a">resaltado</span>',
  );
});

test("no convierte spans sin un color hexadecimal seguro", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "html", value: '<span style="color:red">rojo</span>' },
        ],
      },
    ],
  };

  transformTextColorAst(tree);

  const paragraph = tree.children[0];
  assert.equal(paragraph?.type, "paragraph");
  if (paragraph?.type !== "paragraph") return;
  assert.equal(paragraph.children[0]?.type, "html");
});
