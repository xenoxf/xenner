import { createSignal } from "solid-js";

export type EditorMode = "text" | "source" | "whiteboard";

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
  const session = activeWhiteboard();
  if (!session) return true;
  if (session.dirty) return saveActiveWhiteboard(true);
  session.close();
  return true;
}
