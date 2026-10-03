import assert from "node:assert/strict";
import test from "node:test";

import { createNoteMarkdownManager } from "./markdown/manager.ts";
import {
  IMAGE_ALIGNS,
  isImageAlign,
  readImageGeometry,
  writeImageGeometry,
} from "./extensions/note-image.ts";

/**
 * El tamaño y la alineación de una imagen dentro de Markdown.
 *
 * Markdown **no tiene** forma de expresarlos, así que Xenner los esconde en el
 * "título" de la imagen con un prefijo `@`. Estos tests vigilan tres cosas:
 *
 * - que se lean y se escriban **sin ambigüedad**: un pie que acabe en un número o
 *   en una palabra que parece una alineación tiene que seguir siendo un pie;
 * - que la ida y vuelta por el gestor de Markdown **no lose nada**, porque el
 *   título es el mismo campo que el tooltip;
 * - que un título escrito por otra persona se conserve tal cual, porque es su
 *   nota, no nuestra.
 */

test("la geometría se separa del tooltip sin comerse el texto", () => {
  assert.deepEqual(readImageGeometry("Pie @600 @center"), {
    title: "Pie",
    width: 600,
    align: "center",
  });
  assert.deepEqual(readImageGeometry("@400"), { title: "", width: 400, align: "left" });
  assert.deepEqual(readImageGeometry("@right"), { title: "", width: null, align: "right" });
});

test("un texto que se parece a la geometría se queda como texto", () => {
  // Un pie con un año al final no es un ancho. Sin el `@` sería ambiguo.
  assert.deepEqual(readImageGeometry("Vacaciones 2024"), {
    title: "Vacaciones 2024",
    width: null,
    align: "left",
  });
  assert.deepEqual(readImageGeometry("Foto center"), {
    title: "Foto center",
    width: null,
    align: "left",
  });
  // Un número que no es un ancho creíble tampoco.
  assert.deepEqual(readImageGeometry("Códice @8"), { title: "Códice @8", width: null, align: "left" });
});

test("un tooltip escrito por otra persona se conserva tal cual", () => {
  // Sin geometría no se toca nada: es la forma mayoritaria y no se puede
  // «normalizar» sin perder el texto de quien escribió la nota.
  assert.deepEqual(readImageGeometry("Una captura"), {
    title: "Una captura",
    width: null,
    align: "left",
  });
  assert.equal(writeImageGeometry("Una captura", null, "left"), "Una captura");
});

test("la geometría se vuelve a escribir detrás del tooltip", () => {
  assert.equal(writeImageGeometry("Pie", 600, "center"), "Pie @600 @center");
  assert.equal(writeImageGeometry("Pie", 600, "left"), "Pie @600");
  assert.equal(writeImageGeometry("", 300, "right"), "@300 @right");
  // La alineación por defecto no se escribe: escribirla sería ruido en el fichero.
  assert.equal(writeImageGeometry("Pie", null, "left"), "Pie");
});

test("las tres alineaciones son las únicas y se reconocen", () => {
  assert.deepEqual([...IMAGE_ALIGNS], ["left", "center", "right"]);
  for (const align of IMAGE_ALIGNS) assert.equal(isImageAlign(align), true);
  assert.equal(isImageAlign("middle"), false);
  assert.equal(isImageAlign(null), false);
});

test("el tamaño y la alineación sobreviven a la ida y vuelta por Markdown", () => {
  const markdown = createNoteMarkdownManager();
  const entrada = '![Pie de la foto](./.assets/captura.png "Pie de la foto @600 @center")\n';
  const documento = markdown.parse(entrada);
  const imagen = documento.content?.[0];
  assert.equal(imagen?.type, "noteImage");
  assert.equal(imagen?.attrs?.width, 600);
  assert.equal(imagen?.attrs?.align, "center");
  assert.equal(imagen?.attrs?.alt, "Pie de la foto");
  assert.equal(imagen?.attrs?.title, "Pie de la foto");

  const salida = markdown.serialize(documento).trim();
  assert.equal(salida, entrada.trim());
});

test("una imagen sin tamaño ni alineación no escribe nada de más", () => {
  const markdown = createNoteMarkdownManager();
  const salida = markdown
    .serialize(markdown.parse('![Pie](./.assets/x.png)\n'))
    .trim();
  assert.equal(salida, "![Pie](./.assets/x.png)");
});

test("cambiar el tamaño y la alineación no toca el texto de la nota", () => {
  const markdown = createNoteMarkdownManager();
  const antes = markdown.parse("# Título\n\nUn párrafo con **negrita**.\n");
  const despues = markdown.parse(
    '# Título\n\nUn párrafo con **negrita**.\n\n![Pie](./.assets/x.png "Pie @700 @right")\n',
  );
  assert.equal(antes.content?.length, despues.content?.length - 1);
  assert.equal(
    markdown.serialize(despues).includes("negrita"),
    true,
    "el texto tiene que seguir ahí después de añadir una imagen",
  );
});

test("dar la vuelta dos veces da lo mismo que darla una", () => {
  const markdown = createNoteMarkdownManager();
  const entrada = '![Pie](./.assets/x.png "Pie @600 @center")\n\ntexto\n';
  const una = markdown.serialize(markdown.parse(entrada));
  const dos = markdown.serialize(markdown.parse(una));
  assert.equal(dos, una);
});

test("un tooltip con comillas se escapa y se vuelve a leer", () => {
  const markdown = createNoteMarkdownManager();
  const entrada = '![Pie](./.assets/x.png "El \\"sistema\\" @500")\n';
  const salida = markdown.serialize(markdown.parse(entrada)).trim();
  assert.equal(salida, '![Pie](./.assets/x.png "El \\"sistema\\" @500")');
  // Y el ancho se sigue leyendo: escapar el tooltip no puede comerse la geometría.
  assert.equal(markdown.parse(entrada).content?.[0]?.attrs?.width, 500);
});