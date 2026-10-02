import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { notifyError, notifySuccess, notifyWarning } from "../services/toastService";
import { saveActiveWhiteboard } from "../services/editorSession";
import {
  readSidebarLayout,
  sanitizeSidebarLayout,
  saveSidebarLayout,
  type SidebarLayout,
} from "../services/sidebarLayout";
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
   * Cómo se ve la columna de la lista: si sale desplegada y de qué ancho. Vive
   * aquí porque la controlan tres sitios —el icono de la barra de secciones, el
   * atajo de teclado y el tirador del borde— y ninguno de ellos es el panel.
   */
  const [sidebarLayout, setSidebarLayout] = createSignal(readSidebarLayout());
  const sidebarOpen = (): boolean => sidebarLayout().open;
  const sidebarWidth = (): number | null => sidebarLayout().width;
  let lastWorkspaceIssue = "";
  let lastLegacyIssue = "";
  let saveShortcutBusy = false;

  /** Un solo camino para cambiarlo y para recordarlo entre sesiones. */
  function updateSidebarLayout(patch: Partial<SidebarLayout>): void {
    const current = sidebarLayout();
    const next = sanitizeSidebarLayout({ ...current, ...patch });
    // El tirador avisa en cada movimiento del puntero: comparar antes evita
    // escribir en `localStorage` sesenta veces por segundo cuando ya está en el
    // tope y no se puede mover más.
    if (next.open === current.open && next.width === current.width) return;
    saveSidebarLayout(next);
    setSidebarLayout(next);
  }

  function setSidebarOpen(open: boolean): void {
    updateSidebarLayout({ open });
  }

  function toggleSidebar(): void {
    updateSidebarLayout({ open: !sidebarOpen() });
  }

  function setSidebarWidth(width: number | null): void {
    updateSidebarLayout({ width });
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
    sidebarWidth,
    setSidebarOpen,
    setSidebarWidth,
    toggleSidebar,
  };
}
