import assert from "node:assert/strict";
import test from "node:test";

import type { JSONContent } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";

import { loadNoteAssets, restoreNoteAssets } from "./markdown/assets.ts";
import type { NoteAssets } from "./markdown/assets.ts";
import { parseNoteMarkdown, serializeNoteMarkdown } from "./markdown/document.ts";
import { createNoteMarkdownManager } from "./markdown/manager.ts";
import { NoteImage } from "./extensions/note-image.ts";

/**
 * El Markdown del editor, probado en Node.
 *
 * El Markdown es lo que se guarda en el disco, así que es la mitad del producto:
 * si una ida y vuelta cambia una palabra, una tilde o una tubería, se está
 * perdiendo lo que alguien escribió. Y aquí no hace falta navegador: el
 * `MarkdownManager` de `@tiptap/markdown` analiza y serializa sin DOM, con las
 * mismas extensiones que el editor de verdad —no una copia— porque sale de
 * `createEditorExtensions`.
 */
const manager = createNoteMarkdownManager();

const SVG = "data:image/svg+xml;base64,PHN2Zy8+";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** Ida y vuelta: lo que sale tiene que ser lo que entró. */
function roundTrip(markdown: string): string {
  return manager.serialize(manager.parse(markdown));
}

/**
 * El texto plano de la nota, como lo lee una persona.
 *
 * Es la comprobación que importa: aunque el Markdown cambie de forma (una tabla
 * se alinea con espacios, un `<` sale como `&lt;`), **lo que se lee** tiene que
 * seguir siendo lo mismo. Los bloques se separan con un salto para que no se
 * peguen entre sí.
 */
function plainText(markdown: string): string {
  const partes: string[] = [];
  const visitar = (nodo: JSONContent): void => {
    if (nodo.type === "text") partes.push(nodo.text ?? "");
    if (nodo.type === "hardBreak") partes.push("\n");
    if (nodo.type === "noteImage") partes.push(String(nodo.attrs?.alt ?? ""));
    for (const hijo of nodo.content ?? []) visitar(hijo);
    if (nodo.type === "paragraph" || nodo.type === "heading" || nodo.type === "listItem") {
      partes.push("\n");
    }
  };
  for (const hijo of manager.parse(markdown).content ?? []) visitar(hijo);
  return partes.join("").replace(/\n{2,}/g, "\n").trim();
}

/**
 * Que los hijos de `doc` sean bloques de verdad.
 *
 * Cuando un tokenizador nuestro **no** reconoce una forma y el Markdown se queda
 * a medias, `@tiptap/markdown` mete un `text` suelto dentro de `doc`. El
 * documento es inválido y ProseMirror no lo sabe pintar: es un fallo que no se ve
 * en el texto plano (que sí sale bien) y por eso conviene mirar aquí también.
 */
function esDocumentoValido(doc: JSONContent): boolean {
  return (doc.content ?? []).every(
    (hijo) => typeof hijo.type === "string" && !["text", "hardBreak"].includes(hijo.type),
  );
}

test("los seis niveles de título", () => {
  const nota = "# Uno\n\n## Dos\n\n### Tres\n\n#### Cuatro\n\n##### Cinco\n\n###### Seis";
  assert.equal(roundTrip(nota), nota);
  const niveles = (manager.parse(nota).content ?? []).map((nodo) => nodo.attrs?.level);
  assert.deepEqual(niveles, [1, 2, 3, 4, 5, 6]);
});

test("párrafos sueltos", () => {
  const nota = "El primer párrafo.\n\nEl segundo, con un acento: ñandú, ¿qué?, ¡uy!";
  assert.equal(roundTrip(nota), nota);
});

test("lista con anidado", () => {
  const nota = "- uno\n  - dos\n    - tres\n- cuatro";
  const doc = manager.parse(nota);
  assert.equal((doc.content ?? [])[0]?.type, "bulletList");
  assert.equal(roundTrip(nota), nota);
});

test("lista numerada", () => {
  const nota = "1. uno\n2. dos\n3. tres";
  assert.equal((manager.parse(nota).content ?? [])[0]?.type, "orderedList");
  assert.equal(roundTrip(nota), nota);
});

