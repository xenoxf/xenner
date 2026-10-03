import assert from "node:assert/strict";
import test from "node:test";

import { flattenExtensions, getExtensionField, resolveExtensions } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { keydownHandler } from "@tiptap/pm/keymap";
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { crearEditorDePrueba } from "./editor-harness.ts";
import type { TestEditor } from "./editor-harness.ts";
import type { ReportFailure } from "./commands.ts";
import { EDITOR_SHORTCUTS, TECLAS_DE_OTROS, KeyboardNote, atajosDeBloque } from "./keyboard.ts";

/**
 * Los atajos se pulsan, no se leen.
 *
 * Un atajo es un cambio en el documento, así que aquí se mide el cambio: se pulsa
 * la tecla de verdad —con el `keydownHandler` de `prosemirror-keymap`, el mismo que
 * usa `KeyboardNote`— sobre un editor del arnés, y se mira qué documento sale.
 *
 * Por eso los atajos son comandos de ProseMirror y no de Tiptap: un atajo de Tiptap
 * solo recibe `{ editor }`, y en Node no hay editor. Con `(estado, despachar)` el
 * arnés vale tal cual, y el test mide la transacción en lugar de mirar quién llamó
 * a qué.
 *
 * Las teclas se pulsan con la tecla que **`Mod` significa en la máquina que está
 * ejecutando el test**, y no siempre con `Ctrl`.
 *
 * El motivo: `prosemirror-keymap` decide si `Mod` es `Ctrl` o `Meta` leyendo
 * `navigator.platform`. En el navegador no hay duda —si es un Mac, el usuario
 * pulsa ⌘—, pero **Node 21 y siguientes ya tienen `navigator` global**, con la
 * plataforma del sistema. Un test que pulsara siempre `Ctrl` pasaba en Linux y en
 * Windows y fallaba entero en macOS, que es donde la release tenía que funcionar.
 *
 * Aquí no se decide a mano: se deja que lo decida el mismo `keydownHandler` que
 * usa la app, que es lo que hay que comprobar.
 */

/** Si esta máquina es un Mac, donde `Mod` es ⌘ y no Ctrl. */
const ES_MAC =
  typeof navigator !== "undefined" && /Mac|iP(hone|[oa]d)/.test(navigator.platform ?? "");

/** El `keyCode` de cada tecla que usa un atajo de bloque. */
const KEYCODE: Record<string, number> = {
  "0": 48,
  "1": 49,
  "2": 50,
  "3": 51,
  "4": 52,
  "5": 53,
  "6": 54,
  "7": 55,
  "8": 56,
  "9": 57,
  ".": 190,
  c: 67,
  z: 90,
};

/** Lo que un teclado entrega con `Shift` pulsado, que es lo que hay que resolver. */
const CON_SHIFT: Record<string, string> = { "7": "&", "8": "*", "9": "(", ".": ">" };

/** El `KeyboardEvent` de una combinación escrita como `Mod-Alt-0`. */
function eventoDe(atajo: string): KeyboardEvent {
  const partes = atajo.split("-");
  const tecla = partes.pop() ?? "";
  const code = KEYCODE[tecla];
  if (code == null) throw new Error(`El test no sabe pulsar la tecla «${tecla}»`);
  const conShift = partes.includes("Shift");
  const conMod = partes.includes("Mod");
  return {
    keyCode: code,
    // Con `Shift`, el navegador entrega el carácter del modificador: sin esto el
    // atajo se resolvería por el camino fácil y no se comprobaría que también
    // funciona con el teclado de verdad, que es donde llega `&` en vez de `7`.
    key: conShift ? (CON_SHIFT[tecla] ?? tecla) : tecla,
    // `Mod` es la tecla que el sistema usa para «esto es un atajo»: Ctrl en
    // Windows y Linux, ⌘ en macOS. Poner las dos a la vez falsearía la prueba.
    ctrlKey: conMod && !ES_MAC,
    metaKey: conMod && ES_MAC,
    shiftKey: conShift,
    altKey: partes.includes("Alt"),
  } as unknown as KeyboardEvent;
}

/**
 * La vista que el keymap necesita: el estado y el despachador, que en el arnés son
 * los mismos que usa cualquier otro test. No hay nada más que mirar, y no se
 * inventa nada más.
 */
function vistaDe(editor: TestEditor): EditorView {
  return {
    state: editor.estado(),
    dispatch: (tr: Transaction) => editor.despachar(tr),
  } as unknown as EditorView;
}

