/**
 * Milkdown por debajo, en Node y sin navegador.
 *
 * Hasta ahora los tests del editor leían el código como texto: pueden decir que
 * el botón llama a la función correcta, pero **no ejecutan el comando**. Y el
 * fallo que más ha costado —«al cambiar el tipo de texto desaparece todo»— es
 * justo un fallo de ejecución: depende de lo que haga ProseMirror con la
 * transacción, no de cómo se llama la función.
 *
 * Así que aquí se monta el editor de verdad, sin DOM:
 *
 * - El **esquema** es el de Milkdown, construido con sus propios
 *   `*Schema`. Milkdown compone `doc` y `text` dentro de su plugin `schema` y no
 *   los exporta, así que se ponen a mano; son dos líneas y no cambian.
 * - El **gestor de comandos** también es el de Milkdown (`commandsCtx`), con los
 *   comandos de commonmark registrados por su propio `$command`.
 * - La **vista** es falsa y solo tiene lo que `CommandManager.call` necesita:
 *   `state` y `dispatch`. Ningún comando de tipo de bloque toca el DOM.
 *
 * Milkdown avisa de sus temporizadores con eventos de `window`, así que se le
 * da un `EventTarget` antes de arrancar. Sin eso revienta al marcar `CommandsReady`.
 */
import { Clock, Container, Ctx } from "@milkdown/kit/ctx";
import type { TimerType } from "@milkdown/kit/ctx";
import * as commonmark from "@milkdown/kit/preset/commonmark";
import {
  CommandsReady,
  SchemaReady,
  commandsCtx,
  commandsTimerCtx,
  editorViewCtx,
  marksCtx,
  nodesCtx,
  remarkCtx,
  remarkStringifyOptionsCtx,
  schemaCtx,
  serializer,
  serializerCtx,
} from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Los tipos de bloque que el menú del `+` ofrece. */
export type TipoDeBloque =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "quote";

const COMANDOS_POR_TIPO: Record<TipoDeBloque, string> = {
  paragraph: "turnIntoTextCommand",
  heading1: "wrapInHeadingCommand",
  heading2: "wrapInHeadingCommand",
  heading3: "wrapInHeadingCommand",
  bullet: "wrapInBulletListCommand",
  ordered: "wrapInOrderedListCommand",
  quote: "wrapInBlockquoteCommand",
};

const PAYLOAD_POR_TIPO: Partial<Record<TipoDeBloque, number>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

/** Un Milkdown mínimo pero de verdad: esquema, comandos y vista. */
export interface EditorDePrueba {
  ctx: Ctx;
  view: EditorView;
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
  /** Aplica un tipo de bloque y devuelve si el comando hizo algo. */
  aplicar(tipo: TipoDeBloque): boolean;
  /** El Markdown que sale del documento ahora mismo, como en la app. */
  markdown(): string;
  /**
   * Comprueba que el documento sigue siendo legal.
   *
   * `NodeType.create` **no** valida el contenido: deja construir bloques que
   * ProseMirror no había visto nunca —un `list_item` con un `text` suelto— que
   * luego no serializan y que al editar saltan. Aquí cada cambio se comprueba,
   * para que un documento raro se vea en el test y no en la nota de alguien.
   */
  validar(): void;
}