test("lista de tareas, marcada y sin marcar", () => {
  const nota = "- [ ] pendiente\n- [x] hecha";
  const doc = manager.parse(nota);
  assert.equal((doc.content ?? [])[0]?.type, "taskList");
  assert.equal(roundTrip(nota), nota);
});

test("cita y separador", () => {
  assert.equal(roundTrip("> una cita"), "> una cita");
  assert.equal(roundTrip("---"), "---");
});

test("bloque de código con y sin lenguaje", () => {
  const conLenguaje = "```ts\nconst a: number = 1;\n```";
  assert.equal(roundTrip(conLenguaje), conLenguaje);
  assert.equal(manager.parse(conLenguaje).content?.[0]?.attrs?.language, "ts");

  const sinLenguaje = "```\nlo que sea\n```";
  assert.equal(roundTrip(sinLenguaje), sinLenguaje);
});

test("código en línea", () => {
  const nota = "esto es `código` y sigue";
  const doc = manager.parse(nota);
  assert.equal(doc.content?.[0]?.content?.[1]?.marks?.[0]?.type, "code");
  assert.equal(roundTrip(nota), nota);
});

test("negrita, cursiva, tachado y subrayado", () => {
  const marcas = "**negrita** *cursiva* ~~tachado~~ ++subrayado++";
  const doc = manager.parse(marcas);
  const tipos = (doc.content?.[0]?.content ?? [])
    .filter((nodo) => nodo.type === "text" && nodo.marks?.length)
    .map((nodo) => nodo.marks?.[0]?.type);
  assert.deepEqual(tipos, ["bold", "italic", "strike", "underline"]);
  assert.equal(roundTrip(marcas), marcas);
});

test("enlace con y sin título", () => {
  const sinTitulo = "[xenner](https://xenner.dev)";
  const conTitulo = '[xenner](https://xenner.dev "La web")';
  assert.equal(roundTrip(sinTitulo), sinTitulo);
  assert.equal(roundTrip(conTitulo), conTitulo);
  assert.equal(manager.parse(conTitulo).content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.title, "La web");
});

test("un adjunto es una tarjeta, y en el Markdown es un enlace de toda la vida", () => {
  // El Markdown es lo que se guarda y lo que se lee en cualquier otro sitio: un
  // enlace en su propia línea. Que en el editor sea una tarjeta es cosa de la vista,
  // no del fichero.
  const nota = "[informe.pdf](./.assets/9f2c1a0b7e4d.pdf)";
  const doc = manager.parse(nota);
  assert.deepEqual(doc.content?.[0], {
    type: "noteAttachment",
    // El tamaño no se serializa: es un dato del archivo, no de la nota.
    attrs: { href: "./.assets/9f2c1a0b7e4d.pdf", label: "informe.pdf", size: null },
  });
  assert.equal(roundTrip(nota), nota);
});

test("un enlace escrito a mano no se convierte en una tarjeta", () => {
  // El tokenizador solo acepta enlaces que apuntan a `.assets`, que es donde el
  // editor guarda lo que se adjunta. Si aceptara cualquier enlace a un archivo, el
  // editor se apropiaría de los enlaces que alguien escribió para leerlos: una nota
  // con tres referencias a otras notas enseñaría tres tarjetas que, al abrirlas con
  // un clic, intentarían abrir un `.md` con el visor del sistema.
  const nota = [
    "[Otra nota](carpeta/otra.md)",
    "",
    "[La web](https://ejemplo.com)",
    "",
    "Un enlace dentro de una frase [no cuenta](./.assets/datos.pdf) como tarjeta.",
    "",
    "[El archivo](./.assets/datos.pdf)",
  ].join("\n");
  const doc = manager.parse(nota);
  assert.deepEqual(
    (doc.content ?? []).map((nodo) => nodo.type),
    ["paragraph", "paragraph", "paragraph", "noteAttachment"],
  );
  assert.equal(roundTrip(nota), nota);
});

test("imagen con pie", () => {
  const nota = `![El pie de la imagen](${PNG})`;
  const doc = manager.parse(nota);
  assert.deepEqual(doc.content?.[0], {
    type: "noteImage",
    // `width: null` y `align: "left"` son los valores por defecto: la imagen no
    // tiene tamaño elegido ni alineación pedida, y eso también es información.
    attrs: { src: PNG, alt: "El pie de la imagen", title: "", width: null, align: "left" },
  });
  assert.equal(roundTrip(nota), nota);
});

