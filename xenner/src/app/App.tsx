import { createSignal, Show, type JSX } from "solid-js";

import { ToastRegion } from "../components/feedback/ToastRegion";
import { AppShell } from "../components/layout/AppShell";
import { ExplorerSidebar } from "../components/layout/ExplorerSidebar";
import { ActivityBar } from "../components/layout/ActivityBar";
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
        <AppShell>
          {/* La barra de secciones es solo de escritorio: en móvil los ajustes
              están en la barra de arriba y la lista ocupa la pantalla entera. */}
          <ActivityBar
            explorerOpen={controller.sidebarOpen()}
            onToggleExplorer={controller.toggleSidebar}
            onOpenSettings={() => controller.setSettingsOpen(true)}
          />

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
              onChooseWorkspace={() => void chooseWorkspace()}
              onRefresh={() => void refreshWorkspaceTree()}
              onDismissError={closeWorkspaceError}
              onImportLegacy={() => void explorer.importOldNotes()}
              onStartCreation={explorer.startCreation}
              onSubmitCreation={(name) => void explorer.submitCreation(name)}
              onCancelCreation={() => explorer.setCreation(null)}
              onSelect={(path) => void selectNote(path)}
              onToggle={toggleFolder}
              onRename={(path) => void explorer.rename(path)}
              onDelete={(path) => void explorer.remove(path)}
              onMove={(path, parent) => void explorer.move(path, parent)}
              onCopyMarkdown={(path) => void explorer.copyMarkdown(path)}
              onCut={(path) => explorer.cut(path)}
              onPaste={(parent) => void explorer.paste(parent)}
              onShowHistory={history.open}
            />
          </Show>

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

          {overlays()}
        </AppShell>
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
