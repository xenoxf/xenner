import type { ThemeMode } from "../types/appearance";

export type SettingsSection = "appearance" | "skins" | "create";

export interface SettingsNavigationItem {
  id: SettingsSection;
  label: string;
}

export const THEME_MODES: readonly {
  id: ThemeMode;
  label: string;
}[] = [
  { id: "system", label: "Sistema" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
];

export const SETTINGS_SECTIONS: readonly SettingsNavigationItem[] = [
  { id: "appearance", label: "Apariencia" },
  { id: "skins", label: "Skins" },
  { id: "create", label: "Crear skin" },
];
