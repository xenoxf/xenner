import type { CommandProps, Editor, NodeViewProps } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";

import { blockTypesInSelection } from "../../editor/block-type.ts";
import {
  leaveCaretBehind,
  setBlockType,
  type ReportFailure,
} from "../../editor/commands.ts";
import {
  EDITOR_BLOCK_TYPES,
  INSERT_MENU,
  SLASH_MENU,
  type MenuGroup,
  type MenuItem,
} from "../../editor/menu-content.ts";
import { loadNoteAssets, type NoteAssets } from "../../editor/markdown/assets.ts";
import type { NoteAttachmentActions, AttachmentMenuTarget } from "../../editor/extensions/index.ts";
import { getWorkspaceGateway } from "../../services/workspace/gateway";
import {
  deleteAssetForEditor,
  importImageForEditor,
  updateAssetForEditor,
} from "../../services/editorAssets.ts";
import { leaveEditor, registerNoteFlush } from "../../services/editorSession.ts";
import { notifyError, notifySuccess } from "../../services/toastService.ts";
import styles from "../../styles/components/NoteEditor.module.css";
import type { DrawingTool } from "../../types/drawing.ts";
import type {
  EditorBlockType,
  ImportedEditorAsset,
  NoteEditorHandle,
} from "../../types/editor.ts";
import { BlockHandle } from "./BlockHandle.tsx";
import { AttachmentMenu } from "./AttachmentMenu.tsx";
import { EditorStyleBar } from "./EditorStyleBar.tsx";
import { InsertMenu, itemKey } from "./InsertMenu.tsx";
import { SlashMenu } from "./SlashMenu.tsx";
import { TableControls } from "./TableControls.tsx";
import { WhiteboardNodeView } from "./WhiteboardNodeView.tsx";

export interface NoteEditorProps {
  /** Ruta de la nota, para leer y escribir assets de `.assets`. */
  notePath: string;
  /** Markdown que hay en la nota ahora mismo. */
  markdown: string;
  /** Cambia cuando la nota se ha recargado desde el disco. */
  reloadToken: number;
  onChange(markdown: string): void;
  onReady?(handle: NoteEditorHandle): void;
  onDispose?(): void;
  /**
   * Delegaciones al dock para el menú del `+`: elegir una imagen o un adjunto.
   *
   * El dock ya tiene los importadores, los diálogos del sistema y los avisos de
   * error montados; el editor no tiene ni idea de qué archivos hay. En vez de
   * duplicar eso, el menú devuelve el gesto.
   */
  requestImage?(): void;
  requestAttachment?(): void;
}

/** El texto de una nota vacía. */
const PLACEHOLDER = "Escribe tu nota…";

/** Los niveles de título que `setBlockType` no cubre: el menú `/` los tiene. */
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Dónde se coloca un menú, en coordenadas de la superficie. */
interface Placement {
  left: number;
  top: number;
}

/** El menú de una tarjeta de adjunto, y sobre qué tarjeta. */
interface AttachmentMenuState extends Placement {
  target: AttachmentMenuTarget;
}

interface SlashState extends Placement {
  /** La posición de la `/` que abrió el menú. */
  anchor: number;
  /** Lo escrito detrás de la `/`. */
  query: string;
}

/** Lo que un menú no puede hacer solo: elegir ficheros del sistema. */
interface MenuGestures {
  report: ReportFailure;
  requestImage(): void;
  requestAttachment(): void;
  insertWhiteboard(tool: DrawingTool): void;
}

/**
 * El editor: monta Tiptap a mano y le pone encima todo lo que Xenner le añade.
 *
 * El motor no sabe nada de Solid —no puede, para poder probarse en Node— así que
 * aquí se hace lo contrario de lo que hace `@tiptap/react`: nada de `useEditor` ni
 * de `EditorContent`. Se crea el editor en `onMount` contra un `<div>` propio y
 * se destruye en `onCleanup`.
 *
 * Que la interfaz reaccione a la selección se resuelve con **un** signal, un
 * número de versión que sube en cada transacción. Los menús no guardan una copia
 * de lo que hay seleccionado: lo leen del editor vivo cada vez que se pintan, y
 * por eso no se pueden desincronizar de lo que está pasando en el documento.
 */
