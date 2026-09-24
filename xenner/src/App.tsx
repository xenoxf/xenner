import { createSignal, onCleanup, onMount, Show } from "solid-js";

import "./App.css";
import { CreationRow, type CreationKind } from "./components/CreationRow";
import { EditorPane } from "./components/EditorPane";
import { Explorer, type CreationDraft } from "./components/Explorer";
import { FolderOpenIcon, FolderPlusIcon, GearIcon, PlusIcon, RefreshIcon } from "./components/Icons";
import { SettingsModal } from "./components/SettingsModal";
import { readLegacyNotes } from "./notes/legacy";
import type { Note } from "./notes/model";
import { loadSkin, type SkinInfo } from "./skin/loader";
import {
  applyAppearance,
  readAppearance,
  resolveColorScheme,
  saveAppearance,
  watchSystemColorScheme,
  type Appearance,
  type ColorScheme,
} from "./settings/appearance";
import {
  chooseWorkspace,
  closeWorkspaceError,
  createFolder,
  createNote,
  deleteEntry,
  expandFolder,
  getDocumentLoading,
  getDocumentReloadToken,
  getExpandedPaths,
  getSaveStatus,
  getSelectedDocument,
  getSelectedPath,
  getWorkspace,
  getWorkspaceError,
  getWorkspaceLoading,
  getWorkspaceTree,
  initializeWorkspace,
  importLegacyNotes,
  refreshWorkspaceTree,
  reloadSelectedDocument,
  renameEntry,
  retryPendingSave,
  selectNote,
  startWorkspaceWatcher,
  toggleFolder,
  updateSelectedDocument,
  updateSelectedTitle,
  workspaceSupportsFolderPicker,
} from "./workspace/store";

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "Biblioteca";
}

