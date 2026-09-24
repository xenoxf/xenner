import { invoke, isTauri } from "@tauri-apps/api/core";

import type { SkinInfo } from "./loader";
import type { ColorScheme } from "../settings/appearance";

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

const FONT_STACKS: Record<string, string> = {
  system: 'Roboto, "Noto Sans", system-ui, sans-serif',
  serif: 'Georgia, "Noto Serif", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export function slugifySkinId(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "mi-skin";
}

function component(values: Record<string, string>): Record<string, string> {
  return values;
}

export function buildSkinComponents(draft: SkinDraft): CreateSkinRequest["components"] {
  const dark = draft.mode === "dark";
  const accent = draft.accent;
  const radius = Math.round(draft.radius);
  const font = FONT_STACKS[draft.font] ?? FONT_STACKS.system;
  const background = dark ? "#141218" : "#fef7ff";
  const surface = dark ? "#211f26" : "#fffbff";
  const surfaceContainer = dark ? "#2b2930" : "#f3edf7";
  const onSurface = dark ? "#e6e0e9" : "#1d1b20";
  const dim = dark ? "#cac4d0" : "#49454f";
  const outline = dark ? "#938f99" : "#605d66";
  const primaryContainer = dark ? "#4f378b" : "#eaddff";
  const onPrimary = dark ? "#e8def8" : "#21005d";
  const hover = dark ? "#36343b" : "#ece6f0";
  const shadow = dark ? "0 1px 3px rgba(0,0,0,0.34)" : "0 1px 3px rgba(29,27,32,0.12)";

  return {
    background: component({
      background,
      overlay: `linear-gradient(145deg, ${surface}, ${primaryContainer})`,
      text: onSurface,
      textDim: dim,
      border: `1px solid ${outline}`,
      radius: "0px",
      blur: "0px",
      shadow,
      accent,
      font,
    }),
    button: component({
      background: primaryContainer,
      backgroundHover: hover,
      text: onPrimary,
      textHover: onPrimary,
      border: `1px solid ${accent}`,
      borderHover: `1px solid ${accent}`,
      radius: `${radius}px`,
      blur: "0px",
      shadow,
      accent,
      font,
    }),
    note: component({
      background: surface,
      backgroundHover: surfaceContainer,
      text: onSurface,
      border: `1px solid ${outline}`,
      radius: `${radius}px`,
      blur: "0px",
      shadow,
      accent,
      font,
    }),
    sidebar: component({
      background: surfaceContainer,
      text: onSurface,
      textDim: dim,
      itemHover: hover,
      itemActive: primaryContainer,
      border: `1px solid ${outline}`,
      radius: "0px",
      blur: "0px",
      shadow: "none",
      accent,
      font,
    }),
    input: component({
      background: surface,
      text: onSurface,
      placeholder: outline,
      border: `1px solid ${outline}`,
      focus: accent,
      radius: `${Math.max(4, radius - 4)}px`,
      blur: "0px",
      shadow,
      accent,
      font,
    }),
    toolbar: component({
      background: surfaceContainer,
      text: onSurface,
      textDim: dim,
      border: `1px solid ${outline}`,
      radius: "0px",
      blur: "0px",
      shadow,
      accent,
      font,
    }),
  };
}

export async function createUserSkin(draft: SkinDraft): Promise<SkinInfo> {
  const id = slugifySkinId(draft.name);
  const request: CreateSkinRequest = {
    id,
    name: draft.name.trim(),
    version: "1.0.0",
    author: "Xenner",
    components: buildSkinComponents(draft),
  };
  if (!isTauri()) {
    const info: SkinInfo = {
      id,
      name: request.name,
      version: request.version,
      author: request.author,
      origin: "user",
      editable: true,
    };
    try {
      const key = "xenner:user-skins:preview:v1";
      const raw = localStorage.getItem(key);
      const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      existing[id] = { info, components: request.components };
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // La vista previa del navegador puede seguir funcionando sin persistencia.
    }
    return info;
  }
  return invoke<SkinInfo>("create_skin", { request });
}
