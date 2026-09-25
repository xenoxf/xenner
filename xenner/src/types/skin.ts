import type { ColorScheme } from "./appearance";

export type SkinComponent = "background" | "button" | "note" | "sidebar" | "input" | "toolbar";

export type SkinColorKey =
  | "background"
  | "surface"
  | "panel"
  | "text"
  | "textDim"
  | "border"
  | "accent"
  | "hover"
  | "active";

export type SkinShadow = "none" | "soft" | "strong";

export interface SkinPalette {
  background: string;
  surface: string;
  panel: string;
  text: string;
  textDim: string;
  border: string;
  accent: string;
  hover: string;
  active: string;
}

export interface SkinInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  origin: "system" | "user";
  editable: boolean;
}

export interface LoadedSkin {
  activeId: string;
  skins: SkinInfo[];
}

export interface CreateSkinRequest {
  id: string;
  name: string;
  version: string;
  author: string;
  components: Record<string, Record<string, string>>;
}

export interface SkinDraft {
  name: string;
  mode: ColorScheme;
  accent: string;
  background: string;
  surface: string;
  panel: string;
  text: string;
  textDim: string;
  border: string;
  hover: string;
  active: string;
  radius: number;
  blur: number;
  borderWidth: number;
  shadow: SkinShadow;
  font: string;
}

export interface SkinPreset {
  label: string;
  draft: SkinDraft;
}