function App() {
  const [skins, setSkins] = createSignal<SkinInfo[]>([]);
  const [activeSkin, setActiveSkin] = createSignal("");
  const [skinLoading, setSkinLoading] = createSignal(true);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [appearance, setAppearance] = createSignal<Appearance>(readAppearance());
  const [creation, setCreation] = createSignal<CreationDraft | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [legacyNotes, setLegacyNotes] = createSignal<Note[]>([]);
  const [legacyIssue, setLegacyIssue] = createSignal<string | null>(null);
  let skinRequest = 0;

  async function changeSkin(
    id?: string,
    scheme: ColorScheme = resolveColorScheme(appearance()),
  ): Promise<void> {
    const request = ++skinRequest;
    setSkinLoading(true);
    try {
      const loaded = await loadSkin(id, scheme);
      if (request !== skinRequest) return;
      setSkins(loaded.skins);
      setActiveSkin(loaded.activeId);
    } finally {
      if (request === skinRequest) setSkinLoading(false);
    }
  }

  function updateAppearance(next: Appearance): void {
    setAppearance(next);
    saveAppearance(next);
    const scheme = applyAppearance(next);
    void changeSkin(activeSkin(), scheme);
  }

  function skinCreated(skin: SkinInfo): void {
    setSkins((previous) => [
      ...previous.filter((candidate) => candidate.id !== skin.id),
      skin,
    ]);
    void changeSkin(skin.id);
  }

  onMount(() => {
    const stopWatchingWorkspace = startWorkspaceWatcher();
    const initialAppearance = appearance();
    const initialScheme = applyAppearance(initialAppearance);
    void changeSkin(undefined, initialScheme);
    void (async () => {
      await initializeWorkspace();
      const legacy = readLegacyNotes();
      const root = getWorkspace()?.info.root;
      let imported = new Set<string>();
      try {
        const raw = localStorage.getItem("xenner:legacy-import:v1");
        const marker = raw ? (JSON.parse(raw) as { root?: string; ids?: string[] }) : null;
        if (marker && marker.root === root && Array.isArray(marker.ids)) {
          imported = new Set(marker.ids);
        }
      } catch {
        imported = new Set();
      }
      setLegacyNotes(legacy.notes.filter((note) => !imported.has(note.id)));
      setLegacyIssue(legacy.issue);
    })();
    const stopWatchingSystem = watchSystemColorScheme((scheme) => {
      if (appearance().mode === "system") void changeSkin(activeSkin(), scheme);
    });
    onCleanup(stopWatchingSystem);
    onCleanup(stopWatchingWorkspace);
  });

  async function createUntitledNote(parent = ""): Promise<void> {
    if (creating()) return;
    setCreating(true);
    await createNote(parent);
    setCreating(false);
  }

  function startCreation(kind: CreationKind, parent = ""): void {
    if (parent) expandFolder(parent);
    if (kind === "note") {
      void createUntitledNote(parent);
      return;
    }
    setCreation({ kind, parent });
  }

  async function submitCreation(name: string): Promise<void> {
    const draft = creation();
    if (!draft || creating()) return;
    setCreating(true);
    const result = await createFolder(draft.parent, name);
    setCreating(false);
    if (result) setCreation(null);
  }

  async function importOldNotes(): Promise<void> {
    const notes = legacyNotes();
    if (!notes.length) return;
    const confirmed = window.confirm(
      `Se importarán ${notes.length} notas antiguas a la carpeta Importadas. La copia local original se conserva. ¿Continuar?`,
    );
    if (!confirmed) return;
    const imported = await importLegacyNotes(notes);
    if (imported > 0) {
      setLegacyNotes([]);
      setLegacyIssue(null);
    }
  }

  async function rename(path: string): Promise<void> {
    const currentName = path.slice(path.lastIndexOf("/") + 1);
    const nextName = window.prompt("Nuevo nombre", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    await renameEntry(path, nextName);
  }

  async function remove(path: string): Promise<void> {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const confirmed = window.confirm(
      path.toLocaleLowerCase("es").endsWith(".md")
        ? `¿Eliminar “${name}”? Esta acción no se puede deshacer.`
        : `¿Eliminar la carpeta “${name}”? Solo se puede eliminar si está vacía.`,
    );
    if (confirmed) await deleteEntry(path);
  }

  return (
    <div class="app-shell">
      <aside class="explorer-sidebar" aria-label="Explorador de archivos">
        <header class="explorer-header">
          <div class="explorer-title-row">
            <div class="explorer-title-copy">
              <span>Explorador</span>
              <strong title={getWorkspace()?.info.root ?? ""}>
                {baseName(getWorkspace()?.info.root ?? "Biblioteca")}
              </strong>
            </div>
            <div class="explorer-window-actions">
              <button
                type="button"
                class="icon-button"
                disabled={!workspaceSupportsFolderPicker()}
                aria-label="Abrir otra biblioteca"
                title={workspaceSupportsFolderPicker() ? "Abrir carpeta" : "El selector de carpetas requiere la app desktop"}
                onClick={() => void chooseWorkspace()}
              >
                <FolderOpenIcon />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label="Actualizar explorador"
                title="Actualizar"
                onClick={() => void refreshWorkspaceTree()}
              >
                <RefreshIcon />
              </button>
              <button
                type="button"
                class="icon-button"
                aria-label="Configuración"
                title="Configuración"
                onClick={() => setSettingsOpen(true)}
              >
                <GearIcon />
              </button>
            </div>
          </div>
          <div class="explorer-toolbar">
            <button type="button" class="toolbar-primary" onClick={() => startCreation("note")}>
              <PlusIcon />
              <span>Nueva nota</span>
            </button>
            <button
              type="button"
              class="icon-button"
              aria-label="Nueva carpeta"
              title="Nueva carpeta"
              onClick={() => startCreation("folder")}
            >
              <FolderPlusIcon />
            </button>
            <span
              class="explorer-count"
              title={`${getWorkspace()?.info.noteCount ?? 0} notas`}
              aria-label={`${getWorkspace()?.info.noteCount ?? 0} notas`}
            >
              {getWorkspace()?.info.noteCount ?? 0}
            </span>
          </div>
        </header>

        <Show when={getWorkspaceError()}>
          {(error) => (
            <div class="workspace-alert" role="alert">
              <div>
                <strong>{error().code === "conflict" ? "Conflicto" : "Biblioteca"}</strong>
                <span>{error().message}</span>
              </div>
              <button type="button" class="text-button" onClick={closeWorkspaceError}>
                Descartar
              </button>
            </div>
          )}
        </Show>

        <Show when={legacyNotes().length > 0}>
          <div class="legacy-import-card">
            <div>
              <strong>Notas antiguas disponibles</strong>
              <span>{legacyNotes().length} notas de la versión local.</span>
            </div>
            <button type="button" class="text-button" onClick={() => void importOldNotes()}>
              Importar
            </button>
          </div>
        </Show>
        <Show when={legacyIssue()}>
          {(message) => <p class="legacy-issue">{message()}</p>}
        </Show>

        <div class="explorer-scroll" classList={{ loading: getWorkspaceLoading() }} aria-busy={getWorkspaceLoading()}>
          <Show when={creation()?.parent === ""}>
            <CreationRow
              kind={creation()?.kind ?? "note"}
              depth={0}
              busy={creating()}
              onSubmit={(name) => void submitCreation(name)}
              onCancel={() => setCreation(null)}
            />
          </Show>
          <Show
            when={getWorkspaceTree().length > 0}
            fallback={
              <Show when={!getWorkspaceLoading() && creation() === null}>
                <div class="explorer-placeholder">
                  <FolderOpenIcon />
                  <strong>Sin notas todavía</strong>
                  <span>Crea una nota Markdown o abre una carpeta existente.</span>
                </div>
              </Show>
            }
          >
            <Explorer
              nodes={getWorkspaceTree()}
              selectedPath={getSelectedPath()}
              selectedTitle={getSelectedDocument()?.title ?? ""}
              expandedPaths={getExpandedPaths()}
              creation={creation()}
              busy={creating()}
              onSelect={(path) => void selectNote(path)}
              onToggle={toggleFolder}
              onStartCreation={startCreation}
              onSubmitCreation={(name) => void submitCreation(name)}
              onCancelCreation={() => setCreation(null)}
              onRename={(path) => void rename(path)}
              onDelete={(path) => void remove(path)}
            />
          </Show>
        </div>

        <footer class="explorer-footer">
          <strong>xenner</strong>
          <span title={getWorkspace()?.info.root ?? ""}>
            {getWorkspace()?.info.truncated ? "Explorer limitado" : "Markdown local"}
          </span>
        </footer>
      </aside>

      <EditorPane
        document={getSelectedDocument()}
        status={getSaveStatus()}
        initializing={getWorkspaceLoading()}
        loading={getDocumentLoading()}
        reloadToken={getDocumentReloadToken()}
        error={getWorkspaceError()}
        onChange={updateSelectedDocument}
        onTitleChange={updateSelectedTitle}
        onCreate={() => startCreation("note")}
        onRetry={() => void retryPendingSave()}
        onReload={() => void reloadSelectedDocument()}
      />

      <Show when={settingsOpen()}>
        <SettingsModal
          skins={skins()}
          activeSkin={activeSkin()}
          loading={skinLoading()}
          appearance={appearance()}
          onAppearanceChange={updateAppearance}
          onSkinChange={(id) => void changeSkin(id)}
          onSkinCreated={skinCreated}
          onClose={() => setSettingsOpen(false)}
        />
      </Show>
    </div>
  );
}

export default App;
