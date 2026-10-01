import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SKIN_DRAFT } from "../data/skin.ts";
import {
  buildEditorPreviewStyle,
  buildSkinComponents,
  draftToEditor,
  editorToDraft,
  resolveFontStack,
  slugifySkinId,
} from "./creator.ts";
import { emptyEditor, setValue, valuesOf } from "./editor.ts";

test("convierte el nombre de una skin en un identificador portable", () => {
  assert.equal(slugifySkinId("Mi skin bonita"), "mi-skin-bonita");
  assert.equal(slugifySkinId("  ¡Ñandú!  "), "nandu");
  assert.equal(slugifySkinId("---"), "mi-skin");
});

test("el creador produce una paleta amplia y valores seguros", () => {
  const components = buildSkinComponents({
    ...DEFAULT_SKIN_DRAFT,
    name: "Test",
    accent: "#6750a4",
    background: "#101014",
    surface: "#181820",
    panel: "#22222c",
    text: "#f4f0ff",
    textDim: "#aaa0c0",
    border: "#4a405d",
    hover: "#30283e",
    active: "#4b3670",
    radius: 16,
    blur: 12,
    borderWidth: 2,
    shadow: "strong",
    font: "serif",
  });
  assert.ok(components.background);
  assert.equal(components.sidebar.textDim, "#aaa0c0");
  assert.equal(components.button.radius, "16px");
  assert.equal(components.note.blur, "12px");
  assert.equal(components.note.border, "2px solid #4a405d");
  assert.equal(components.background.accent, "#6750a4");
  assert.equal(components.toolbar.font.includes(";"), false);
  assert.match(buildEditorPreviewStyle(draftToEditor(DEFAULT_SKIN_DRAFT)), /--skin-note-background:/);
});

test("el creador cae en valores seguros si recibe colores inválidos", () => {
  const components = buildSkinComponents({
    ...DEFAULT_SKIN_DRAFT,
    accent: "red; color: blue",
    background: "url(https://example.invalid)",
  });
  assert.equal(components.background.accent, DEFAULT_SKIN_DRAFT.accent);
  assert.equal(components.background.background, DEFAULT_SKIN_DRAFT.background);
});

test("entiende la tipografía como pila nueva y como identificador antiguo", () => {
  // Pila nueva: se respeta tal cual.
  assert.equal(resolveFontStack('Georgia, "Noto Serif", serif'), 'Georgia, "Noto Serif", serif');
  assert.equal(buildSkinComponents({ ...DEFAULT_SKIN_DRAFT, font: "Verdana" }).button.font, "Verdana");

  // Identificadores cortos de los temas antiguos: siguen funcionando.
  assert.equal(resolveFontStack("mono"), "ui-monospace, SFMono-Regular, Menlo, monospace");
  assert.equal(resolveFontStack("serif"), 'Georgia, "Noto Serif", serif');
  assert.equal(buildSkinComponents({ ...DEFAULT_SKIN_DRAFT, font: "serif" }).toolbar.font, 'Georgia, "Noto Serif", serif');

  // Cualquier cosa que pueda romper CSS cae en la de sistema.
  assert.equal(resolveFontStack("serif; color: red"), "system-ui, sans-serif");
  assert.equal(resolveFontStack(""), "system-ui, sans-serif");
  assert.equal(resolveFontStack("url(https://example.invalid)"), "system-ui, sans-serif");
});

