import type { ColorScheme } from "./appearance";

export type SkinComponent = "background" | "button" | "note" | "sidebar" | "input" | "toolbar";

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
  accent: string;
  mode: ColorScheme;
  radius: number;
  font: string;
}