const POR_DEFECTO: Record<string, (arg: never) => unknown> = {
  // Milkdown los inyecta en el editor de verdad; aquí no hay quien los ponga.
  // Milkdown los llama al montar el spec, sin nodo todavía, así que tolerate.
  headingIdGenerator: (node: never) =>
    ((node as { textContent?: string } | undefined)?.textContent ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-"),
  sanitizeLinkHref: (href: never) => href,
};

/**
 * El orden en que el preset de commonmark declara sus esquemas.
 *
 * El orden importa: `paragraphSchema` lee `paragraphAttr` al construirse, así que
 * el `*Attr` tiene que estar puesto antes. Es la lista de
 * `commonmark/src/composed/schema.ts`. `headingIdGenerator` no se exporta, y por
 * eso `lectura.get` le da un valor por defecto.
 */
export const ORDEN_DEL_ESQUEMA: readonly string[] = [
  "docSchema",
  "paragraphAttr",
  "paragraphSchema",
  "headingAttr",
  "headingSchema",
  "hardbreakAttr",
  "hardbreakSchema",
  "blockquoteAttr",
  "blockquoteSchema",
  "codeBlockAttr",
  "codeBlockSchema",
  "hrAttr",
  "hrSchema",
  "imageAttr",
  "imageSchema",
  "bulletListAttr",
  "bulletListSchema",
  "orderedListAttr",
  "orderedListSchema",
  "listItemAttr",
  "listItemSchema",
  "emphasisAttr",
  "emphasisSchema",
  "strongAttr",
  "strongSchema",
  "inlineCodeAttr",
  "inlineCodeSchema",
  "linkAttr",
  "linkSchema",
  "htmlAttr",
  "htmlSchema",
  "textSchema",
];

/**
 * Da por resuelto un temporizador de Milkdown.
 *
 * Milkdown encadena sus plugins esperando a que otros terminen. Aquí solo hay un
 * plugin —el que se está probando—, así que el temporizador se marca como hecho
 * de inmediato. Sin esto el arranque se queda esperando forever.
 */
async function resolverTemporizador(ctx: Ctx, temporizador: TimerType) {
  if (ctx.isRecorded(temporizador)) return;
  ctx.record(temporizador);
  const esperando = ctx.wait(temporizador);
  ctx.done(temporizador);
  await esperando;
}

/**
 * Levanta el editor de pruebas.
 *
 * `bloques` son los nodos de la nota inicial, en JSON de ProseMirror.
 */
export async function crearEditorDePrueba(bloques: unknown[]): Promise<EditorDePrueba> {
  const ventana = new EventTarget();
  const global = globalThis as unknown as {
    addEventListener?: typeof ventana.addEventListener;
    removeEventListener?: typeof ventana.removeEventListener;
    dispatchEvent?: typeof ventana.dispatchEvent;
  };
  global.addEventListener ??= ventana.addEventListener.bind(ventana);
  global.removeEventListener ??= ventana.removeEventListener.bind(ventana);
  global.dispatchEvent ??= ventana.dispatchEvent.bind(ventana);

  const ctx = new Ctx(new Container(), new Clock(), {
    displayName: "EditorDePrueba",
    package: "@milkdown/kit",
    group: "Prueba",
  });
  // `remark` es el processor de Milkdown con `remark-parse` y `remark-stringify`
  // ya montados de serie; sin él no hay serializador.
  ctx.inject(remarkCtx);
  // Milkdown define aquí los `handlers` de sus nodos. `inject` sin valor usa justo
  // esos valores de fábrica, que es lo que hace el editor real.
  ctx.inject(remarkStringifyOptionsCtx);

  // Los esquemas se piden a Milkdown con un `get` tolerante: los specs leen
  // algunos valores del contexto que aquí no existen, y se les da su defecto.
  const lectura = {
    get(slice: never) {
      try {
        return ctx.get(slice);
      } catch (error) {
        const nombre = (slice as { name?: string } | undefined)?.name ?? String(slice);
        const defecto = POR_DEFECTO[nombre];
        if (!defecto) throw error;
        return defecto(undefined as never);
      }
    },
    set(slice: never, valor: unknown) {
      ctx.set(slice, valor);
    },
  };

  // Milkdown compone el esquema registrando sus plugins y leyendo `nodesCtx` y
  // `marksCtx`. Se hace igual: se corren los plugins en el mismo orden en que
  // el preset los declara —los `*Attr` van antes que el esquema que los usa— y
  // luego se lee lo que han dejado.
  ctx.inject(nodesCtx, []);
  ctx.inject(marksCtx, []);

  const puente = {
    inject: (t: never, v: unknown) => ctx.inject(t, v),
    set: (t: never, v: unknown) => ctx.set(t, v),
    update: (t: never, u: never) => ctx.update(t, u),
    use: (t: never) => ctx.use(t),
    isInjected: (t: never) => ctx.isInjected(t),
    record: (t: never) => ctx.record(t),
    done: (t: never) => ctx.done(t),
    wait: (t: never) => ctx.wait(t),
    get: lectura.get,
  };

  for (const nombre of ORDEN_DEL_ESQUEMA) {
    const exportado = (commonmark as unknown as Record<string, unknown>)[nombre];
    if (!exportado) continue;
    // `$nodeSchema` son dos plugins en uno —el que inyecta el spec y el nodo—,
    // y el preset los aplana con `.flat()`. Aquí también.
    for (const plugin of (Array.isArray(exportado) ? exportado : [exportado])) {
      const inyectable = plugin as { key?: never };
      if (inyectable.key) ctx.inject(inyectable.key);
      await (plugin as (c: typeof puente) => () => Promise<unknown>)(puente)();
    }
  }

  const nodes: Record<string, unknown> = {};
  const marks: Record<string, unknown> = {};
  for (const [id, spec] of ctx.get(nodesCtx)) nodes[id] = spec;
  for (const [id, spec] of ctx.get(marksCtx)) marks[id] = spec;
  const esquema = new Schema({ nodes, marks } as never);
  ctx.inject(schemaCtx, esquema);

  // El gestor de comandos de Milkdown, con los temporizadores ya resueltos.
  ctx.inject(commandsCtx);
  (ctx.get(commandsCtx) as unknown as { setCtx(c: Ctx): void }).setCtx(ctx);
  ctx.inject(commandsTimerCtx, [CommandsReady]);
  await resolverTemporizador(ctx, CommandsReady);

  const registro = commonmark as unknown as Record<
    string,
    (c: Ctx) => () => Promise<unknown>
  >;
  for (const nombre of new Set(Object.values(COMANDOS_POR_TIPO))) {
    // Dos paréntesis: el primero devuelve el arranque, el segundo lo ejecuta.
    await registro[nombre](ctx)();
  }
  // **La clave se lee después de registrar.** `$command` se pone `.key` himself
  // cuando corre, no antes: leerla antes da `undefined` y el `call` no encuentra
  // el comando. Es el mismo orden que usa el editor de verdad.
  const claveDe = (nombre: string): unknown =>
    (commonmark as unknown as Record<string, { key: unknown }>)[nombre].key;

  let estado = EditorState.create({
    doc: esquema.nodeFromJSON({ type: "doc", content: bloques }) as never,
    schema: esquema,
    plugins: [],
  });
  const view = {
    get state() {
      return estado;
    },
    dispatch: (transaccion: never) => {
      estado = estado.apply(transaccion);
    },
  } as unknown as EditorView;
  ctx.inject(editorViewCtx, view);

  const buscar = (texto: string): { desde: number; hasta: number } => {
    let desde = -1;
    let hasta = -1;
    estado.doc.descendants((nodo, posicion) => {
      if (nodo.isText && nodo.text === texto) {
        desde = posicion;
        hasta = posicion + nodo.nodeSize;
      }
    });
    if (desde < 0) throw new Error(`El texto "${texto}" no está en la nota`);
    return { desde, hasta };
  };

  const manager = ctx.get(commandsCtx) as unknown as {
    call(clave: unknown, payload?: unknown): boolean;
  };

  // El serializador de Milkdown, que es el que convierte el documento en el
  // Markdown que se guarda. Es donde se ve si un documento raro revienta.
  await resolverTemporizador(ctx, SchemaReady);
  await serializer(ctx)();

  const crudo = ctx.get(serializerCtx) as unknown as object;
  // El serializador de Milkdown es una función que se lleva el documento y
  // devuelve el Markdown, no un objeto con métodos.
  const serializador = crudo as (doc: unknown) => string;

  return {
    ctx,
    view,
    estado: () => estado,
    texto: () => estado.doc.textBetween(0, estado.doc.content.size, "\n"),
    seleccionar(texto: string) {
      const { desde, hasta } = buscar(texto);
      estado = estado.apply(estado.tr.setSelection(TextSelection.create(estado.doc, desde, hasta)));
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
      estado = estado.apply(
        estado.tr.setSelection(TextSelection.create(estado.doc, primero[0], ultimo[1])),
      );
    },
    cursorEn(texto: string) {
      const { desde } = buscar(texto);
      estado = estado.apply(estado.tr.setSelection(TextSelection.create(estado.doc, desde)));
    },
    aplicar(tipo: TipoDeBloque) {
      const nombre = COMANDOS_POR_TIPO[tipo];
      const payload = PAYLOAD_POR_TIPO[tipo];
      const clave = claveDe(nombre);
      return payload === undefined ? manager.call(clave) : manager.call(clave, payload);
    },
    markdown() {
      return serializador(estado.doc);
    },
    validar() {
      estado.doc.check();
    },
  };
}