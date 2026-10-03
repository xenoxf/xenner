import { createMemo, createSignal, Show, type JSX } from "solid-js";

import { ToastRegion } from "../components/feedback/ToastRegion";
import { AppShell } from "../components/layout/AppShell";
import { ExplorerSidebar } from "../components/layout/ExplorerSidebar";
import { ActivityBar } from "../components/layout/ActivityBar";
import { CommandPalette, type PaletteCommand } from "../components/commands/CommandPalette";
import { EditorPane } from "../components/editor/EditorPane";
import { NoteHistoryPanel } from "../components/editor/NoteHistoryPanel";
import { SettingsModal } from "../components/settings/SettingsModal";
import { MobileShell } from "../components/mobile/MobileShell";
import { DialogHost } from "../components/ui/DialogHost";
import { isMobilePlatform } from "../services/platform";
import {
  chooseWorkspace,
  closeWorkspaceError,
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
  refreshWorkspaceTree,
  reloadSelectedDocument,
  retryPendingSave,
  selectNote,
  toggleFolder,
  updateSelectedDocument,
  updateSelectedTitle,
  workspaceSupportsFolderPicker,
} from "../workspace/store";
import { useAppController, type AppController } from "./useAppController";
import { flattenTree } from "../workspace/tree";
import { indexNotesForSearch } from "../workspace/search";
import type { SkinInfo } from "../types/skin";

/**
 * Los modales y las hojas que van por encima de lo que haya en pantalla.
 *
 * Va en su propio componente, y no como un `JSX.Element` guardado en una
 * variable, porque en Solid el JSX crea el DOM en cuanto se evalúa: guardado
 * en una variable, sus nodos nacerían aunque la rama que los contiene no llegue a
 * pintarse. Como componente, cada rama crea los suyos cuando le toca.
 *
 * Además está en las dos vistas, móvil y escritorio, porque el historial, los
 * ajustes y los avisos tienen que verse igual en las dos.
 */