/** Pulsa un atajo y devuelve si el editor se ha ocupado de la tecla. */
function pulsar(editor: TestEditor, atajo: string, report?: ReportFailure): boolean {
  return keydownHandler(atajosDeBloque(report))(vistaDe(editor), eventoDe(atajo));
}

const parrafo = (texto: string) => ({ type: "paragraph", content: [{ type: "text", text: texto }] });
const titulo = (nivel: number, texto: string) => ({
  type: "heading",
  attrs: { level: nivel },
  content: [{ type: "text", text: texto }],
});
const celda = (texto: string) => ({ type: "tableCell", content: [parrafo(texto)] });
const fila = (...textos: string[]) => ({ type: "tableRow", content: textos.map(celda) });
const tabla = (...filas: ReturnType<typeof fila>[]) => ({ type: "table", content: filas });

test("Mod-Shift-7 sobre un texto seleccionado hace una lista y conserva el texto", () => {
  const editor = crearEditorDePrueba([parrafo("Uno"), parrafo("Dos")]);
  editor.seleccionarTodo();

  assert.equal(pulsar(editor, "Mod-Shift-7"), true);
  editor.validar();
  // El texto no puede cambiar: el atajo cambia el tipo de bloque, no lo que hay
  // escrito, que es el fallo que hizo falta reescribir `setBlockType`.
  assert.equal(editor.markdown(), "- Uno\n- Dos");
});

test("Mod-Alt-0 saca un título y lo deja en párrafo", () => {
  const editor = crearEditorDePrueba([titulo(2, "Hola"), parrafo("Mundo")]);
  editor.seleccionar("Hola");

  assert.equal(pulsar(editor, "Mod-Alt-0"), true);
  editor.validar();
  assert.equal(editor.markdown(), "Hola\n\nMundo");
  assert.match(editor.markdown(), /^Hola/, "el título se ha quedado como título");
});

test("Mod-Alt-1 a Mod-Alt-6 ponen su nivel de título, y también sobre texto suelto", () => {
  for (let nivel = 1; nivel <= 6; nivel += 1) {
    const editor = crearEditorDePrueba([parrafo("Hola")]);
    editor.cursorEn("Hola");

    assert.equal(pulsar(editor, `Mod-Alt-${nivel}`), true, `el título ${nivel} no se puso`);
    editor.validar();
    assert.equal(editor.markdown(), `${"#".repeat(nivel)} Hola`);
  }
});

test("un título que ya está del nivel pedido no ensucia el historial", () => {
  // Sin esta comprobación, bajar un `h4` a `h3` para volver a subirlo a `h4` sería
  // un paso real del historial que no cambia nada: `Mod-z` deshacía y la nota se
  // quedaba igual, que es la forma más rápida de que alguien decida que el editor
  // está roto.
  const editor = crearEditorDePrueba([titulo(4, "Hola"), parrafo("Mundo")]);
  editor.seleccionar("Hola");
  const antes = editor.estado().doc;

  assert.equal(pulsar(editor, "Mod-Alt-4"), true);
  assert.equal(editor.markdown(), "#### Hola\n\nMundo");
  // Nada de pasos: el documento es el mismo nodo, no uno nuevo igual.
  assert.ok(editor.estado().doc.eq(antes), "el documento se ha rehecho sin necesidad");
});

test("los títulos de 4 a 6 no envuelven: sacan la cita en vez de meterse dentro", () => {
  // La mitad de la razón de que `setBlockType` se escribiera a mano: los comandos
  // de bloque de Tiptap envuelven, y «Cita» y luego «Título» dejan `> ## texto`,
  // sin forma de quitar el `blockquote` que se ha puesto por el camino.
  const editor = crearEditorDePrueba([
    { type: "blockquote", content: [parrafo("Hola"), parrafo("Mundo")] },
  ]);
  editor.seleccionar("Hola");

  assert.equal(pulsar(editor, "Mod-Alt-4"), true);
  editor.validar();
  assert.equal(editor.markdown(), "#### Hola\n\n#### Mundo");
});

test("Mod-Alt-3 baja un título de nivel 5 sin dejar nada detrás", () => {
  const editor = crearEditorDePrueba([titulo(5, "Hola"), parrafo("Mundo")]);
  editor.seleccionar("Hola");

  assert.equal(pulsar(editor, "Mod-Alt-3"), true);
  editor.validar();
  assert.equal(editor.markdown(), "### Hola\n\nMundo");
});

