import { createSignal } from "solid-js";

export type EditorMode = "text" | "whiteboard";

export interface WhiteboardSession {
  id: string;
  dirty: boolean;
  saving: boolean;
  save(closeAfter?: boolean): Promise<boolean>;
  close(): void;
}

interface WhiteboardSessionInput {
  id: string;
  save(closeAfter?: boolean): Promise<boolean>;
  close(): void;
}

const [editorMode, setEditorModeSignal] = createSignal<EditorMode>("text");
const [activeWhiteboard, setActiveWhiteboard] = createSignal<WhiteboardSession | null>(null);
let saveInFlight: Promise<boolean> | null = null;

/**
 * Las entregas pendientes del editor de la nota.
 *
 * El editor **no** guarda en el momento: entrega el Markdown con un retardo de
 * unos 250 ms, para que serializar la nota entera en cada pulsación no se note al
 * escribir. Ese retardo tiene una consecuencia que hay que cerrar: al cambiar de
 * nota, borrar, renombrar o cambiar de biblioteca, el almacén ya ha movido el
 * documento cuando el editor entrega lo último que escribió. Sin esto, esos
 * últimos 250 ms se pierden — y se pierden justo al borrar la nota en la que se
 * estaban escribiendo.
 *
 * Es un único registro porque solo hay un editor de nota vivo a la vez, y todo lo
 * que va a dejar de ser la nota actual pasa por `leaveEditor()`: una sola puerta
 * que cerrar en lugar de acordarse de vaciarla en cada sitio.
 */
let flushNote: (() => void) | null = null;

/**
 * Registra cómo entrega el editor de la nota lo que tiene pendiente.
 *
 * Devuelve la función que **deshace** el registro, para llamarla al desmontar el
 * editor. Sin ella, un editor ya destruido seguiría recibiendo `flush()` y
 * escribiría en una nota que ya no es la suya.
 */
export function registerNoteFlush(flush: () => void): () => void {
  flushNote = flush;
  return () => {
    if (flushNote === flush) flushNote = null;
  };
}

/** Entrega lo pendiente ahora mismo. Nunca lanza: un fallo aquí no se propaga. */
function flushActiveNote(): void {
  const flush = flushNote;
  if (!flush) return;
  try {
    flush();
  } catch (error) {
    console.error("xenner: no se pudo entregar el Markdown pendiente", error);
  }
}

export function getEditorMode(): EditorMode {
  return editorMode();
}

export function getActiveWhiteboard(): WhiteboardSession | null {
  return activeWhiteboard();
}

export function setEditorMode(mode: Exclude<EditorMode, "whiteboard">): void {
  if (activeWhiteboard()) return;
  setEditorModeValue(mode);
}

function setEditorModeValue(mode: EditorMode): void {
  setEditorModeSignal(mode);
}

export function registerWhiteboardSession(input: WhiteboardSessionInput): () => void {
  const session: WhiteboardSession = {
    ...input,
    dirty: false,
    saving: false,
  };
  setActiveWhiteboard(session);
  setEditorModeValue("whiteboard");

  return () => {
    setActiveWhiteboard((current) => (current?.id === input.id ? null : current));
    if (editorMode() === "whiteboard") setEditorModeValue("text");
  };
}

export function updateWhiteboardSession(
  id: string,
  patch: Partial<Pick<WhiteboardSession, "dirty" | "saving">>,
): void {
  setActiveWhiteboard((current) => (current?.id === id ? { ...current, ...patch } : current));
}

export async function saveActiveWhiteboard(closeAfter = false): Promise<boolean> {
  const session = activeWhiteboard();
  if (!session) return true;
  if (saveInFlight) return saveInFlight;
  if (!session.dirty) {
    if (closeAfter) session.close();
    return true;
  }

  updateWhiteboardSession(session.id, { saving: true });
  let task: Promise<boolean>;
  task = session
    .save(closeAfter)
    .then((saved) => {
      if (saved) updateWhiteboardSession(session.id, { dirty: false, saving: false });
      else updateWhiteboardSession(session.id, { saving: false });
      return saved;
    })
    .catch(() => {
      updateWhiteboardSession(session.id, { saving: false });
      return false;
    })
    .finally(() => {
      if (saveInFlight === task) saveInFlight = null;
    });
  saveInFlight = task;
  return task;
}

export async function leaveEditor(): Promise<boolean> {
  // **Primero** el texto de la nota y después la pizarra: la pizarra vive dentro
  // de la nota, así que su guardado actualiza el documento que va a cambiar de
  // sitio justo después. Al revés, el cambio de la pizarra llegaría al almacén
  // después de que la nota ya sea otra.
  flushActiveNote();
  const session = activeWhiteboard();
  if (!session) return true;
  if (session.dirty) return saveActiveWhiteboard(true);
  session.close();
  return true;
}
