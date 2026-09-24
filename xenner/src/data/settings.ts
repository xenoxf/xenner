import type { ThemeMode } from "../types/appearance";

export type SettingsSection = "appearance" | "skins" | "create";

export interface SettingsNavigationItem {
  id: SettingsSection;
  label: string;
  description: string;
}

export const THEME_MODES: readonly {
  id: ThemeMode;
  label: string;
  description: string;
}[] = [
  { id: "system", label: "Sistema", description: "Sigue el sistema" },
  { id: "light", label: "Claro", description: "Superficies neutras" },
  { id: "dark", label: "Oscuro", description: "Superficies neutras" },
];

export const SETTINGS_SECTIONS: readonly SettingsNavigationItem[] = [
  { id: "appearance", label: "Apariencia", description: "Tema y tipografía" },
  { id: "skins", label: "Skins", description: "Sistema y personales" },
  { id: "create", label: "Crear skin", description: "Diseñar un estilo" },
];
