import { createSignal, For, onMount, Show } from "solid-js";
import "./App.css";
import {
  createNote,
  deleteNote,
  getStorageError,
  getStorageStatus,
  listNotes,
  updateNote,
} from "./notes/store";
import { loadSkin, type SkinInfo } from "./skin/loader";

function App() {
  const initialNotes = listNotes();
  const [skins, setSkins] = createSignal<SkinInfo[]>([]);
  const [activeSkin, setActiveSkin] = createSignal("");
  const [skinLoading, setSkinLoading] = createSignal(true);
  const [selectedId, setSelectedId] = createSignal<string | null>(
    initialNotes[0]?.id ?? null,
  );
  let skinRequest = 0;
  let titleInput: HTMLInputElement | undefined;

  async function changeSkin(id?: string): Promise<void> {
    const request = ++skinRequest;
    setSkinLoading(true);
    try {
      const loaded = await loadSkin(id);
      if (request !== skinRequest) return;
      setSkins(loaded.skins);
      setActiveSkin(loaded.activeId);
    } finally {
      if (request === skinRequest) setSkinLoading(false);
    }
  }

  onMount(() => {
    void changeSkin();
  });

  const selected = () => {
    const id = selectedId();
    if (!id) return null;
    return listNotes().find((note) => note.id === id) ?? null;
  };

  // Opción "" = skin default embebida (fuerza el caso "inexistente → default").
  const skinOptions = (): SkinInfo[] => {
    const options: SkinInfo[] = [
      { id: "", name: "Frosted Glass (embebida)", version: "", author: "" },
      ...skins(),
    ];
    const active = activeSkin();
    if (active && !options.some((skin) => skin.id === active)) {
      options.push({ id: active, name: `${active} (no encontrada)`, version: "", author: "" });
    }
    return options;
  };

  const saveLabel = () => {
    switch (getStorageStatus()) {
      case "saving":
        return "Guardando…";
      case "error":
        return "Error al guardar";
      default:
        return "Guardado";
    }
  };

  function addNote(): void {
    const note = createNote();
    setSelectedId(note.id);
    queueMicrotask(() => titleInput?.focus());
  }

  function removeSelected(): void {
    const current = selected();
    if (!current) return;
    if (!window.confirm(`¿Eliminar “${current.title.trim() || "Sin título"}”?`)) return;

    const previous = listNotes();
    const index = previous.findIndex((note) => note.id === current.id);
    deleteNote(current.id);
    const remaining = listNotes();
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
  }

  return (
    <div class="desktop">
      <header class="toolbar">
        <span class="toolbar-title">xenner</span>
        <span
          class="save-status"
          data-status={getStorageStatus()}
          role="status"
          aria-live="polite"
          aria-describedby="storage-error"
          title={getStorageError() ?? undefined}
        >
          {saveLabel()}
        </span>
        <span id="storage-error" class="sr-only" aria-live="assertive">
          {getStorageError() ?? ""}
        </span>
        <span class="toolbar-spacer" />

        <label class="sr-only" for="skin-select">
          Skin activa
        </label>
        <select
          id="skin-select"
          class="input skin-select"
          value={activeSkin()}
          disabled={skinLoading()}
          aria-busy={skinLoading()}
          onChange={(event) => void changeSkin(event.currentTarget.value)}
        >
          <For each={skinOptions()}>
            {(skin) => <option value={skin.id}>{skin.name}</option>}
          </For>
        </select>

        <button class="btn btn-primary" type="button" onClick={addNote}>
          Nueva nota
        </button>
      </header>

      <div class="workspace">
        <aside class="sidebar" aria-label="Lista de notas">
          <div class="sidebar-head">
            <span>Notas</span>
            <span class="sidebar-count">{listNotes().length}</span>
          </div>
          <nav class="note-list" aria-label="Notas guardadas">
            <Show
              when={listNotes().length > 0}
              fallback={<p class="sidebar-empty">Sin notas todavía</p>}
            >
              <For each={listNotes()}>
                {(note) => (
                  <button
                    type="button"
                    classList={{
                      "note-item": true,
                      active: note.id === selectedId(),
                    }}
                    aria-pressed={note.id === selectedId()}
                    aria-label={`Abrir nota ${note.title.trim() || "sin título"}`}
                    onClick={() => setSelectedId(note.id)}
                  >
                    <span class="note-item-title">
                      {note.title.trim() || "Sin título"}
                    </span>
                    <span class="note-item-date">
                      {new Date(note.updatedAt).toLocaleDateString("es")}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </nav>
        </aside>

        <section class="editor" aria-label="Editor de nota">
          <Show
            when={selected()}
            fallback={
              <div class="editor-empty">
                <p>Ninguna nota seleccionada</p>
                <button class="btn btn-primary" type="button" onClick={addNote}>
                  Crear una nota
                </button>
              </div>
            }
          >
            <div class="editor-bar">
              <input
                ref={(element) => {
                  titleInput = element;
                }}
                class="input editor-title"
                aria-label="Título de la nota"
                placeholder="Título"
                value={selected()?.title ?? ""}
                onInput={(event) => {
                  const id = selectedId();
                  if (id) updateNote(id, { title: event.currentTarget.value });
                }}
              />
              <time
                class="editor-date"
                dateTime={new Date(selected()?.updatedAt ?? 0).toISOString()}
              >
                {selected()
                  ? new Date(selected()!.updatedAt).toLocaleString("es")
                  : ""}
              </time>
              <button
                class="btn btn-danger"
                type="button"
                aria-label="Eliminar nota seleccionada"
                onClick={removeSelected}
              >
                Eliminar
              </button>
            </div>
            <textarea
              class="input editor-body"
              aria-label="Cuerpo de la nota"
              placeholder="Escribe tu nota…"
              value={selected()?.body ?? ""}
              onInput={(event) => {
                const id = selectedId();
                if (id) updateNote(id, { body: event.currentTarget.value });
              }}
            />
          </Show>
        </section>
      </div>
    </div>
  );
}

export default App;
