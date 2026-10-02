import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { notifyError, notifySuccess, notifyWarning } from "../services/toastService";
import { saveActiveWhiteboard } from "../services/editorSession";
import {
  flushPendingSave,
  getWorkspace,
  getWorkspaceError,
  initializeWorkspace,
  startWorkspaceWatcher,
} from "../workspace/store";
import { useAppearanceController } from "./useAppearanceController";
import { useExplorerController } from "./useExplorerController";
import { useHistoryController } from "./useHistoryController";

/** Lo que devuelve el hook, tipado, para que quien lo use no tenga que repetirlo. */
export type AppController = ReturnType<typeof useAppController>;

export function useAppController() {
  const appearance = useAppearanceController();
  const explorer = useExplorerController();
  const history = useHistoryController();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  /*
   * Si el panel de la lista de notas está desplegado. Vive aquí porque lo
   * controlan dos sitios —el icono de la barra de secciones y el atajo de
   * teclado— y ninguno de los dos es el panel.
   */
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  let lastWorkspaceIssue = "";
  let lastLegacyIssue = "";
  let saveShortcutBusy = false;

  function toggleSidebar(): void {
    setSidebarOpen((open) => !open);
  }

  createEffect(() => {
    const error = getWorkspaceError();
    if (!error) {
      lastWorkspaceIssue = "";
      return;
    }
    const issue = `${error.code}:${error.message}`;
    if (issue === lastWorkspaceIssue) return;
    lastWorkspaceIssue = issue;
    const title = error.code === "conflict" ? "Conflicto de archivo" : "No se pudo completar la operación";
    notifyError(title, error.message);
  });

  createEffect(() => {
    const issue = explorer.legacyIssue();
    if (!issue || issue === lastLegacyIssue) return;
    lastLegacyIssue = issue;
    notifyWarning("Importación antigua incompleta", issue);
  });

  onMount(() => {
    const stopWatchingWorkspace = startWorkspaceWatcher();
    const stopWatchingSystem = appearance.start();
    void (async () => {
      await initializeWorkspace();
      explorer.loadLegacyNotes(getWorkspace()?.info.root);
    })();
    const saveWithShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s" || saveShortcutBusy) return;
      event.preventDefault();
      saveShortcutBusy = true;
      void saveActiveWhiteboard()
        .then((whiteboardSaved) => {
          if (!whiteboardSaved) return false;
          return flushPendingSave();
        })
        .then((saved) => {
          if (saved) notifySuccess("Cambios guardados");
        })
        .finally(() => {
          saveShortcutBusy = false;
        });
    };
    document.addEventListener("keydown", saveWithShortcut);
    /*
     * Mostrar u ocultar la lista de notas. Es `Ctrl+E` y no `Ctrl+B`, que es lo
     * que usan los editores de código, porque `Ctrl+B` aquí es negrita en el
     * editor de Markdown: cambiarlo habría roto algo que ya funcionaba.
     */
    const toggleSidebarWithShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "e") return;
      event.preventDefault();
      toggleSidebar();
    };
    document.addEventListener("keydown", toggleSidebarWithShortcut);
    onCleanup(() => document.removeEventListener("keydown", saveWithShortcut));
    onCleanup(() => document.removeEventListener("keydown", toggleSidebarWithShortcut));
    onCleanup(stopWatchingSystem);
    onCleanup(stopWatchingWorkspace);
  });

  return {
    appearance,
    explorer,
    history,
    settingsOpen,
    setSettingsOpen,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
  };
}