function Overlays(props: {
  controller: AppController;
  editingSkin: SkinInfo | null;
  onSkinEdit(skin: SkinInfo | null): void;
}): JSX.Element {
  const { appearance, history } = props.controller;
  const { controller } = props;
  const explorer = controller.explorer;

  /**
   * La nota o carpeta sobre la que actúan los comandos: la seleccionada, o
   * nada si no hay ninguna. La paleta solo enseña los comandos que tienen
   * sobre qué actuar.
   */
  const selectedNode = () => {
    const selected = getSelectedPath();
    if (!selected) return null;
    return flattenTree(getWorkspaceTree()).find((node) => node.path === selected) ?? null;
  };

  /** Dónde cae algo nuevo o pegado: la carpeta elegida, la de la nota, o la raíz. */
  const destinationForSelection = (): string => {
    const node = selectedNode();
    if (!node) return "";
    if (node.kind === "directory") return node.path;
    const separator = node.path.lastIndexOf("/");
    return separator < 0 ? "" : node.path.slice(0, separator);
  };

  const whereFor = (parent: string): string => (parent ? `En «${parent}»` : "En la raíz");

  function focusTree(): void {
    controller.setSidebarOpen(true);
    queueMicrotask(() =>
      document.querySelector<HTMLElement>('[data-x="tree"] button')?.focus(),
    );
  }

  function focusEditor(): void {
    document.querySelector<HTMLElement>('[data-x="note-title"]')?.focus();
  }

  // Todos los poderes sin ratón, en un solo sitio. Los que necesitan una nota o
  // una elegida solo aparecen cuando la hay; el resto siempre está.
  const paletteCommands = (): PaletteCommand[] => {
    const node = selectedNode();
    const parent = destinationForSelection();
    const commands: PaletteCommand[] = [
      {
        id: "new-note",
        label: "Nueva nota",
        hint: whereFor(parent),
        run: () => {
          controller.setSidebarOpen(true);
          explorer.startCreation("note", parent);
        },
      },
      {
        id: "new-folder",
        label: "Nueva carpeta",
        hint: whereFor(parent),
        run: () => {
          controller.setSidebarOpen(true);
          explorer.startCreation("folder", parent);
        },
      },
    ];
    if (node) {
      commands.push({
        id: "rename",
        label: `Renombrar «${node.name}»`,
        shortcut: "F2",
        run: () => void explorer.rename(node.path),
      });
      commands.push({
        id: "delete",
        label: `Eliminar «${node.name}»`,
        hint: "Pide confirmación",
        shortcut: "Supr",
        danger: true,
        run: () => void explorer.remove(node.path),
      });
      commands.push({
        id: "cut",
        label: `Cortar «${node.name}» para moverlo`,
        shortcut: "Ctrl+X",
        run: () => explorer.cut(node.path),
      });
    }
    if (node?.kind === "note") {
      commands.push({
        id: "copy-markdown",
        label: "Copiar el Markdown de la nota",
        shortcut: "Ctrl+C",
        run: () => void explorer.copyMarkdown(node.path),
      });
      commands.push({
        id: "history",
        label: "Últimos cambios de la nota",
        run: () => history.open(node.path),
      });
    }
    if (explorer.cutPath()) {
      commands.push({
        id: "paste",
        label: "Pegar aquí lo cortado",
        hint: whereFor(parent),
        shortcut: "Ctrl+V",
        run: () => void explorer.paste(parent),
      });
    }
    commands.push(
      {
        id: "save",
        label: "Guardar ahora",
        shortcut: "Ctrl+S",
        run: () => void controller.saveNow(),
      },
      {
        id: "toggle-sidebar",
        label: controller.sidebarOpen() ? "Ocultar la lista de notas" : "Mostrar la lista de notas",
        shortcut: "Ctrl+E",
        run: () => controller.toggleSidebar(),
      },
      {
        id: "focus-list",
        label: "Ir a la lista de notas",
        hint: "Pone el foco en el árbol",
        run: () => focusTree(),
      },
      {
        id: "focus-editor",
        label: "Ir al editor",
        hint: "Pone el foco en el título",
        run: () => focusEditor(),
      },
      {
        id: "refresh",
        label: "Actualizar la lista de notas",
        run: () => void refreshWorkspaceTree(),
      },
      {
        id: "open-settings",
        label: "Abrir ajustes",
        run: () => controller.setSettingsOpen(true),
      },
    );
    if (workspaceSupportsFolderPicker()) {
      commands.push({
        id: "choose-workspace",
        label: "Abrir otra biblioteca…",
        run: () => void chooseWorkspace(),
      });
    }
    if (explorer.legacyNotes().length > 0) {
      commands.push({
        id: "import-legacy",
        label: `Importar ${explorer.legacyNotes().length} notas antiguas`,
        run: () => void explorer.importOldNotes(),
      });
    }
    return commands;
  };

  const paletteNotes = createMemo(() => indexNotesForSearch(getWorkspaceTree()));

  return (
    <>
      <Show when={history.path()} keyed>
        {(notePath) => (
          <NoteHistoryPanel
            notePath={notePath}
            noteName={history.noteName()}
            versions={history.versions()}
            now={history.now()}
            busy={history.busy()}
            onClose={history.close}
            onRestore={(version) => void history.restore(version)}
          />
        )}
      </Show>

      <Show when={controller.settingsOpen()}>
        <SettingsModal
          skins={appearance.skins()}
          activeSkin={appearance.activeSkin()}
          loading={appearance.skinLoading()}
          appearance={appearance.appearance()}
          editingSkin={props.editingSkin}
          onAppearanceChange={appearance.updateAppearance}
          onSkinChange={(id) => void appearance.changeSkin(id)}
          onSkinCreated={appearance.skinCreated}
          onSkinImported={appearance.skinCreated}
          onSkinEdit={props.onSkinEdit}
          onSkinEditCancel={() => props.onSkinEdit(null)}
          onClose={() => {
            props.onSkinEdit(null);
            controller.setSettingsOpen(false);
          }}
        />
      </Show>
      <ToastRegion />

      <Show when={controller.paletteOpen()}>
        <CommandPalette
          mode={controller.paletteMode()}
          notes={paletteNotes()}
          selectedPath={getSelectedPath()}
          commands={paletteCommands()}
          onSelectNote={(path) => void selectNote(path)}
          onClose={controller.closePalette}
        />
      </Show>

      {/* Renombrar, borrar e importar. Va siempre montado, también en escritorio:
          sustituye a `window.prompt` y `window.confirm`, que no funcionan en el
          WebView de Android. */}
      <DialogHost />
    </>
  );
}

