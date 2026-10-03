import { getSchema } from "@tiptap/core";
import type { Command, CommandProps } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Schema } from "@tiptap/pm/model";

import { createEditorExtensions } from "./extensions/index.ts";
import type { EditorExtensionOptions } from "./extensions/index.ts";
import { createNoteMarkdownManager } from "./markdown/manager.ts";

/**
 * Tiptap por debajo, en Node y sin navegador.
 *
 * Los tests del editor ya no leen el código como texto: pueden decir que el
 * botón llama a la función correcta, pero **no ejecutan el comando**. Y el fallo
 * que más ha costado —«al cambiar el tipo de texto desaparece todo»— es justo
 * un fallo de ejecución: depende de lo que haga ProseMirror con la
 * transacción, no de cómo se llama la función.
 *
 * Tiptap se monta sin DOM, así que aquí no hay casi nada que inventar:
 *
 * - El **esquema** sale de las mismas extensiones que el editor de verdad, con
 *   `getSchema(...)`. **Sin** `resolveExtensions` delante: `getSchema` ya aplana
 *   la lista, y aplanar dos veces deja cada extensión de `StarterKit` dos veces,
 *   que es lo que hace que Tiptap avise de nombres duplicados en cada test. Si
 *   el registro de extensiones se rompe, este arnés se rompe con él: los tests
 *   no pueden estar probando un editor distinto del que se enseña.
 * - El **estado** es un `EditorState` de verdad y el `dispatch` aplica la
 *   transacción, como el de la vista.
 * - El **Markdown** sale del mismo `MarkdownManager` que el editor, que serializa
 *   sin necesidad de un navegador. Es lo que se guarda en el disco, así que es
 *   donde se ve si un documento raro revienta.
 * - Los `props` de los comandos son los mismos que construye Tiptap, con
 *   `CommandManager`: por eso los comandos de `commands.ts` se ejecutan aquí
 *   exactamente igual que en el editor, sin una versión de mentira.
 */
export interface TestEditor {
  schema: Schema;
  /** El documento tal y como está ahora mismo. */
  estado(): EditorState;
  /** Texto plano de la nota, con los bloques separados por salto de línea. */
  texto(): string;
  /** Selecciona el texto con ese contenido exacto. */
  seleccionar(texto: string): void;
  /** Selecciona la nota entera, del primer al último carácter. */
  seleccionarTodo(): void;
  /** Coloca un cursor vacío donde esté ese texto. */
  cursorEn(texto: string): void;
  /** Aplica una transacción, como el `dispatch` de la vista. */
  despachar(tr: Transaction): void;
  /** Corre un comando como `editor.commands.x()` y devuelve si se aplicó. */
  ejecutar(command: Command): boolean;
  /** El Markdown que sale del documento ahora mismo, como en la app. */
  markdown(): string;
  /**
   * Comprueba que el documento sigue siendo legal.
   *
   * `NodeType.create` **no** valida el contenido: deja construir bloques que
   * ProseMirror no había visto nunca —un `listItem` con un `text` suelto— que
   * luego no serializan y que al editar saltan. Aquí cada cambio se comprueba,
   * para que un documento raro se vea en el test y no en la nota de alguien.
   */
  validar(): void;
}

/**
 * Levanta el editor de pruebas.
 *
 * `bloques` son los nodos de la nota inicial, en JSON de ProseMirror.
 */
export function crearEditorDePrueba(
  bloques: unknown[],
  opciones?: EditorExtensionOptions,
): TestEditor {
  const extensiones = createEditorExtensions({
    placeholder: "Escribe tu nota…",
    ...opciones,
  });
  const schema = getSchema(extensiones);
  const markdown = createNoteMarkdownManager(opciones);
  let estado = EditorState.create({
    doc: schema.nodeFromJSON({ type: "doc", content: bloques }) as never,
    schema,
    plugins: [],
  });

  const despachar = (tr: Transaction): void => {
    estado = estado.apply(tr);
  };

  /**
   * Los `props` de un comando, con lo mismo que usa `editor.commands`.
   *
   * Faltan el `editor` y la `view`, y a propósito: los comandos de este motor no
   * los tocan —todo lo que necesitan es el estado, la transacción y el
   * `dispatch`—, así que un `Editor` de mentira solo serviría para que un test
   * pasara por algo que en el navegador no existe. El `dispatch` **aplica** la
   * transacción, como el de la vista.
   */
  const propsDe = (): CommandProps => {
    const tr = estado.tr;
    return {
      tr,
      state: estado,
      dispatch: despachar,
    } as unknown as CommandProps;
  };

  /**
   * Dónde está un texto, aunque sea una parte de una frase.
   *
   * Se busca por trozo y no por nodo entero porque los tests escriben frases
   * («pon el cursor a media frase») y no tienen que partir la frase en tres
   * nodos de texto solo para poder colocar el cursor.
   */
  const buscar = (texto: string): { desde: number; hasta: number } => {
    let desde = -1;
    let hasta = -1;
    estado.doc.descendants((nodo, posicion) => {
      if (desde >= 0 || !nodo.isText) return;
      const donde = nodo.text?.indexOf(texto) ?? -1;
      if (donde < 0) return;
      desde = posicion + donde;
      hasta = desde + texto.length;
    });
    if (desde < 0) throw new Error(`El texto "${texto}" no está en la nota`);
    return { desde, hasta };
  };

  return {
    schema,
    estado: () => estado,
    texto: () => estado.doc.textBetween(0, estado.doc.content.size, "\n"),
    seleccionar(texto: string) {
      const { desde, hasta } = buscar(texto);
      despachar(estado.tr.setSelection(TextSelection.create(estado.doc, desde, hasta)));
    },
    seleccionarTodo() {
      // De los dos extremos del **primer** bloque de texto a los del **último**.
      // Con `0` y `content.size` los extremos caen en el `doc`, que no es un nodo
      // de texto, y `TextSelection` avisa en consola en vez de seleccionar.
      const bloquesDeTexto: [number, number][] = [];
      estado.doc.descendants((nodo, posicion) => {
        // Sin `return false`: en `descendants` eso significa «no bajes», y los
        // párrafos de una lista están debajo.
        if (nodo.isTextblock) bloquesDeTexto.push([posicion + 1, posicion + nodo.nodeSize - 1]);
        return undefined;
      });
      const primero = bloquesDeTexto[0];
      const ultimo = bloquesDeTexto[bloquesDeTexto.length - 1];
      if (!primero || !ultimo) throw new Error("La nota no tiene texto que seleccionar");
      despachar(
        estado.tr.setSelection(TextSelection.create(estado.doc, primero[0], ultimo[1])),
      );
    },
    cursorEn(texto: string) {
      const { desde } = buscar(texto);
      despachar(estado.tr.setSelection(TextSelection.create(estado.doc, desde)));
    },
    despachar,
    ejecutar(command: Command) {
      return command(propsDe());
    },
    markdown: () => markdown.serialize(estado.doc.toJSON()),
    validar() {
      estado.doc.check();
    },
  };
}