test("imagen con pie y con título", () => {
  const nota = `![El pie](${PNG} "El título")`;
  const doc = manager.parse(nota);
  assert.deepEqual(doc.content?.[0]?.attrs, {
    src: PNG,
    alt: "El pie",
    title: "El título",
    width: null,
    align: "left",
  });
  assert.equal(roundTrip(nota), nota);
});

test("imagen sin pie", () => {
  const nota = `![](${PNG})`;
  assert.equal(roundTrip(nota), nota);
});

test("un pie o un título con corchete y comilla no rompen la imagen", () => {
  const conCorchete = `![pie con \\] corchete](${PNG})`;
  assert.equal(roundTrip(conCorchete), conCorchete);
  assert.equal(manager.parse(conCorchete).content?.[0]?.attrs?.alt, "pie con ] corchete");

  // Las comillas simples también valen como título, pero al salir se normalizan
  // a dobles con `\"`: lo que importa es que el texto vuelva a ser el mismo.
  const doc = manager.parse(`![pie](${PNG} 'con "comillas"')`);
  assert.equal(doc.content?.[0]?.attrs?.title, 'con "comillas"');
  assert.equal(manager.serialize(doc), `![pie](${PNG} "con \\"comillas\\"")`);
});

test("un src con paréntesis va entre ángulos", () => {
  // Markdown tampoco acepta `![a](x(1).png)`: lo escribe entre `<` y `>`.
  const nota = "![una captura](<https://x.dev/a(1).png>)";
  const doc = manager.parse(nota);
  assert.equal(doc.content?.[0]?.attrs?.src, "https://x.dev/a(1).png");
  assert.equal(manager.serialize(doc), nota);
});

/**
 * Un `src` con **paréntesis balanceados y sin ángulos** sí es Markdown.
 *
 * Es como se llaman de verdad las capturas (`captura (1).png`), así que la
 * puerta tiene que estar abierta. Antes no lo estaba, y lo que pasaba no era
 * bonito: la imagen desaparecía y el documento que salía era **inválido** —un
 * `text` suelto dentro de `doc`, que ProseMirror ni sabe pintar—.
 */
test("un src con paréntesis balanceados sigue siendo una imagen", () => {
  const nota = "![captura](./.assets/captura(1).png)";
  const doc = manager.parse(nota);
  assert.deepEqual(doc.content?.[0], {
    type: "noteImage",
    attrs: {
      src: "./.assets/captura(1).png",
      alt: "captura",
      title: "",
      width: null,
      align: "left",
    },
  });
  assert.ok(esDocumentoValido(doc), "el documento tiene que ser válido: " + JSON.stringify(doc));
  // Al guardar vuelve con los ángulos, que es la forma sin ambigüedad.
  const salida = manager.serialize(doc);
  assert.equal(salida, "![captura](<./.assets/captura(1).png>)");
  assert.equal(manager.serialize(manager.parse(salida)), salida);
});

test("un src con paréntesis desiguales no es una imagen", () => {
  // `![a](x(1)` no es Markdown de nadie: el paréntesis no cierra. Se queda como
  // texto, que es lo único honesto que se puede hacer con esto.
  const doc = manager.parse("antes ![a](x(1) despues");
  assert.equal(doc.content?.[0]?.type, "paragraph");
});

test("una imagen sin src es un hueco y vuelve a ser un hueco", () => {
  /**
   * El pie vacío **sí** sale como `![]()`, y es lo correcto: es una imagen que
   * no se pudo cargar, y su forma de Markdown es esa. Lo que no puede pasar es
   * que al releerla sea otra cosa —o que se pierda— porque entonces cada guardado
   * iría moviendo la nota.
   */
  for (const nota of ["![]()", "![pie]()"]) {
    const salida = roundTrip(nota);
    assert.equal(salida, nota);
    assert.equal(manager.parse(salida).content?.[0]?.type, "noteImage");
  }
});

test("pizarra", () => {
  const nota = `![Pizarra](${SVG} "xenner:pizarra")`;
  const doc = manager.parse(nota);
  assert.equal(doc.content?.[0]?.type, "whiteboard");
  assert.equal(doc.content?.[0]?.attrs?.src, SVG);
  assert.equal(roundTrip(nota), nota);
});

