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

export function useAppController() {
  const appearance = useAppearanceController();
  const explorer = useExplorerController();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  let lastWorkspaceIssue = "";
  let lastLegacyIssue = "";
  let saveShortcutBusy = false;

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
    onCleanup(() => document.removeEventListener("keydown", saveWithShortcut));
    onCleanup(stopWatchingSystem);
    onCleanup(stopWatchingWorkspace);
  });

  return { appearance, explorer, settingsOpen, setSettingsOpen };
}
