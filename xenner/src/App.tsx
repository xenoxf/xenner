import { createSignal, For, onMount, Show } from "solid-js";
import "./App.css";
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from "./notes/store";
import { loadSkin, type SkinInfo } from "./skin/loader";

function App() {
  const [skins, setSkins] = createSignal<SkinInfo[]>([]);
  const [activeSkin, setActiveSkin] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  onMount(async () => {
    const loaded = await loadSkin();
    setSkins(loaded.skins);
    setActiveSkin(loaded.activeId);
    const first = listNotes()[0];
    if (first) setSelectedId(first.id);
  });

  const selected = () => {
    const id = selectedId();
    if (!id) return null;
    return listNotes().find((n) => n.id === id) ?? null;
  };

  // Opción "" = skin default embebida (fuerza el caso "inexistente → default").
  const skinOptions = (): SkinInfo[] => {
    const opts: SkinInfo[] = [
      { id: "", name: "Frosted Glass (embebida)", version: "", author: "" },
      ...skins(),
    ];
    const active = activeSkin();
    if (active && !opts.some((s) => s.id === active)) {
      opts.push({ id: active, name: `${active} (no encontrada)`, version: "", author: "" });
    }
    return opts;
  };

  async function changeSkin(id: string) {
    const loaded = await loadSkin(id);
    setSkins(loaded.skins);
    setActiveSkin(loaded.activeId);
  }

  function addNote() {
    const note = createNote();
    setSelectedId(note.id);
  }

  function removeSelected() {
    const id = selectedId();
    if (!id) return;
    deleteNote(id);
    const rest = listNotes();
    setSelectedId(rest.length > 0 ? rest[0].id : null);
  }

  return (
    <div class="desktop">
      <header class="toolbar">
        <span class="toolbar-title">xenner</span>
        <span class="toolbar-spacer" />
        <select
          class="input skin-select"
          aria-label="Skin activa"
          onChange={(e) => void changeSkin(e.currentTarget.value)}
        >
          <For each={skinOptions()}>
            {(s) => (
              <option value={s.id} selected={s.id === activeSkin()}>
                {s.name}
              </option>
            )}
          </For>
        </select>
        <button class="btn btn-primary" type="button" onClick={addNote}>
          Nueva nota
        </button>
      </header>

      <div class="workspace">
        <aside class="sidebar">
          <div class="sidebar-head">
            <span>Notas</span>
            <span class="sidebar-count">{listNotes().length}</span>
          </div>
          <nav class="note-list">
            <Show
              when={listNotes().length > 0}
              fallback={<p class="sidebar-empty">Sin notas todavía</p>}
            >
              <For each={listNotes()}>
                {(n) => (
                  <button
                    type="button"
                    classList={{
                      "note-item": true,
                      active: n.id === selectedId(),
                    }}
                    onClick={() => setSelectedId(n.id)}
                  >
                    <span class="note-item-title">
                      {n.title.trim() || "Sin título"}
                    </span>
                    <span class="note-item-date">
                      {new Date(n.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </nav>
        </aside>

        <section class="editor">
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
                class="input editor-title"
                placeholder="Título"
                value={selected()!.title}
                onInput={(e) =>
                  updateNote(selected()!.id, { title: e.currentTarget.value })
                }
              />
              <span class="editor-date">
                {new Date(selected()!.updatedAt).toLocaleString()}
              </span>
              <button
                class="btn btn-danger"
                type="button"
                onClick={removeSelected}
              >
                Eliminar
              </button>
            </div>
            <textarea
              class="input editor-body"
              placeholder="Escribe tu nota…"
              value={selected()!.body}
              onInput={(e) =>
                updateNote(selected()!.id, { body: e.currentTarget.value })
              }
            />
          </Show>
        </section>
      </div>
    </div>
  );
}

export default App;