export function NoteEditor(props: NoteEditorProps) {
  // Los tres `div` de la superficie. Solid asigna los `ref` al pintar, antes de
  // que corra ningún `onMount`, así que el editor se puede montar en el primero.
  /** El div que se le da al motor. */
  let root!: HTMLDivElement;
  /** Donde se colocan el asa y los menús, en coordenadas tuyas. */
  let surface!: HTMLDivElement;
  let editor: Editor | null = null;
  /**
   * Cómo se deshace el registro de entrega de `editorSession`.
   *
   * Vive en una variable y no en un `onCleanup` del efecto que lo crea porque
   * editor y registro se montan en la parte asíncrona del arranque, donde Solid
   * ya no tiene `owner`: un `onCleanup` ahí no registraría nada y el registro se
   * quedaría vivo para siempre.
   */
  let soltarEntrega: (() => void) | null = null;
  /**
   * El handle del motor vivo, que es lo que hay que vaciar de golpe.
   *
   * Va en su propia variable y no se usa el `onReady`: ese es el hook del dock, y
   * el registro de entrega tiene que ser cosa del editor, no del contenedor.
   */
  let entrega: NoteEditorHandle | null = null;
  let handle: NoteEditorHandle | null = null;
  let disposed = false;
  let lastReloadToken = props.reloadToken;
  /**
   * Última posición del cursor de TEXTO conocida.
   *
   * Insertar un bloque desde el dock puede llegar sin que el editor tenga el
   * foco, porque el botón está fuera del `contenteditable`, o con una selección
   * de nodo, la de una imagen marcada con un clic. Sin esto el bloque caía al
   * final de la nota.
   */
  let lastTextPos: number | null = null;
  /**
   * El documento como estaba antes de la última transacción.
   *
   * ProseMirror no lo guarda en la transacción, y es lo único que hay que mirar
   * para saber qué había **detrás** de la `/` que se acaba de escribir.
   */
  let docBefore: ProseNode | null = null;
  /**
   * El rango que había seleccionado al abrir el menú del `+`.
   *
   * Entre abrir y elegir el foco puede moverse —teclado, un clic que sí
   * desenfoca— y entonces el tipo se aplicaría al bloque equivocado o a
   * ninguno. Guardar el rango al abrir deja de depender de que siga vivo.
   */
  let blockRangeAtOpen: { from: number; to: number } | null = null;

  /**
   * La ruta dentro de `.assets` de cada `data:` URL de la nota.
   *
   * El motor lleva su propia copia para serializar; esta es la que necesita la
   * app para saber **qué fichero** sobrescribir al guardar un dibujo y cuál
   * borrar cuando acaba vacío.
   */
  const rutas = new Map<string, string>();
  const revisiones = new Map<string, string>();

  const [version, setVersion] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [insertMenu, setInsertMenu] = createSignal<Placement | null>(null);
  const [insertKey, setInsertKey] = createSignal<string | null>(null);
  const [blockType, setBlockTypeNow] = createSignal<EditorBlockType | null>(null);
  const [slash, setSlash] = createSignal<SlashState | null>(null);
  const [slashKey, setSlashKey] = createSignal<string | null>(null);
  const [attachmentMenu, setAttachmentMenu] = createSignal<AttachmentMenuState | null>(null);

  /**
   * Lo que una tarjeta de adjunto necesita de la interfaz.
   *
   * Va aquí porque son cuatro cosas que solo la app sabe hacer: preguntar al
   * gateway por el archivo, copiar al portapapeles, avisar de un fallo y abrir un
   * menú. El motor solo dibuja la tarjeta.
   */
  const attachmentActions: NoteAttachmentActions = {
    notePath: () => props.notePath,
    async open(notePath, assetPath) {
      await getWorkspaceGateway().openAsset(notePath, assetPath);
    },
    async reveal(notePath, assetPath) {
      await getWorkspaceGateway().revealAsset(notePath, assetPath);
    },
    async copy(_que, texto) {
      await copyToClipboard(texto);
    },
    report(what, error) {
      reportFailure(what, error);
    },
    menu(event, target) {
      setAttachmentMenu({
        target,
        left: event.clientX,
        top: event.clientY,
      });
    },
  };

  /**
   * Copiar al portapapeles del sistema.
   *
   * El `navigator.clipboard` del WebView no está en todas las plataformas, así que
   * hay un camino de reserva con un `<textarea>` fuera de la vista, que es lo que
   * funciona de verdad en un WebView antiguo. Si los dos fallan, el error se propaga
   * para que la tarjeta lo diga: un «Copiar» que no copia es peor que no tenerlo.
   */
  async function copyToClipboard(texto: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(texto);
        notifySuccess("Copiado", "");
        return;
      } catch {
        // El WebView puede rechazarla; se intenta el camino de reserva.
      }
    }
    if (typeof document === "undefined") throw new Error("El portapapeles no está disponible");
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copiado = document.execCommand("copy");
    area.remove();
    if (!copiado) throw new Error("El portapapeles no está disponible");
    notifySuccess("Copiado", "");
  }

  /**
   * Avisa de un fallo sin enterrarlo y sin dejar la vista a medias.
   *
   * Un `catch` mudo se come justo la excepción que lo explica —una transacción a
   * medio hacer deja la vista a medias, el serializador de Markdown falla sobre
   * ese documento, no se guarda nada y ProseMirror se queda sin poder despachar—,
   * y quien escribe se queda con un texto que desaparece sin explicación. Un
   * fallo se avisa por consola **y** se le dice a quien escribe.
   */
  function reportFailure(what: string, error: unknown): void {
    console.error(`xenner: ${what}`, error);
    notifyError("No se pudo aplicar el formato", what);
  }

  // --- Assets --------------------------------------------------------------

  function adoptar(assets: NoteAssets): void {
    rutas.clear();
    for (const [dataUrl, ruta] of assets.paths) rutas.set(dataUrl, ruta);
    revisiones.clear();
    for (const [dataUrl, revision] of assets.revisions) revisiones.set(dataUrl, revision);
  }

  /**
   * Guarda el SVG de un dibujo.
   *
   * Si la pizarra ya tenía fichero se **sobrescribe**, que es lo que quiere quien
   * dibuja encima; si el dibujo cambió de identidad —se copió desde otro— entra
   * como uno nuevo, porque un solo fichero no puede ser las dos cosas.
   */
  async function saveWhiteboard(
    svg: string,
    currentSrc: string,
    options?: { notify?: boolean; copy?: boolean },
  ): Promise<string | null> {
    try {
      const file = new File([svg], "pizarra.svg", { type: "image/svg+xml" });
      const ruta = rutas.get(currentSrc);
      const guardado =
        ruta && !options?.copy
          ? await updateAssetForEditor(props.notePath, ruta, file, revisiones.get(currentSrc))
          : await importImageForEditor(props.notePath, file);
      rutas.delete(currentSrc);
      revisiones.delete(currentSrc);
      rutas.set(guardado.dataUrl, guardado.relativePath);
      if (guardado.revision) revisiones.set(guardado.dataUrl, guardado.revision);
      if (options?.notify !== false) {
        notifySuccess(ruta ? "Pizarra actualizada" : "Pizarra guardada");
      }
      return guardado.dataUrl;
    } catch (error) {
      notifyError("No se pudo guardar la pizarra", error);
      return null;
    }
  }

  async function deleteWhiteboardAsset(dataUrl: string): Promise<void> {
    const ruta = rutas.get(dataUrl);
    if (!ruta) return;
    await deleteAssetForEditor(props.notePath, ruta);
    rutas.delete(dataUrl);
    revisiones.delete(dataUrl);
  }

  /** El motor no sabe qué hay en el disco: se lo pregunta a quien lo ha montado. */
  async function importWhiteboardAsset(
    svg: string,
    fileName: string,
  ): Promise<ImportedEditorAsset> {
    const file = new File([svg], fileName, { type: "image/svg+xml" });
    const imported = await importImageForEditor(props.notePath, file);
    rutas.set(imported.dataUrl, imported.relativePath);
    if (imported.revision) revisiones.set(imported.dataUrl, imported.revision);
    return imported;
  }

  /**
   * La nota tal y como está en el disco, con sus assets.
   *
   * Con un lienzo abierto hay que cerrarlo antes: su nodo desaparece al cambiar el
   * documento, y lo que no se haya guardado se perdería sin avisar.
   */
  async function reloadSource(): Promise<{ markdown: string; assets: NoteAssets }> {
    if (!(await leaveEditor())) throw new Error("El dibujo que había abierto no se pudo cerrar");
    const assets = await loadNoteAssets(props.notePath, props.markdown);
    adoptar(assets);
    return { markdown: props.markdown, assets };
  }

  // --- Menús ---------------------------------------------------------------

  function liveEditor(): Editor | null {
    return editor && !editor.isDestroyed ? editor : null;
  }

  /**
   * Deja el cursor donde se pueda escribir.
   *
   * El menú se puede abrir con una imagen o un dibujo marcado, porque un clic
   * también los selecciona, y un nodo entero no es un sitio donde insertar nada.
   * Se vuelve al último texto que se escribió, que es donde estaba el cursor antes
   * de ese clic. Idempotente: si ya hay un cursor de texto, no toca nada.
   */
  function volverAlTexto(): void {
    const instance = liveEditor();
    if (!instance || lastTextPos === null) return;
    if (instance.state.selection.$from.parent.isTextblock) return;
    const size = instance.state.doc.content.size;
    const pos = Math.min(Math.max(lastTextPos, 0), size);
    instance.view.dispatch(
      instance.state.tr.setSelection(
        TextSelection.near(instance.state.doc.resolve(pos), 1),
      ),
    );
  }

  const gestures: MenuGestures = {
    report: reportFailure,
    requestImage() {
      volverAlTexto();
      props.requestImage?.();
    },
    requestAttachment() {
      volverAlTexto();
      props.requestAttachment?.();
    },
    insertWhiteboard(tool) {
      volverAlTexto();
      void handle?.insertWhiteboard(tool);
    },
  };

  function toggleInsertMenu(anchor: DOMRect): void {
    if (insertMenu()) {
      closeInsertMenu();
      return;
    }
    const instance = liveEditor();
    if (!instance) return;
    const { selection } = instance.state;
    blockRangeAtOpen = { from: selection.from, to: selection.to };
    // Con más de un tipo en la selección no hay uno que poner de relieve.
    const tipos = blockTypesInSelection(instance.state.doc, selection.from, selection.to);
    setBlockTypeNow(tipos.size === 1 ? [...tipos][0] : null);
    const bounds = surface.getBoundingClientRect();
    setInsertMenu({
      // A la derecha del asa y a su altura: pegado al `+` que se ha pulsado, no
      // encima del texto que se está escribiendo. Se mide el rectángulo real del
      // asa porque calcular la posición a mano es justo lo que salía mal.
      left: Math.max(8, Math.min(anchor.right - bounds.left + 8, bounds.width - 244)),
      top: Math.max(0, anchor.top - bounds.top),
    });
    const items = insertItems();
    setInsertKey(items.length ? itemKey(items[0]) : null);
  }

  function closeInsertMenu(): void {
    setInsertMenu(null);
    setBlockTypeNow(null);
    blockRangeAtOpen = null;
  }

  function chooseInsertItem(item: MenuItem): void {
    const instance = liveEditor();
    const rango = blockRangeAtOpen;
    closeInsertMenu();
    if (!instance) return;
    if (item.kind === "image") {
      gestures.requestImage();
      return;
    }
    if (item.kind === "attachment") {
      gestures.requestAttachment();
      return;
    }
    if (item.kind === "whiteboard") {
      gestures.insertWhiteboard("pen");
      return;
    }
    if (item.kind !== "block") return;
    const type = asBlockType(item.id);
    if (!type) {
      reportFailure("el menú pide un tipo que no existe", item.id);
      return;
    }
    if (!rango) return;
    const applied = instance.commands.command((commandProps) => {
      if (!selectRange(commandProps, rango.from, rango.to)) return false;
      if (!setBlockType(type, reportFailure)(commandProps)) return false;
      // Sin esto la selección se queda puesta y lo siguiente que se escriba
      // sustituye el texto entero: cambiar el tipo y seguir escribiendo borra lo
      // que se acaba de formatear.
      return leaveCaretBehind(reportFailure)(commandProps);
    });
    if (applied) instance.view.focus();
  }

  /**
   * Repone un rango dentro de texto, o dice que no se puede.
   *
   * Un rango guardado puede acabar entre bloques —una imagen marcada con un clic
   * tiene sus extremos fuera del texto— y una selección así no la admite
   * ProseMirror. En ese caso se lleva al texto más cercano: es mejor aplicar el
   * cambio en el bloque de al lado que no aplicar nada.
   */
  function selectRange(props: CommandProps, from: number, to: number): boolean {
    const { doc } = props.tr;
    try {
      props.tr.setSelection(TextSelection.create(doc, from, to));
      return true;
    } catch {
      try {
        props.tr.setSelection(TextSelection.near(doc.resolve(from), 1));
        return true;
      } catch (error) {
        reportFailure("no hay texto donde aplicar el cambio", error);
        return false;
      }
    }
  }

  createEffect(() => {
    if (!insertMenu()) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-x='insert-menu']")) return;
      // El asa queda excepta y no por descuido: el gesto del `+` pasa por aquí,
      // así que el menú se cerraría antes de abrirse y nunca se vería.
      if (target.closest("[data-x='block-handle']")) return;
      closeInsertMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const items = insertItems();
      if (event.key === "Escape") {
        event.preventDefault();
        closeInsertMenu();
        liveEditor()?.view.focus();
        return;
      }
      if (items.length === 0) return;
      const indice = Math.max(0, items.findIndex((item) => itemKey(item) === insertKey()));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const paso = event.key === "ArrowDown" ? 1 : -1;
        setInsertKey(itemKey(items[(indice + paso + items.length) % items.length]));
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      // Con el foco en el editor esas dos teclas son suyas —un espacio en medio de
      // una palabra, un Enter que parte el bloque— y el menú se cierra con Escape
      // o con un clic. Solo se comen cuando el foco está en el asa, que es como se
      // abre el menú con el teclado.
      if (liveEditor()?.view.hasFocus()) return;
      event.preventDefault();
      chooseInsertItem(items[indice]);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    });
  });

  const slashGroups = createMemo<MenuGroup[]>(() => {
    const open = slash();
    if (!open) return [];
    const needle = foldForSearch(open.query);
    return SLASH_MENU.map((group) => ({
      group: group.group,
      items: group.items.filter((item) => !needle || foldForSearch(item.label).includes(needle)),
    })).filter((group) => group.items.length > 0);
  });

  const slashMatches = createMemo<MenuItem[]>(() =>
    slashGroups().flatMap((group) => group.items),
  );

  function closeSlash(): void {
    setSlash(null);
    setSlashKey(null);
  }

  function openSlash(instance: Editor, anchor: number): void {
    const cursor = instance.state.selection.from;
    if (anchor >= cursor) return;
    const coords = instance.view.coordsAtPos(anchor);
    const bounds = surface.getBoundingClientRect();
    const query = instance.state.doc.textBetween(anchor + 1, cursor, " ");
    const items = matchesFor(query);
    setSlash({
      anchor,
      query,
      left: Math.max(8, Math.min(coords.left - bounds.left, bounds.width - 308)),
      top: coords.bottom - bounds.top + 6,
    });
    setSlashKey(items.length ? itemKey(items[0]) : null);
  }

  /**
   * Sigue la `/` que se está escribiendo.
   *
   * Se comprueba en cada transacción porque no hay ningún otro sitio donde
   * enterarse: el menú se abre con el texto insertado y se cierra en cuanto lo
   * escrito deja de ser una palabra —un espacio, otro bloque, el cursor que se
   * va—.
   */
  function trackSlash(transaction: Transaction, before: ProseNode | null): void {
    const instance = liveEditor();
    if (!instance) return;
    const typed = before ? slashJustTyped(transaction, before) : null;
    if (typed !== null) {
      openSlash(instance, typed);
      return;
    }
    const open = slash();
    if (!open) return;
    if (isStillQuerying(instance, open.anchor)) openSlash(instance, open.anchor);
    else closeSlash();
  }

  function chooseSlashItem(item: MenuItem): void {
    const instance = liveEditor();
    const open = slash();
    closeSlash();
    if (!instance || !open) return;
    // El borrado de «/lo escrito» y el cambio van en la **misma** transacción:
    // en dos, deshacer dejaría la `/` colgando en medio del texto.
    const applied = instance.commands.command((commandProps) => {
      const cursor = commandProps.state.selection.from;
      if (cursor < open.anchor) return false;
      commandProps.tr.delete(open.anchor, cursor);
      const $anchor = commandProps.tr.doc.resolve(open.anchor);
      if (!$anchor.parent.isTextblock) return false;
      commandProps.tr.setSelection(TextSelection.near($anchor, 1));
      return applyMenuItem(item, commandProps, gestures);
    });
    if (!applied) reportFailure("no se pudo insertar el bloque", "el comando no hizo nada");
    instance.view.focus();
  }

  createEffect(() => {
    if (!slash()) return;
    // Se escucha en `document` y en captura porque el foco lo tiene el editor,
    // que es donde hay que escribir detrás de la `/`: un manejador dentro de la
    // caja del menú no recibiría nada.
    const onKeyDown = (event: KeyboardEvent): void => {
      const matches = slashMatches();
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlash();
        return;
      }
      if (matches.length === 0) return;
      const indice = Math.max(0, matches.findIndex((item) => itemKey(item) === slashKey()));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const paso = event.key === "ArrowDown" ? 1 : -1;
        setSlashKey(itemKey(matches[(indice + paso + matches.length) % matches.length]));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        chooseSlashItem(matches[indice]);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
  });

  // --- Montaje -------------------------------------------------------------

  /**
   * Sube la versión y recuerda dónde estaba el cursor.
   *
   * Se escucha `transaction` y no `update` porque aquí interesa cualquier cambio
   * de estado, también los que no tocan el documento: mover el cursor, abrir una
   * tabla, deshacer.
   */
  function onTransaction({ transaction }: { transaction: Transaction }): void {
    const instance = liveEditor();
    if (instance) {
      if (instance.state.selection.$from.parent.isTextblock) {
        lastTextPos = instance.state.selection.from;
      }
      trackSlash(transaction, docBefore);
      docBefore = instance.state.doc;
    }
    setVersion((current) => current + 1);
  }

  onMount(() => {
    // Los assets se leen **antes** de crear el editor: el Markdown que se le da
    // ya lleva las imágenes como `data:` y el mapa con el que volver a ponerlas
    // como rutas. Después de un `await` Solid ya no tiene `owner`, así que todo lo
    // que hay que limpiar se registra en la parte síncrona y no se pierde.
    void (async () => {
      if (disposed) return;
      try {
        const loaded = await loadNoteAssets(props.notePath, props.markdown);
        if (disposed) return;
        adoptar(loaded);
        /**
         * El motor entra por `import()` diferido.
         *
         * Tiptap, KaTeX y el resaltado de código son del orden de 400 kB
         * comprimidos, y ninguno hace falta para ver la lista de notas: hace falta
         * cuando alguien abre una nota para escribir. Con la importación
         * estática, esa descarga ocurre al arrancar la app, antes de que nadie
         * haya decidido escribir nada.
         *
         * No hay import estático a propósito: el `import()` de aquí **sí** le da
         * al compilador la firma de `createNoteEditor`, así que si cambia, esto
         * deja de compilar. Un `import type` aparte no añadiría nada.
         */
        const { createNoteEditor } = await import("../../editor/create-editor.ts");
        if (disposed) return;
        const instance = createNoteEditor({
          element: root,
          initialMarkdown: loaded.markdown,
          assets: loaded,
          placeholder: PLACEHOLDER,
          onChange(markdown) {
            if (!disposed) props.onChange(markdown);
          },
          reloadSource,
          importWhiteboardAsset,
          reportFailure,
          attachment: attachmentActions,
          // El motor entrega su handle al montar, y el dock es quien lo usa.
          onReady(instance) {
            handle = instance;
            // El handle es lo único que sabe vaciar el retardo de guardado, así que
            // se guarda para el registro de entrega. Sin esto, el registro se
            // registraría contra un editor vacío.
            entrega = instance;
            props.onReady?.(instance);
          },
          // La vista rica de la pizarra es de Solid y el motor no importa Solid:
          // se la inyecta quien lo monta.
          whiteboard: {
            onSave: saveWhiteboard,
            onDeleteAsset: deleteWhiteboardAsset,
            // `NodeViewProps` es `NodeViewRendererProps` más lo que usa el enlace
            // con React, que aquí no se usa: de la vista solo hacen falta `node`,
            // `view` y `getPos`.
            renderNodeView: (nodeProps) =>
              WhiteboardNodeView(nodeProps as NodeViewProps, {
                onSave: saveWhiteboard,
                onDeleteAsset: deleteWhiteboardAsset,
              }),
          },
          });
        if (disposed) {
          instance.destroy();
          return;
        }
        editor = instance;
        docBefore = instance.state.doc;
        /**
         * El editor entrega su Markdown con retardo, y algo tiene que vaciar ese
         * retardo **antes** de que el documento cambie de nota.
         *
         * Sin esto, cambiar de nota, borrar o renombrar dejaban atrás los últimos
         * milisegundos escritos: el almacén ya había movido el documento cuando el
         * editor entregaba lo último. Se registra en `leaveEditor()`, al que llaman
         * todas las rutas que cierran la nota, en vez de acordarse en cada una.
         *
         * Se registra **después** de comprobar `disposed`, y se deshace en el
         * `onCleanup`: un editor ya destruido que siga registrado escribiría en
         * una nota que ya no es la suya.
         */
        soltarEntrega = registerNoteFlush(() => {
          if (entrega) entrega.flush();
        });
        instance.on("transaction", onTransaction);
        instance.on("focus", () => setVersion((current) => current + 1));
        instance.on("blur", () => setVersion((current) => current + 1));
        setReady(true);
      } catch (cause) {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "No se pudo iniciar el editor");
        notifyError("No se pudo abrir el editor", cause instanceof Error ? cause.message : "");
      }
    })();
  });

  createEffect(() => {
    const token = props.reloadToken;
    if (token === lastReloadToken) return;
    lastReloadToken = token;
    // `handle.reload()` cambia el contenido del editor que ya está montado: no
    // se crea otro encima ni se deja el primero sin poder despachar.
    void handle?.reload();
  });

  onCleanup(() => {
    disposed = true;
    setInsertMenu(null);
    setSlash(null);
    props.onDispose?.();
    // Antes de destruir nada: `destroy` entrega lo pendiente una última vez, y esa
    // entrega tiene que llegar a la nota de la que aún estamos dentro.
    soltarEntrega?.();
    soltarEntrega = null;
    entrega = null;
    editor?.destroy();
    editor = null;
    handle = null;
  });

  return (
    <div class={styles.shell} data-x="editor">
      {/* La barra de formato va **antes** de la superficie y se queda pegada al
          borde de arriba mientras se desplaza la nota: es fija porque el tipo de
          bloque y el formato tienen que estar a la vista en todo momento, que es
          lo que hace que nadie necesite acordarse de que esto es Markdown. Se
          monta aunque el editor todavía no esté: si no, la columna daría un salto
          al terminar de leer los assets de la nota. */}
      <EditorStyleBar
        editor={ready() ? editor : null}
        version={version}
        report={reportFailure}
      />
      <div
        ref={(element) => (surface = element)}
        class={styles.surface}
        data-x="editor-surface"
      >
        <div ref={(element) => (root = element)} class={styles.editor} data-x="editor-root" />

        <Show
          when={ready() ? editor : null}
          keyed
          fallback={
            <Show
              when={error()}
              fallback={
                <div class={styles.loading} role="status">
                  Preparando editor…
                </div>
              }
            >
              {(message) => (
                <div class={`${styles.loading} ${styles.error}`} role="alert">
                  {message()}
                </div>
              )}
            </Show>
          }
        >
          {(instance) => (
            <>
              <BlockHandle editor={instance} version={version} onToggleMenu={toggleInsertMenu} />
              {/* La barrita de la tabla se coloca en coordenadas de la superficie,
                  que es lo que mueve con la columna. */}
              <TableControls editor={instance} version={version} surface={surface} />
            </>
          )}
        </Show>

        <Show when={insertMenu()}>
          {(placement) => (
            <InsertMenu
              groups={INSERT_MENU}
              placement={placement()}
              activeKey={insertKey()}
              activeBlock={blockType()}
              onHover={(item) => setInsertKey(itemKey(item))}
              onChoose={chooseInsertItem}
              onClose={closeInsertMenu}
            />
          )}
        </Show>
        <Show when={slash()}>
          {(open) => (
            <SlashMenu
              groups={slashGroups()}
              placement={open()}
              activeKey={slashKey()}
              onHover={(item) => setSlashKey(itemKey(item))}
              onChoose={chooseSlashItem}
            />
          )}
        </Show>
        <Show when={attachmentMenu()} keyed>
          {(estado) => (
            <AttachmentMenu
              target={estado.target}
              x={estado.left}
              y={estado.top}
              onClose={() => setAttachmentMenu(null)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

// --- Lo que hace cada entrada de un menú -----------------------------------

/** Las entradas del `+`, en el orden en que se leen y se recorren con las flechas. */
function insertItems(): MenuItem[] {
  return INSERT_MENU.flatMap((group) => group.items);
}

/** Las entradas del menú `/` que casan con lo escrito detrás de la `/`. */
function matchesFor(query: string): MenuItem[] {
  const needle = foldForSearch(query);
  return SLASH_MENU.flatMap((group) => group.items).filter(
    (item) => !needle || foldForSearch(item.label).includes(needle),
  );
}

/**
 * Lo que hay que hacer al elegir una entrada, dentro de la transacción que ya se
 * está montando.
 *
 * Los comandos del motor reciben `props`, que **es** esa transacción: por eso el
 * borrado de la `/` y el cambio que se pide salen en un solo deshacer.
 */
function applyMenuItem(
  item: MenuItem,
  props: CommandProps,
  gestures: MenuGestures,
): boolean {
  switch (item.kind) {
    case "block": {
      const level = headingLevel(item.id);
      // Los títulos de 4 a 6 no son un tipo del `+`: son un `heading` con otro
      // `level`, y se ponen con su propio comando.
      if (level !== null && level > 3) return props.commands.setHeading({ level });
      const type = asBlockType(item.id);
      if (!type) {
        gestures.report("ese tipo de bloque no existe", item.id);
        return false;
      }
      if (!setBlockType(type, gestures.report)(props)) return false;
      // Sin `leaveCaretBehind` a propósito, que en el menú del `+` sí hace falta:
      // aquí el cursor se acaba de poner donde se estaba escribiendo y ahí es
      // donde se quiere seguir escribiendo —el título que se está empezando—,
      // no al final de la línea.
      return true;
    }
    case "divider":
      return props.commands.setHorizontalRule();
    case "codeBlock":
      return props.commands.toggleCodeBlock();
    case "taskList":
      return props.commands.toggleTaskList();
    case "table":
      return props.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    // No hay forma de pedir la fórmula en un diálogo sin perder la selección, y
    // el nodo se puede editar en el sitio: entra una de ejemplo y se cambia.
    case "math":
      return props.commands.insertBlockMath({ latex: "x^2" });
    // Las tres cosas de la app son el gesto y nada más: elegir un fichero del
    // sistema, o un dibujo que abrir, es cosa del dock.
    case "image":
      gestures.requestImage();
      return true;
    case "attachment":
      gestures.requestAttachment();
      return true;
    case "whiteboard":
      gestures.insertWhiteboard("pen");
      return true;
  }
}

/**
 * El tipo del `+` detrás de un id, o `null` si no es uno de los siete.
 *
 * Se compara con el catálogo del motor y no con el esquema del editor: así se
 * puede comprobar una entrada del menú sin montar un editor entero.
 */
function asBlockType(id: string | null | undefined): EditorBlockType | null {
  return EDITOR_BLOCK_TYPES.find((type) => type === id) ?? null;
}

/** El nivel de un `heading1`…`heading6`, o `null` si el id no es un título. */
function headingLevel(id: string | null | undefined): HeadingLevel | null {
  const encontrado = /^heading([1-6])$/.exec(id ?? "");
  return encontrado ? (Number(encontrado[1]) as HeadingLevel) : null;
}

/**
 * Buscar sin tildes ni mayúsculas.
 *
 * «Titulo» tiene que encontrar «Título»: en una nota se escribe como se habla,
 * sin acordarse de cómo se acutea cada letra.
 */
function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * La `/` recién escrita, o `null` si esta transacción no ha abierto el menú.
 *
 * Se mira el texto **insertado** en el paso, no el documento entero: escribir `/`
 * en un enlace, pegarla dentro de una palabra o borrarla después no debe abrir
 * nada.
 */
function slashJustTyped(transaction: Transaction, before: ProseNode): number | null {
  if (!transaction.docChanged) return null;
  const cursor = transaction.selection.from;
  for (const step of transaction.steps) {
    if (!(step instanceof ReplaceStep)) continue;
    // Solo texto suelto: un paso que envuelve bloques no tiene una posición que
    // se pueda comparar con el cursor.
    if (step.slice.openStart !== 0 || step.slice.openEnd !== 0) continue;
    const text = step.slice.content.textBetween(0, step.slice.content.size, " ", "￼");
    if (!text) continue;
    // Lo insertado tiene que acabar en el cursor: si no, lo que se ha escrito no
    // es lo que está bajo el cursor.
    if (step.from + text.length !== cursor) continue;
    const at = text.indexOf("/");
    if (at < 0) continue;
    const position = step.from + at;
    if (position + 1 !== cursor) continue;
    if (!canOpenSlash(before, position)) continue;
    return position;
  }
  return null;
}

/**
 * Si en esa posición se puede abrir el menú de la `/`.
 *
 * Al principio de un bloque o detrás de un espacio, y nunca dentro de código:
 * una `/` en un bloque de código es una división, no una llamada.
 */
function canOpenSlash(before: ProseNode, position: number): boolean {
  try {
    const $pos = before.resolve(position);
    if (!$pos.parent.isTextblock || $pos.parent.type.spec.code) return false;
    if (position === $pos.start()) return true;
    return /\s$/u.test(before.textBetween($pos.start(), position, " ", "￼"));
  } catch {
    return false;
  }
}

/**
 * Si lo que hay detrás de la `/` sigue siendo una búsqueda.
 *
 * En cuanto aparece un espacio la palabra se ha terminado y el menú se cierra:
 * es lo que hace `/titulo ` en cualquier editor de este tipo.
 */
function isStillQuerying(editor: Editor, anchor: number): boolean {
  const { selection, doc } = editor.state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return false;
  if (anchor < selection.$from.start() || anchor >= selection.from) return false;
  return /^[^\s/]*$/u.test(doc.textBetween(anchor + 1, selection.from, " "));
}