test("Mod-Shift-8 numera y Mod-Shift-. cita, con el texto tal cual", () => {
  const numerada = crearEditorDePrueba([parrafo("Uno"), parrafo("Dos")]);
  numerada.seleccionarTodo();
  assert.equal(pulsar(numerada, "Mod-Shift-8"), true);
  numerada.validar();
  assert.equal(numerada.markdown(), "1. Uno\n2. Dos");

  const cita = crearEditorDePrueba([parrafo("Uno")]);
  cita.seleccionar("Uno");
  assert.equal(pulsar(cita, "Mod-Shift-."), true);
  cita.validar();
  assert.equal(cita.markdown(), "> Uno");
});

test("Mod-Shift-9 hace una lista de casillas sin marcar y sin comerse nada", () => {
  const editor = crearEditorDePrueba([parrafo("Uno"), parrafo("Dos")]);
  editor.seleccionarTodo();

  assert.equal(pulsar(editor, "Mod-Shift-9"), true);
  editor.validar();
  assert.equal(editor.markdown(), "- [ ] Uno\n- [ ] Dos");
});

test("Mod-Shift-9 sobre una lista de tareas que ya está no la rompe", () => {
  // El tipo «viñeta» de `setBlockType` también lo cumple una lista de tareas, así
  // que aquí no hay nada que hacer: se dice que sí, sin tocar el documento, y sin
  // ensuciar el historial con un paso vacío.
  const editor = crearEditorDePrueba([
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [parrafo("Hecho")] },
      ],
    },
  ]);
  editor.seleccionar("Hecho");

  assert.equal(pulsar(editor, "Mod-Shift-9"), true);
  editor.validar();
  assert.equal(editor.markdown(), "- [x] Hecho");
});

test("Mod-Alt-c marca el código en línea y lo quita si ya estaba", () => {
  const editor = crearEditorDePrueba([parrafo("const a = 1")]);

  editor.seleccionar("const");
  assert.equal(pulsar(editor, "Mod-Alt-c"), true);
  assert.equal(editor.markdown(), "`const` a = 1");

  // Como el botón de la barra: el mismo atajo quita lo que puso.
  editor.seleccionar("const");
  assert.equal(pulsar(editor, "Mod-Alt-c"), true);
  assert.equal(editor.markdown(), "const a = 1");
});

test("un atajo que no se puede aplicar devuelve false y no toca el documento", () => {
  const fallos: string[] = [];
  const avisar: ReportFailure = (que, error) => {
    fallos.push(`${que}: ${error instanceof Error ? error.message : String(error)}`);
  };
  const editor = crearEditorDePrueba([tabla(fila("A", "B"), fila("C", "D"))]);
  editor.seleccionar("A");
  const antes = editor.markdown();

  // Una tabla no se puede cambiar de tipo, y eso no es un fallo mudo: se dice y se
  // devuelve `false` para que la tecla siga su camino.
  assert.equal(pulsar(editor, "Mod-Shift-7", avisar), false);
  assert.deepEqual(fallos, [
    "aquí no se puede cambiar el tipo: El bloque es de tipo table y no se puede cambiar",
  ]);
  assert.equal(editor.markdown(), antes);
});

test("con el cursor suelto Mod-Alt-c no hace nada y no se come la tecla", () => {
  const editor = crearEditorDePrueba([parrafo("const a = 1")]);
  editor.cursorEn("const");

  // Sin texto seleccionado no hay nada que marcar: se devuelve `false` en vez de
  // `true`, porque un atajo que se ocupa de la tecla sin hacer nada es un atajo
  // roto que además se come el carácter.
  assert.equal(pulsar(editor, "Mod-Alt-c"), false);
  assert.equal(editor.markdown(), "const a = 1");
});

