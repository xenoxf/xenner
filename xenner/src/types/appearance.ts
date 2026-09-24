export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export interface Appearance {
  mode: ThemeMode;
  uiFont: string;
  editorFont: string;
  editorSize: number;
  lineHeight: number;
  contentWidth: number;
}

export interface FontOption {
  readonly id: "system" | "roboto" | "inter" | "serif" | "mono";
  readonly label: string;
  readonly value: string;
}