test("tabla", () => {
  const nota = "| nombre | valor |\n| --- | --- |\n| uno | 1 |\n| dos | 2 |";
  const doc = manager.parse(nota);
  assert.equal(doc.content?.[0]?.type, "table");
  // La salida se alinea con espacios, pero es la misma tabla: al volver a
  // analizarla sale byte a byte lo mismo.
  const salida = roundTrip(nota);
  assert.equal(roundTrip(salida), salida);
  assert.equal(plainText(salida), plainText(nota));
});

test("matemática en línea y de bloque", () => {
  const enLinea = "la suma es $x + y$ tal cual";
  const doc = manager.parse(enLinea);
  assert.equal(doc.content?.[0]?.content?.[1]?.type, "inlineMath");
  assert.equal(doc.content?.[0]?.content?.[1]?.attrs?.latex, "x + y");
  assert.equal(roundTrip(enLinea), enLinea);

  const deBloque = "$$\n\\int_0^1 x^2 \\, dx\n$$";
  const docBloque = manager.parse(deBloque);
  assert.equal(docBloque.content?.[0]?.type, "blockMath");
  assert.equal(roundTrip(deBloque), deBloque);
});

test("el color de texto entra como marca y sale en minúsculas", () => {
  const entrada = '<span data-xenner-color="#FF0000" style="color:#ff0000">rojo</span>';
  const doc = manager.parse(entrada);
  assert.equal(doc.content?.[0]?.content?.[0]?.marks?.[0]?.type, "textColor");
  assert.equal(doc.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.color, "#ff0000");
  assert.equal(
    manager.serialize(doc),
    '<span data-xenner-color="#ff0000" style="color:#ff0000">rojo</span>',
  );
});

test("el fondo entra como marca y sale con su style", () => {
  const doc = manager.parse('<span data-xenner-background="#FDE68A">resaltado</span>');
  assert.equal(doc.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.background, "#fde68a");
  assert.equal(
    manager.serialize(doc),
    '<span data-xenner-background="#fde68a" style="background-color:#fde68a">resaltado</span>',
  );
});

test("color y fondo a la vez", () => {
  const entrada =
    '<span data-xenner-color="#00FF00" data-xenner-background="#0000FF" style="color:#00ff00;background-color:#0000ff">los dos</span>';
  assert.equal(manager.serialize(manager.parse(entrada)), entrada.toLowerCase());
});

test("un color escrito corto se escribe largo", () => {
  const salida = manager.serialize(manager.parse('<span data-xenner-color="#ABC">x</span>'));
  assert.equal(salida, '<span data-xenner-color="#aabbcc" style="color:#aabbcc">x</span>');
});

test("un span que no lleva color hexadecimal no se marca", () => {
  const salida = manager.serialize(manager.parse('<span style="color:red">rojo</span>'));
  assert.ok(!salida.includes("data-xenner-color"));
  assert.match(salida, /rojo/);
});

test("Markdown que parece escapado dentro de código", () => {
  const nota = "```\n*esto* sigue siendo texto\n```";
  assert.equal(roundTrip(nota), nota);
  const enLinea = "`*esto*` no es cursiva";
  const doc = manager.parse(enLinea);
  const conMarca = (doc.content?.[0]?.content ?? []).filter((nodo) => nodo.marks?.length);
  assert.deepEqual(conMarca, [{ type: "text", text: "*esto*", marks: [{ type: "code" }] }]);
  assert.equal(roundTrip(enLinea), enLinea);
});

test("un «<» suelto sobrevive al texto de la nota", () => {
  const nota = "esto es < un signo y > otro";
  // Sale como entidad HTML, que es lo mismo que se ve; lo que no puede pasar es
  // que disappears del texto o se vuelva una etiqueta.
  const salida = roundTrip(nota);
  assert.equal(plainText(salida), plainText(nota));
  assert.equal(roundTrip(salida), salida);
});