test("Tab en una tabla lo pone TableKit, y aquí no se registra", () => {
  // `Tab` y `Shift-Tab` ya funcionan: `TableKit` mueve a la celda siguiente —y
  // añade una fila cuando no hay celda a la que ir—, y `StarterKit` sangra en las
  // listas. Registrarlos aquí los taparía: el plugin de este atajo se prueba antes,
  // así que una versión peor de lo mismo ganaría siempre.
  // Los atajos de `TableKit` se leen del campo de la extensión que los pone, que
  // es lo mismo que lee `ExtensionManager` al montar: si ahí desapareciera `Tab`,
  // este archivo tendría que traerlo, y el test lo dirá.
  const deTabla = getExtensionField(Table, "addKeyboardShortcuts")?.() as
    | Record<string, unknown>
    | undefined;
  assert.ok(deTabla?.Tab, "TableKit tiene que seguir tocando `Tab`");
  assert.ok(deTabla?.["Shift-Tab"], "TableKit tiene que seguir tocando `Shift-Tab`");

  const atajos = atajosDeBloque();
  assert.equal(atajos.Tab, undefined, "este archivo no registra `Tab`");
  assert.equal(atajos["Shift-Tab"], undefined, "este archivo no registra `Shift-Tab`");
});

test("nadie vuelve a registrar una tecla que ya funcionaba", () => {
  const atajos = atajosDeBloque();
  for (const { shortcut, deQuien } of TECLAS_DE_OTROS) {
    assert.equal(atajos[shortcut], undefined, `${shortcut} ya es de ${deQuien}`);
  }
});

/**
 * Los atajos que `StarterKit` ya pone, leídos de sus extensiones.
 *
 * Se leen de la extensión **resuelta** —con `flattenExtensions` sobre lo que
 * devuelve `resolveExtensions`— y no de un import suelto, porque `StarterKit` es
 * un paquete de metapaquetes: sus extensiones no se importan por nombre. Y se leen
 * de verdad, no de memoria, para que si una versión los quita este test avise.
 */
function atajosDeStarterKit(nombre: string): Record<string, unknown> {
  const extensiones = flattenExtensions(resolveExtensions([StarterKit], {} as never));
  const encontrado = extensiones.find((extension) => extension.name === nombre);
  assert.ok(encontrado, `StarterKit ya no trae la extensión «${nombre}»`);
  return (
    (getExtensionField(encontrado, "addKeyboardShortcuts", {
      options: encontrado.options,
    })?.() ?? {}) as Record<string, unknown>
  );
}

test("Mod-Alt-1 a 6 existían como alternancia; aquí gana poner el título", () => {
  // `StarterKit` ya traía `Mod-Alt-1` a `Mod-Alt-6`, pero como `toggleHeading`: la
  // segunda vez que se pulsaba sacaba el título. Aquí gana el atajo de bloque, que
  // pone el título siempre y lo deja igual que el botón del menú —y `setBlockType`
  // sustituye en vez de envolver, que es justo lo que la alternancia no hacía.
  //
  // Es lo único que se registra dos veces, y gana porque esta extensión va al final
  // de la lista y los plugins se prueban al revés. Si algún día se registrara
  // antes, esto dejaría de ser cierto, y el test de aquí lo dice.
  const deTitulos = atajosDeStarterKit("heading");
  const atajos = atajosDeBloque();
  for (const nivel of [1, 2, 3, 4, 5, 6]) {
    const shortcut = `Mod-Alt-${nivel}`;
    assert.ok(deTitulos[shortcut], `StarterKit debería seguir teniendo ${shortcut}`);
    assert.ok(atajos[shortcut], `este archivo tiene que tener ${shortcut}`);
  }

  // Y lo que gana es lo nuestro: dos veces seguidas deja el título puesto, no lo
  // saca. Un `true` a ciegas sería lo contrario: el atajo se comería la tecla y no
  // haría nada, que es como parece roto un botón.
  const editor = crearEditorDePrueba([parrafo("Hola")]);
  editor.cursorEn("Hola");
  assert.equal(pulsar(editor, "Mod-Alt-2"), true);
  assert.equal(editor.markdown(), "## Hola");
  assert.equal(pulsar(editor, "Mod-Alt-2"), true);
  assert.equal(editor.markdown(), "## Hola");
});

