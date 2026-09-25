import assert from "node:assert/strict";
import test from "node:test";

import { isNote, sanitizeNotes } from "./model.ts";

const validNote = {
  id: "note-1",
  title: "Una nota",
  body: "Contenido",
  updatedAt: 1_700_000_000_000,
};

test("acepta una nota completa y Finita", () => {
  assert.equal(isNote(validNote), true);
});

test("rechaza ids vacíos, fechas inválidas y campos excesivos", () => {
  assert.equal(isNote({ ...validNote, id: "" }), false);
  assert.equal(isNote({ ...validNote, id: " padded " }), false);
  assert.equal(isNote({ ...validNote, updatedAt: Number.NaN }), false);
  assert.equal(isNote({ ...validNote, updatedAt: 1.5 }), false);
  assert.equal(isNote({ ...validNote, title: 42 }), false);
});

test("elimina ids duplicados sin perder notas válidas", () => {
  const result = sanitizeNotes([validNote, { ...validNote }, { ...validNote, id: "note-2" }]);
  assert.deepEqual(result.notes.map((note) => note.id), ["note-1", "note-2"]);
  assert.equal(result.rejected, 1);
});

test("un valor no-array se rechaza como datos inválidos", () => {
  assert.deepEqual(sanitizeNotes({ notes: [] }), { notes: [], rejected: 1 });
});