test("una tubería dentro de una tabla no rompe la tabla", () => {
  const nota = "| a | b |\n| --- | --- |\n| 1 \\| 2 | x |";
  const salida = roundTrip(nota);
  assert.equal(roundTrip(salida), salida);
  assert.equal(plainText(salida), plainText(nota));
  // Y sigue habiendo dos columnas.
  const celdas = (manager.parse(salida).content?.[0]?.content ?? []).flatMap((fila) =>
    (fila.content ?? []).map((celda) => celda.content?.[0]?.content?.[0]?.text),
  );
  assert.deepEqual(celdas, ["a", "b", "1 | 2", "x"]);
});

test("una nota entera no pierde ni una palabra al dar la vuelta", () => {
  const nota = [
    "# Título de la nota",
    "",
    "Un párrafo con **negrita**, *cursiva*, ~~tachado~~, ++subrayado++, `código`,",
    "un [enlace](https://xenner.dev \"la web\") y la matemática $x^2 + y^2 = z^2$.",
    "",
    "- uno",
    "  - anidado",
    "    - más anidado",
    "- dos",
    "",
    "1. primero",
    "2. segundo",
    "",
    "- [ ] sin hacer",
    "- [x] hecha",
    "",
    "> una cita",
    "",
    "---",
    "",
    "```ts",
    "const suma = (a: number, b: number): number => a + b;",
    "```",
    "",
    "```",
    "*esto* sigue literal",
    "```",
    "",
    `![Un pie de imagen](${PNG} "El título")`,
    "",
    `![Pizarra](${SVG} "xenner:pizarra")`,
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 \\| 2 | x |",
    "",
    "$$",
    "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
    "$$",
    "",
    '<span data-xenner-color="#ff0000" style="color:#ff0000">rojo</span> y',
    '<span data-xenner-background="#fde68a" style="background-color:#fde68a">resaltado</span>.',
    "",
    "Un < suelto, un > suelto y un &amp; de entropy.",
  ].join("\n");

  const primera = roundTrip(nota);
  assert.equal(plainText(primera), plainText(nota), "el texto plano tiene que ser el mismo");

  // Y tiene que ser estable: dar la vuelta otra vez no puede seguir moviendo nada.
  const segunda = roundTrip(primera);
  assert.equal(segunda, primera, "la segunda vuelta tiene que ser idéntica");
  assert.equal(plainText(segunda), plainText(nota));
});

test("parseNoteMarkdown y serializeNoteMarkdown con assets", async () => {
  const enDisco = `![captura](./.assets/captura.png "Una captura")`;
  const assets = await loadNoteAssets("Tema/nota.md", enDisco, async () => ({
    mime: "image/png",
    dataBase64: "Q0FUENVSQVA=",
    revision: "rev-1",
  }));

  // Lo que entra al editor ya no tiene rutas, tiene `data:` URL.
  assert.equal(assets.markdown, `![captura](data:image/png;base64,Q0FUENVSQVA= "Una captura")`);

  const doc = parseNoteMarkdown(manager, assets.markdown);
  assert.deepEqual(doc.content?.[0]?.attrs, {
    src: "data:image/png;base64,Q0FUENVSQVA=",
    alt: "captura",
    title: "Una captura",
    width: null,
    align: "left",
  });

  // Y lo que sale vuelve a ser la ruta: en el disco no hay base64.
  assert.equal(serializeNoteMarkdown(manager, doc, assets), enDisco);
});

test("un asset ilegible deja el Markdown como estaba", async () => {
  const enDisco = "![rota](./.assets/rota.png)\n\ntexto";
  const assets: NoteAssets = await loadNoteAssets("nota.md", enDisco, async () => {
    throw new Error("no se pudo leer");
  });
  const doc = parseNoteMarkdown(manager, assets.markdown);
  assert.equal(doc.content?.[0]?.attrs?.src, "./.assets/rota.png");
  assert.equal(serializeNoteMarkdown(manager, doc, assets), enDisco);
  assert.equal(restoreNoteAssets(assets.markdown, assets.paths), enDisco);
});

/**
 * Una imagen escrita dentro de un párrafo **no** se vuelve bloque.
 *
 * `noteImage` es de bloque, así que el texto que la rodea se queda en el
 * párrafo: sale el pie de la imagen y no se parte la frase en dos. Es la
 * degradación que se acepta aquí, y está escrito en el test para que no cambie
 * sin que alguien lo decida.
 */