test("deshacer y rehacer ya estaban en StarterKit, así que aquí no se registran", () => {
  // Los tres atajos del encargo que no aparecen en el mapa de aquí: `Mod-z`,
  // `Mod-Shift-z` y `Mod-y` los pone `StarterKit` con ese mismo comportamiento.
  // Volver a registrarlos no daría deshacer a quien no lo tenía: solo una segunda
  // oportunidad de romperlo, porque el de aquí se comería la tecla y su `false`
  // dejaría al otro sin oportunidad de actuar.
  const deDeshacer = atajosDeStarterKit("undoRedo");
  // El nombre va escrito al revés (`Shift-Mod-z`) porque es como lo escribió
  // `StarterKit`, y da igual: `prosemirror-keymap` normaliza los modificadores
  // antes de mirar nada, así que las dos formas son la misma tecla.
  assert.ok(deDeshacer["Mod-z"], "StarterKit debería seguir teniendo `Mod-z`");
  assert.ok(deDeshacer["Shift-Mod-z"], "StarterKit debería seguir teniendo `Mod-Shift-z`");
  assert.ok(deDeshacer["Mod-y"], "StarterKit debería seguir teniendo `Mod-y`");

  const atajos = atajosDeBloque();
  for (const shortcut of ["Mod-z", "Mod-Shift-z", "Mod-y"]) {
    assert.equal(atajos[shortcut], undefined, `${shortcut} ya lo pone StarterKit`);
  }
});

test("cada rótulo va con su tecla, y no hay dos atajos con la misma", () => {
  const atajos = Object.keys(atajosDeBloque()).sort();
  assert.deepEqual(
    EDITOR_SHORTCUTS.map((atajo) => atajo.shortcut).sort(),
    atajos,
    "un rótulo sin atajo o un atajo sin rótulo",
  );
  assert.deepEqual(
    new Set(atajos).size,
    atajos.length,
    "hay dos atajos con la misma tecla y el segundo no se pulsa nunca",
  );
  for (const atajo of EDITOR_SHORTCUTS) {
    assert.ok(atajo.label.trim().length > 0, `${atajo.shortcut} no tiene rótulo`);
  }
  // Los rótulos son en español, y no en inglés con SOME_KEY constante.
  const enEspanol = EDITOR_SHORTCUTS.filter((atajo) => /[áéíóúñ¿¡]/.test(atajo.label));
  assert.ok(enEspanol.length > 0, "los rótulos no están en español");
});

test("Mod es la tecla del sistema y la otra no se come el atajo", () => {
  // `Mod` significa «la tecla que aquí es atajo»: Ctrl en Windows y Linux, ⌘ en
  // macOS. Lo que no vale es que el atajo funcione con **las dos**, porque entonces
  // no sería un atajo del sistema sino uno escrito a ojo.
  const conMod = crearEditorDePrueba([parrafo("Uno")]);
  conMod.seleccionar("Uno");
  assert.equal(pulsar(conMod, "Mod-Shift-7"), true);

  const conLaotra = crearEditorDePrueba([parrafo("Uno")]);
  conLaotra.seleccionar("Uno");
  const evento = eventoDe("Mod-Shift-7");
  const teclado = keydownHandler(atajosDeBloque());
  const manejado = teclado(vistaDe(conLaotra), {
    ...evento,
    ctrlKey: ES_MAC,
    metaKey: !ES_MAC,
  } as KeyboardEvent);
  assert.equal(manejado, false, "el atajo no debería funcionar con la tecla que no es Mod aquí");
  assert.equal(conLaotra.markdown(), "Uno");
});

test("la extensión instala el teclado y el aviso llega al que lo pasa", () => {
  // El mapa de arriba es la lógica; esto es el cableado: que la extensión monte el
  // plugin y que el `report` que le da quien la registra sea el que se entera. Sin
  // esto, un atajo podría ser correcto y no estar puesto en el editor.
  const fallos: string[] = [];
  const avisar: ReportFailure = (que, error) => {
    fallos.push(`${que}: ${error instanceof Error ? error.message : String(error)}`);
  };
  const plugins = getExtensionField(
    KeyboardNote.configure({ report: avisar }),
    "addProseMirrorPlugins",
    { name: "noteKeyboard", options: { report: avisar } },
  )?.();
  assert.equal(plugins?.length, 1, "la extensión tiene que instalar su plugin");
  const manejar = plugins?.[0].props?.handleKeyDown as unknown as
    | ((vista: EditorView, evento: KeyboardEvent) => boolean)
    | undefined;
  assert.ok(manejar, "el plugin tiene que mirar las teclas");

  const editor = crearEditorDePrueba([tabla(fila("A", "B"))]);
  editor.seleccionar("A");
  assert.equal(manejar(vistaDe(editor), eventoDe("Mod-Shift-7")), false);
  assert.deepEqual(fallos, [
    "aquí no se puede cambiar el tipo: El bloque es de tipo table y no se puede cambiar",
  ]);
});