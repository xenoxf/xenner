import { createEffect, createSignal, onCleanup, onMount } from "solid-js";

import { notifyError, notifySuccess, notifyWarning } from "../services/toastService";
import { isDialogPending } from "../services/dialogs";
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
  refreshWorkspaceTree,
  reloadSelectedDocument,
  startWorkspaceWatcher,
} from "../workspace/store";
import { matchCombo } from "../data/shortcuts";
import { isCapturingCombo, liveShortcuts } from "../services/shortcuts";
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
   * La paleta de comandos: si está abierta y en qué modo empieza. Vive aquí
   * porque se abre desde el teclado global (`Ctrl+K`, `Ctrl+Mayús+P`) y se usa
   * desde el escritorio y desde el móvil, y ninguno de los dos es su dueño.
   */
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteMode, setPaletteMode] = createSignal<"notes" | "commands">("notes");

  function openPalette(mode: "notes" | "commands"): void {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }

  function closePalette(): void {
    setPaletteOpen(false);
  }
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

  /**
   * Guardar ahora, lo use quien lo use: el atajo `Ctrl+S` o el comando de la
   * paleta. Estaba dentro del manejador del atajo; al sacarlo, los dos hacen lo
   * mismo sin copiarse el código.
   */
  async function saveNow(): Promise<void> {
    if (saveShortcutBusy) return;
    saveShortcutBusy = true;
    try {
      const whiteboardSaved = await saveActiveWhiteboard();
      if (!whiteboardSaved) return;
      const saved = await flushPendingSave();
      if (saved) notifySuccess("Cambios guardados");
    } finally {
      saveShortcutBusy = false;
    }
  }

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
    /*
     * Los atajos globales, leyendo el mapa vivo: si Ajustes reasigna uno, la
     * siguiente pulsación ya lo respeta, sin recargar nada.
     */
    const onGlobalShortcut = (event: KeyboardEvent): void => {
      if (isCapturingCombo()) return;
      if (event.defaultPrevented) return; // Ya lo manejó alguien más abajo (p. ej. el editor).
      const map = liveShortcuts();
      // Guardar ahora.
      if (matchCombo(map["nota.save"], event)) {
        if (saveShortcutBusy) return;
        event.preventDefault();
        void saveNow();
        return;
      }
      // Recargar la nota del disco: el editor se sincroniza con lo que hay en el
      // archivo, que es la respuesta a un «actualizar» de quien escribe.
      if (matchCombo(map["nota.reload"], event)) {
        if (isDialogPending() || settingsOpen()) return;
        event.preventDefault();
        void reloadSelectedDocument().then((ok) => {
          if (ok) notifySuccess("Nota actualizada desde el disco");
        });
        return;
      }
      // Actualizar la lista de notas.
      if (matchCombo(map["app.refresh"], event)) {
        event.preventDefault();
        void refreshWorkspaceTree();
        return;
      }
      // La paleta: `Ctrl+K` para ir a una nota, `Ctrl+Mayús+P` para comandos. No
      // se abre sobre un diálogo —una pregunta a medias no se tapa con otra
      // ventana— ni sobre Ajustes o el historial, que ya son modales.
      if (matchCombo(map["app.palette"], event)) {
        if (isDialogPending() || settingsOpen() || history.path() || paletteOpen()) return;
        event.preventDefault();
        openPalette("notes");
        return;
      }
      if (matchCombo(map["app.paletteCommands"], event)) {
        if (isDialogPending() || settingsOpen() || history.path() || paletteOpen()) return;
        event.preventDefault();
        openPalette("commands");
        return;
      }
      // Mostrar u ocultar la lista de notas.
      if (matchCombo(map["app.sidebar"], event)) {
        event.preventDefault();
        toggleSidebar();
        return;
      }
    };
    document.addEventListener("keydown", onGlobalShortcut);
    onCleanup(() => document.removeEventListener("keydown", onGlobalShortcut));
    onCleanup(stopWatchingSystem);
    onCleanup(stopWatchingWorkspace);
  });

  return {
    appearance,
    explorer,
    history,
    settingsOpen,
    setSettingsOpen,
    paletteOpen,
    paletteMode,
    openPalette,
    closePalette,
    saveNow,
    sidebarOpen,
    sidebarWidth,
    setSidebarOpen,
    setSidebarWidth,
    toggleSidebar,
  };
}