test("una imagen dentro de un párrafo se queda en el párrafo", () => {
  const nota = "antes ![pie](x.png) despues";
  const doc = manager.parse(nota);
  assert.equal(doc.content?.[0]?.type, "paragraph");
  assert.equal(plainText(nota), "antes pie despues");
});

// ---------------------------------------------------------------------------
// La vista de nodo de la imagen
//
// Es el único trozo del motor que necesita DOM, y es DOM plano a propósito: el
// pie se escribe en un `<input>` de verdad para que el cursor se comporte como en
// cualquier campo de texto. No hay `jsdom` en el proyecto, así que aquí hay un
// DOM mínimo con **justo** lo que la vista toca. No prueba el navegador: prueba
// que la vista pide al DOM lo que espera y que se comporta bien cuando el
// ProseMirror le devuelve el nodo.
// ---------------------------------------------------------------------------

/** Lo mínimo de un elemento para esta vista, y ni un atributo más. */
class FakeElement {
  tag: string;
  className = "";
  dataset: Record<string, string> = {};
  hidden = false;
  alt = "";
  draggable = true;
  type = "";
  placeholder = "";
  spellcheck = true;
  textContent = "";
  value = "";
  /** Sin `src`, un `<img>` del navegador ya está "completo" y mide cero. */
  complete = true;
  naturalWidth = 0;
  atributos = new Map<string, string>();
  hijos: FakeElement[] = [];
  oyentes = new Map<string, ((event: unknown) => void)[]>();
  clases = new Set<string>();
  /**
   * `style` y `dataset` como objetos sueltos.
   *
   * Los necesita el redimensionable de Tiptap (`ResizableNodeView`), que pone
   * `style.position`, `dataset.resizeWrapper` y compañía. Un `Map` no sirve: el
   * DOM real escribe `elemento.style.ancho = …` como una propiedad.
   */
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  className = "";
  /** Los dos primeros, que es lo que el redimensionable mira al construir. */
  offsetWidth = 0;
  offsetHeight = 0;

  /** `src` es una propiedad, no un atributo, pero para esta vista es lo mismo. */
  #src = "";
  get src(): string {
    return this.#src;
  }
  set src(valor: string) {
    this.#src = valor;
    this.atributos.set("src", valor);
    // Poner el `src` arranca la carga: `complete` pasa a falso hasta que el
    // navegador diga `load` o `error`.
    this.complete = false;
    this.naturalWidth = 0;
  }

  classList = {
    add: (clase: string) => void this.clases.add(clase),
    remove: (clase: string) => void this.clases.delete(clase),
    contains: (clase: string): boolean => this.clases.has(clase),
    toggle: (clase: string, quiere?: boolean): void => {
      if (quiere ?? !this.clases.has(clase)) this.clases.add(clase);
      else this.clases.delete(clase);
    },
  };

  constructor(tag: string) {
    this.tag = tag;
  }

  setAttribute(nombre: string, valor: string): void {
    this.atributos.set(nombre, valor);
  }
  getAttribute(nombre: string): string | null {
    return this.atributos.get(nombre) ?? null;
  }
  removeAttribute(nombre: string): void {
    this.atributos.delete(nombre);
    if (nombre === "src") this.#src = "";
  }
  append(...hijos: FakeElement[]): void {
    this.hijos.push(...hijos);
  }
  /** El DOM real usa `appendChild`; el redimensionable lo llama así. */
  appendChild(hijo: FakeElement): FakeElement {
    this.hijos.push(hijo);
    return hijo;
  }
  insertBefore(hijo: FakeElement): FakeElement {
    this.hijos.push(hijo);
    return hijo;
  }
  addEventListener(tipo: string, oyente: (event: unknown) => void): void {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), oyente]);
  }
  removeEventListener(tipo: string, oyente: (event: unknown) => void): void {
    this.oyentes.set(
      tipo,
      (this.oyentes.get(tipo) ?? []).filter((otro) => otro !== oyente),
    );
  }
  /**
   * `contains` **profundo**, como el del DOM.
   *
   * Con la estructura plana de antes bastaba mirar los hijos directos. Al meter el
   * redimensionable de Tiptap hay un `wrapper` entre el contenedor y la imagen, y
   * un `contains` de un nivel habría dicho que la imagen está fuera de su propia
   * vista: justo el bug que `ignoreMutation` existe para que no pase.
   */
  contains(otro: FakeElement | null): boolean {
    if (otro === this) return true;
    return this.hijos.some((hijo) => hijo.contains(otro));
  }
  remove(): void {
    this.hijos.length = 0;
  }
  /** Dispara un evento como si fuera el navegador. */
  dispara(tipo: string): void {
    for (const oyente of this.oyentes.get(tipo) ?? []) oyente({ target: this });
  }
}