test("el draft y el editor son la misma cosa vista de dos maneras", () => {
  // El panel con deslizadores y la edición a mano no son dos almacenes: uno
  // escribe el otro. Si dejaran de ser lo mismo, el que usa el deslizador
  // perdería siempre contra el que edita el archivo, y siempre con la culpa en
  // el panel, que es el que nadie mira.
  const editor = draftToEditor({
    ...DEFAULT_SKIN_DRAFT,
    name: "Redondo",
    background: "#101014",
    surface: "#181820",
    panel: "#22222c",
    text: "#f4f0ff",
    accent: "#6750a4",
    radius: 18,
    blur: 6,
    borderWidth: 2,
  });

  assert.equal(editor.name, "Redondo");
  assert.equal(valuesOf(editor, "note").radius, "18px");
  assert.equal(valuesOf(editor, "note").background, "#181820");
  assert.equal(valuesOf(editor, "sidebar").itemActive, DEFAULT_SKIN_DRAFT.active);

  const vuelta = editorToDraft(editor);
  assert.equal(vuelta.background, "#101014");
  assert.equal(vuelta.surface, "#181820");
  assert.equal(vuelta.text, "#f4f0ff");
  assert.equal(vuelta.accent, "#6750a4");
  assert.equal(vuelta.radius, 18);
  assert.equal(vuelta.blur, 6);
  assert.equal(vuelta.borderWidth, 2);
});

test("ida y vuelta de un tema completo: se conserva y se puede volver a leer", () => {
  const original = {
    ...DEFAULT_SKIN_DRAFT,
    name: "Cristal",
    background: "#dbeafecc",
    surface: "#ffffffaa",
    panel: "#eff6ffb3",
    text: "#172554",
    textDim: "#64748b",
    border: "#ffffff99",
    accent: "#2563eb",
    hover: "#ffffff66",
    active: "#bfdbfe99",
    radius: 24,
    blur: 20,
    shadow: "strong" as const,
  };

  const editor = draftToEditor(original);
  const vuelta = editorToDraft(editor);
  for (const clave of [
    "background",
    "surface",
    "panel",
    "text",
    "textDim",
    "border",
    "accent",
    "hover",
    "active",
    "radius",
    "blur",
  ] as const) {
    assert.equal(vuelta[clave], original[clave], `«${clave}» no vuelve igual`);
  }
});

test("un valor escrito a mano llega al archivo y no lo pisa el panel", () => {
  let editor = emptyEditor("A mano");
  editor = setValue(editor, "button", "background", "url(assets/fondo.svg)");
  editor = setValue(editor, "button", "text", "#ff00ff");
  editor = setValue(editor, "note", "text", "#00ff00");

  // Es exactamente el formato del disco, para que editar aquí y editar con el
  // Bloc de notas al lado sean la misma operación. El orden es el en que se
  // escribieron las claves, que es lo que hace fácil comparar el campo con su
  // línea en el archivo.
  assert.equal(editor.files.button, 'background="url(assets/fondo.svg)"\ntext="#ff00ff"');
  assert.equal(editor.files.note, 'text="#00ff00"');

  // Y un `url()` no se toca al escribir: es una referencia a un archivo de la
  // skin, no un dato incrustado.
  assert.equal(valuesOf(editor, "button").background, "url(assets/fondo.svg)");
});

test("borrar el valor borra la línea, y no deja un hueco vacío", () => {
  let editor = emptyEditor();
  editor = setValue(editor, "note", "text", "#fff");
  editor = setValue(editor, "note", "radius", "4px");
  assert.equal(editor.files.note, 'text="#fff"\nradius="4px"');

  // Un `text=""` se escribiría en el archivo y no significaría nada: es ruido
  // que luego hay que adivinar si es un valor borrado o un error.
  editor = setValue(editor, "note", "text", "");
  assert.equal(editor.files.note, 'radius="4px"');
});

test("el nombre del tema es lo único que se guarda fuera de los archivos", () => {
  // El nombre va en `skin.txt`, y en el editor está en `name`. Si además se
  // colara en un archivo de componente, aparecería una clave que nadie sabe
  // qué hacer.
  const editor = draftToEditor({ ...DEFAULT_SKIN_DRAFT, name: "Papel" });
  assert.equal(editor.name, "Papel");
  for (const component of ["background", "button", "note", "sidebar", "input", "toolbar"] as const) {
    assert.equal(editor.files[component].includes("name="), false, component);
  }
});