export default function App() {
  const controller = useAppController();
  const explorer = controller.explorer;
  const history = controller.history;
  // El tema que se está editando. Vive aquí y no dentro del modal porque el
  // modal se monta y se desmonta: si estuviera dentro, al cerrarlo y volver a
  // abrirlo se perdería el contexto de qué tema se estaba tocando.
  const [editingSkin, setEditingSkin] = createSignal<SkinInfo | null>(null);

  const overlays = () => (
    <Overlays
      controller={controller}
      editingSkin={editingSkin()}
      onSkinEdit={setEditingSkin}
    />
  );

  // Móvil y escritorio no son dos tamaños de la misma vista: son dos diseños.
  // Decide el user agent (ver `services/platform`), no el ancho, para que
  // achicar la ventana del escritorio no convierta la app en la versión móvil y
  // para que la previsualización del navegador enseñe la vista correcta.
  return (
    <Show
      when={isMobilePlatform()}
      fallback={
        <AppShell
          rail={
            /* La barra de secciones es solo de escritorio: en móvil los ajustes
               están en la barra de arriba y la lista ocupa la pantalla entera. */
            <ActivityBar
              explorerOpen={controller.sidebarOpen()}
              onToggleExplorer={controller.toggleSidebar}
              onOpenSettings={() => controller.setSettingsOpen(true)}
            />
          }
          sidebar={
            <Show when={controller.sidebarOpen()}>
              <ExplorerSidebar
                workspace={getWorkspace()}
                tree={getWorkspaceTree()}
                loading={getWorkspaceLoading()}
                canChooseWorkspace={workspaceSupportsFolderPicker()}
                error={getWorkspaceError()}
                selectedPath={getSelectedPath()}
                expandedPaths={getExpandedPaths()}
                creation={explorer.creation()}
                creating={explorer.creating()}
                canPaste={Boolean(explorer.cutPath())}
                legacyNoteCount={explorer.legacyNotes().length}
                legacyIssue={explorer.legacyIssue()}
                width={controller.sidebarWidth()}
                onWidthChange={controller.setSidebarWidth}
                onChooseWorkspace={() => void chooseWorkspace()}
                onRefresh={() => void refreshWorkspaceTree()}
                onDismissError={closeWorkspaceError}
                onImportLegacy={() => void explorer.importOldNotes()}
                onStartCreation={explorer.startCreation}
                onSubmitCreation={(name) => void explorer.submitCreation(name)}
                onCancelCreation={() => explorer.setCreation(null)}
                onSelect={(path) => void selectNote(path)}
                onToggle={toggleFolder}
                onRename={(path) => explorer.rename(path)}
                onDelete={(path) => explorer.remove(path)}
                onMove={(path, parent) => void explorer.move(path, parent)}
                onCopyMarkdown={(path) => void explorer.copyMarkdown(path)}
                onCut={(path) => explorer.cut(path)}
                onPaste={(parent) => void explorer.paste(parent)}
                onShowHistory={history.open}
              />
            </Show>
          }
          editor={
            <EditorPane
              document={getSelectedDocument()}
              status={getSaveStatus()}
              initializing={getWorkspaceLoading()}
              loading={getDocumentLoading()}
              reloadToken={getDocumentReloadToken()}
              error={getWorkspaceError()}
              onChange={updateSelectedDocument}
              onTitleChange={updateSelectedTitle}
              onCreate={() => {
                // La fila para nombrar la nota nueva vive en el panel: si está
                // escondido, crear desde el editor no enseñaría nada.
                controller.setSidebarOpen(true);
                explorer.startCreation("note");
              }}
              onRetry={() => void retryPendingSave()}
              onReload={() => void reloadSelectedDocument()}
            />
          }
          overlays={overlays()}
        />
      }
    >
      <MobileShell
        workspace={getWorkspace()}
        tree={getWorkspaceTree()}
        loading={getWorkspaceLoading()}
        error={getWorkspaceError()}
        selectedPath={getSelectedPath()}
        document={getSelectedDocument()}
        status={getSaveStatus()}
        documentLoading={getDocumentLoading()}
        documentReloadToken={getDocumentReloadToken()}
        creation={explorer.creation()}
        creating={explorer.creating()}
        createdPath={explorer.createdPath()}
        canPaste={Boolean(explorer.cutPath())}
        onOpenSettings={() => controller.setSettingsOpen(true)}
        onDismissError={closeWorkspaceError}
        onStartCreation={explorer.startCreation}
        onSubmitCreation={(name) => void explorer.submitCreation(name)}
        onCancelCreation={() => explorer.setCreation(null)}
        onSelect={(path) => void selectNote(path)}
        onRename={(path) => void explorer.rename(path)}
        onDelete={(path) => void explorer.remove(path)}
        onCopyMarkdown={(path) => void explorer.copyMarkdown(path)}
        onCut={(path) => explorer.cut(path)}
        onPaste={(parent) => void explorer.paste(parent)}
        onShowHistory={history.open}
        onCreate={() => explorer.startCreation("note")}
        onRetry={() => void retryPendingSave()}
        onReload={() => void reloadSelectedDocument()}
        onChange={updateSelectedDocument}
        onTitleChange={updateSelectedTitle}
        overlays={overlays()}
      />
    </Show>
  );
}