function crearElemento(tag: string): FakeElement {
  return new FakeElement(tag);
}

/** Monta la vista de nodo con un `document` de mentira puesto alrededor. */
function montarVistaNodo(attrs: Record<string, string>): {
  dom: FakeElement;
  imagen: FakeElement;
  hueco: FakeElement;
  pie: FakeElement;
  alineacion: FakeElement;
  despachos: { attrs: Record<string, string> }[];
  vista: Record<string, (...args: never[]) => unknown>;
} {
  const anterior = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = { createElement: crearElemento };
  (globalThis as Record<string, unknown>).HTMLElement = FakeElement;
  try {
    // `addNodeView` es la puerta: sin `document` devuelve `null` (Node), y con
    // `document` devuelve el generador de la vista.
    const addNodeView = (
      NoteImage as unknown as {
        config: { addNodeView?: () => ((props: unknown) => NoteView) | null };
      }
    ).config.addNodeView!;
    assert.ok(addNodeView, "la extensión tiene que declarar addNodeView");
    const render = addNodeView.call(NoteImage) as (props: unknown) => NoteView;
    assert.ok(render, "con document hay que devolver una vista de nodo");

    const despachos: { attrs: Record<string, string> }[] = [];
    const nodo = { type: "noteImage", attrs };
    const vista = render({
      node: nodo,
      getPos: () => 0,
      // El redimensionable de Tiptap se suscribe al `update` del editor y mira
      // si se puede editar. Con un `on` que no hace nada basta: lo que se prueba
      // aquí es el pie, el hueco y la alineación.
      editor: { on: () => undefined, off: () => undefined, isEditable: true },
      view: {
        state: {
          doc: { nodeAt: () => nodo },
          tr: {
            setNodeMarkup: (_pos: number, _markup: unknown, nuevo: Record<string, string>) => ({
              nuevo,
            }),
          },
        },
        dispatch: (tr: { nuevo: Record<string, string> }) => despachos.push(tr),
      },
    }) as unknown as Record<string, (...args: never[]) => unknown>;

    // La imagen **no** es el primer hijo del contenedor: el redimensionable mete
    // un `wrapper` alrededor. Se busca por clase, que es lo que no cambia.
    const dom = vista.dom as unknown as FakeElement;
    const buscar = (clase: string): FakeElement => {
      const encontrado = porClase(dom, clase);
      assert.ok(encontrado, `la vista tiene que tener un elemento ${clase}`);
      return encontrado;
    };
    return {
      dom,
      imagen: buscar("note-image__picture"),
      hueco: buscar("note-image__missing"),
      pie: buscar("note-image__caption"),
      alineacion: buscar("note-image__align"),
      despachos,
      vista,
    };
  } finally {
    (globalThis as Record<string, unknown>).document = anterior;
  }
}

/** El primer elemento de la clase pedida, a cualquier profundidad. */
function porClase(raiz: FakeElement, clase: string): FakeElement | undefined {
  if (raiz.className === clase) return raiz;
  for (const hijo of raiz.hijos) {
    const encontrado = porClase(hijo, clase);
    if (encontrado) return encontrado;
  }
  return undefined;
}

test("la vista de la imagen solo existe si hay DOM", () => {
  const addNodeView = (NoteImage as unknown as { config: { addNodeView?: () => unknown } }).config
    .addNodeView!;
  // Sin `document` (los tests de Node) la nota se abre con el `renderHTML`.
  assert.equal(addNodeView.call(NoteImage), null);
});

