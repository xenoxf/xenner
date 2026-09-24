import { invoke, isTauri } from "@tauri-apps/api/core";

import type { CreateSkinRequest, SkinDraft, SkinInfo } from "../types/skin";

const FONT_STACKS: Record<string, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  const background = dark ? "#191919" : "#ffffff";
  const surface = dark ? "#202020" : "#ffffff";
  const surfaceContainer = dark ? "#252525" : "#f7f7f5";
  const onSurface = dark ? "#e7e7e4" : "#2f2f2f";
  const dim = dark ? "#9b9b98" : "#787774";
  const outline = dark ? "#3c3c39" : "#e3e2e0";
  const primaryContainer = dark ? "#343431" : "#e7e7e4";
  const onPrimary = dark ? "#e7e7e4" : "#2f2f2f";
  const hover = dark ? "#2b2b2a" : "#efefed";
  const shadow = dark ? "0 8px 28px rgba(0,0,0,0.28)" : "0 8px 28px rgba(15,15,15,0.10)";

  return {
    background: component({
      background,
      overlay: "none",
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
      background: "transparent",
      backgroundHover: hover,
      text: onPrimary,
      textHover: onSurface,
      border: "1px solid transparent",
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
