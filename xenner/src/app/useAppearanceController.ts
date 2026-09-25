import { createSignal } from "solid-js";

import { loadSkin } from "../services/skinLoader";
import {
  applyAppearance,
  readAppearance,
  resolveColorScheme,
  saveAppearance,
  watchSystemColorScheme,
} from "../services/appearance";
import type { Appearance, ColorScheme } from "../types/appearance";
import type { SkinInfo } from "../types/skin";

export function useAppearanceController() {
  const [skins, setSkins] = createSignal<SkinInfo[]>([]);
  const [activeSkin, setActiveSkin] = createSignal("");
  const [skinLoading, setSkinLoading] = createSignal(true);
  const [appearance, setAppearance] = createSignal<Appearance>(readAppearance());
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

  function start(): () => void {
    const initialAppearance = appearance();
    const initialScheme = applyAppearance(initialAppearance);
    void changeSkin(undefined, initialScheme);
    return watchSystemColorScheme((scheme) => {
      if (appearance().mode === "system") void changeSkin(activeSkin(), scheme);
    });
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