test("una imagen que sí está se ve desde el primer momento", () => {
  /**
   * La trampa: un `<img>` al que todavía no se le ha puesto el `src` ya está
   * «completo» y mide cero píxeles, así que mirar `complete`/`naturalWidth`
   * declaraba rota **toda** imagen al abrir la nota. Y como no había ningún
   * `load` que lo desmintiera, se quedaba así hasta que se escribía en su pie.
   */
  const { imagen, hueco, dom } = montarVistaNodo({ src: "data:image/png;base64,QUJD", alt: "Pie" });
  assert.equal(imagen.hidden, false, "la imagen tiene que verse sin esperar a nada");
  assert.equal(hueco.hidden, true, "el hueco solo sale si la imagen no está");
  assert.equal(dom.classList.contains("note-image--missing"), false);

  // Si el navegador dice que sí se cargó, sigue viéndose; si dice que no, sale
  // el hueco con el pie al lado.
  imagen.dispara("load");
  assert.equal(imagen.hidden, false);
  imagen.dispara("error");
  assert.equal(imagen.hidden, true);
  assert.equal(hueco.hidden, false);
  assert.equal(hueco.textContent, "Pie");
  imagen.dispara("load");
  assert.equal(imagen.hidden, false);
});

test("un `src` nuevo vuelve a tener una oportunidad", () => {
  const { vista, imagen } = montarVistaNodo({ src: "data:image/png;base64,QUJD", alt: "" });
  imagen.dispara("error");
  assert.equal(imagen.hidden, true);
  const nodo = { type: "noteImage", attrs: { src: "data:image/png;base64,TUFC", alt: "" } };
  (vista.update as (n: unknown) => boolean)(nodo);
  assert.equal(imagen.hidden, false, "cambiar de imagen la hace probar otra vez");
});

test("el pie se guarda con una transacción y sin perder el cursor", () => {
  const { pie, vista, despachos } = montarVistaNodo({ src: "x.png", alt: "Pie" });
  assert.equal(pie.value, "Pie");
  assert.equal(pie.tag, "input");
  assert.equal(pie.type, "text");

  // Escribir: sale una transacción con el pie nuevo.
  pie.value = "Otro pie";
  pie.dispara("input");
  assert.deepEqual(despachos, [{ nuevo: { src: "x.png", alt: "Otro pie" } }]);

  // Y cuando ProseMirror devuelve el nodo ya cambiado, `update` **no** puede
  // reescribir el `value`: si lo hiciera, el cursor saltaría al final en cada
  // tecla y el pie sería inusable.
  const conCambio = { type: "noteImage", attrs: { src: "x.png", alt: "Otro pie" } };
  assert.equal((vista.update as (n: unknown) => boolean)(conCambio), true);
  assert.equal(pie.value, "Otro pie", "update no puede tocar el input mientras se escribe");

  // Un `src` distinto sí puede reescribir el pie, porque no hay nadie escribiendo.
  const conSrc = { type: "noteImage", attrs: { src: "y.png", alt: "Otro pie" } };
  assert.equal((vista.update as (n: unknown) => boolean)(conSrc), true);
  assert.equal(pie.value, "Otro pie");
});

test("ProseMirror no reanaliza nada de dentro de la vista", () => {
  /**
   * Lo que impide que ProseMirror destruya el `<input>` mientras se escribe: la
   * vista se declara dueña de su subárbol. Sin esto, cada pulsación dispara un
   * `parseDOM` del `<input>`, se reconstruye el nodo y el cursor se pierde.
   */
  const { dom, pie, imagen, hueco, vista } = montarVistaNodo({ src: "x.png", alt: "Pie" });
  const ignoreMutation = vista.ignoreMutation as (m: { target?: unknown }) => boolean;
  for (const objetivo of [dom, imagen, hueco, pie]) {
    assert.equal(ignoreMutation({ target: objetivo }), true, "dentro de la vista, siempre");
  }
  assert.equal(ignoreMutation({ target: crearElemento("p") }), false);

  // Y los eventos del `input` no le llegan a ProseMirror.
  const stopEvent = vista.stopEvent as (e: unknown) => boolean;
  assert.equal(stopEvent({ target: pie }), true);
  assert.equal(stopEvent({ target: dom }), false);
});

test("un nodo de otro tipo no lo recoloca esta vista", () => {
  const { vista } = montarVistaNodo({ src: "x.png", alt: "Pie" });
  assert.equal((vista.update as (n: unknown) => boolean)({ type: "paragraph", attrs: {} }), false);
});