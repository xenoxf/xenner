import { createSignal } from "solid-js";

import { loadSkin } from "../services/skinLoader";
import { startSkinWatcher } from "../services/skinWatcher";
import {
  applyAppearance,
  readAppearance,
  saveAppearance,
  watchSystemColorScheme,
} from "../services/appearance";
import type { Appearance } from "../types/appearance";
import type { SkinInfo } from "../types/skin";

// El modo claro/oscuro ya no recarga la skin: `applyAppearance` conmuta
// `data-color-scheme` y `styles/global.css` conmuta la paleta base. Solo hace
// falta volver a leer los TXT cuando cambia la skin activa, cuando cambia la de
// Apariencia, o cuando alguien edita un archivo de la skin con la app abierta.
export function useAppearanceController() {
  const [skins, setSkins] = createSignal<SkinInfo[]>([]);
  const [activeSkin, setActiveSkin] = createSignal("");
  const [skinLoading, setSkinLoading] = createSignal(true);
  const [appearance, setAppearance] = createSignal<Appearance>(readAppearance());
  let skinRequest = 0;

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

  function updateAppearance(next: Appearance): void {
    setAppearance(next);
    saveAppearance(next);
    applyAppearance(next);
  }

  function skinCreated(skin: SkinInfo): void {
    setSkins((previous) => [
      ...previous.filter((candidate) => candidate.id !== skin.id),
      skin,
    ]);
    void changeSkin(skin.id);
  }

  function start(): () => void {
    applyAppearance(appearance());
    void changeSkin();

    // Editar un TXT o `custom.css` con la app abierta recarga el aspecto sin
    // reiniciar: es lo que hace falta para que probar una skin sea probar,
    // editar y mirar.
    const stopWatchingSkins = startSkinWatcher(activeSkin, (loaded) => {
      setSkins(loaded.skins);
      setActiveSkin(loaded.activeId);
    });

    // El watcher de Apariencia solo mantiene `data-color-scheme` al día cuando
    // el modo es "system"; la paleta clara/oscura la aplica el CSS.
    const stopWatchingSystem = watchSystemColorScheme(() => {
      if (appearance().mode === "system") applyAppearance(appearance());
    });

    return () => {
      stopWatchingSkins();
      stopWatchingSystem();
    };
  }

  return {
    skins,
    activeSkin,
    skinLoading,
    appearance,
    changeSkin,
    updateAppearance,
    skinCreated,
    start,
  };
}
