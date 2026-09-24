import { invoke, isTauri } from "@tauri-apps/api/core";

import { DEFAULT_SKIN_DRAFT } from "../data/skin.ts";
import type { CreateSkinRequest, SkinDraft, SkinInfo } from "../types/skin";

const FONT_STACKS: Record<string, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Noto Serif", serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  rounded: 'ui-rounded, "SF Pro Rounded", "Segoe UI", sans-serif',
  display: '"Avenir Next", "Trebuchet MS", sans-serif',
};

const COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function safeColor(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

function safeNumber(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

function shadowValue(shadow: SkinDraft["shadow"]): string {
  if (shadow === "none") return "none";
  if (shadow === "strong") return "0 16px 42px rgba(0,0,0,0.28)";
  return "0 8px 24px rgba(0,0,0,0.14)";
}

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
  const background = safeColor(draft.background, DEFAULT_SKIN_DRAFT.background);
  const surface = safeColor(draft.surface, DEFAULT_SKIN_DRAFT.surface);
  const panel = safeColor(draft.panel, DEFAULT_SKIN_DRAFT.panel);
  const text = safeColor(draft.text, DEFAULT_SKIN_DRAFT.text);
  const textDim = safeColor(draft.textDim, DEFAULT_SKIN_DRAFT.textDim);
  const borderColor = safeColor(draft.border, DEFAULT_SKIN_DRAFT.border);
  const accent = safeColor(draft.accent, DEFAULT_SKIN_DRAFT.accent);
  const hover = safeColor(draft.hover, DEFAULT_SKIN_DRAFT.hover);
  const active = safeColor(draft.active, DEFAULT_SKIN_DRAFT.active);
  const radius = safeNumber(draft.radius, 0, 64, DEFAULT_SKIN_DRAFT.radius);
  const blur = safeNumber(draft.blur, 0, 48, DEFAULT_SKIN_DRAFT.blur);
  const borderWidth = safeNumber(draft.borderWidth, 0, 4, DEFAULT_SKIN_DRAFT.borderWidth);
  const border = borderWidth === 0 ? "1px solid transparent" : `${borderWidth}px solid ${borderColor}`;
  const font = FONT_STACKS[draft.font] ?? FONT_STACKS.system;
  const shadow = shadowValue(draft.shadow);

  return {
    background: component({
      background,
      overlay: "none",
      text,
      textDim,
      border,
      radius: "0px",
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    }),
    button: component({
      background: surface,
      backgroundHover: hover,
      text,
      textHover: accent,
      border: "1px solid transparent",
      borderHover: `1px solid ${accent}`,
      radius: `${radius}px`,
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    }),
    note: component({
      background: surface,
      backgroundHover: hover,
      text,
      border,
      radius: `${radius}px`,
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    }),
    sidebar: component({
      background: panel,
      text,
      textDim,
      itemHover: hover,
      itemActive: active,
      border,
      radius: "0px",
      blur: `${blur}px`,
      shadow: "none",
      accent,
      font,
    }),
    input: component({
      background: surface,
      text,
      placeholder: textDim,
      border,
      focus: accent,
      radius: `${Math.max(0, radius - 4)}px`,
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    }),
    toolbar: component({
      background: panel,
      backgroundHover: hover,
      text,
      textDim,
      border,
      radius: "0px",
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    }),
  };
}

export function buildSkinPreviewStyle(draft: SkinDraft): string {
  const components = buildSkinComponents(draft);
  const declarations: string[] = [];
  for (const [componentName, values] of Object.entries(components)) {
    for (const [key, value] of Object.entries(values)) {
      declarations.push(`--skin-${componentName}-${key}:${value}`);
    }
  }
  return declarations.join(";");
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
