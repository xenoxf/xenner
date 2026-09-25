import type { ColorScheme } from "../types/appearance";
import type { SkinColorKey, SkinDraft, SkinPalette, SkinPreset, SkinShadow } from "../types/skin";

export const SKIN_PALETTES: Record<ColorScheme, SkinPalette> = {
  dark: {
    background: "#191919",
    surface: "#202020",
    panel: "#252525",
    text: "#e7e7e4",
    textDim: "#9b9b98",
    border: "#3c3c39",
    accent: "#5b9bd5",
    hover: "#2b2b2a",
    active: "#343431",
  },
  light: {
    background: "#ffffff",
    surface: "#ffffff",
    panel: "#f7f7f5",
    text: "#2f2f2f",
    textDim: "#787774",
    border: "#e3e2e0",
    accent: "#2383e2",
    hover: "#efefed",
    active: "#e7e7e4",
  },
};

export const DEFAULT_SKIN_DRAFT: SkinDraft = {
  name: "Mi skin",
  mode: "dark",
  ...SKIN_PALETTES.dark,
  radius: 12,
  blur: 0,
  borderWidth: 1,
  shadow: "soft",
  font: "system",
};

export const SKIN_COLOR_FIELDS: readonly { key: SkinColorKey; label: string }[] = [
  { key: "background", label: "Fondo de la app" },
  { key: "surface", label: "Superficie" },
  { key: "panel", label: "Paneles" },
  { key: "text", label: "Texto" },
  { key: "textDim", label: "Texto suave" },
  { key: "border", label: "Bordes" },
  { key: "accent", label: "Acento" },
  { key: "hover", label: "Hover" },
  { key: "active", label: "Selección" },
];

export const SKIN_SHADOW_OPTIONS: readonly { value: SkinShadow; label: string }[] = [
  { value: "none", label: "Sin sombra" },
  { value: "soft", label: "Suave" },
  { value: "strong", label: "Marcada" },
];

export const SKIN_FONT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "serif", label: "Editorial serif" },
  { value: "mono", label: "Monoespaciada" },
  { value: "rounded", label: "Redondeada" },
  { value: "display", label: "Display" },
];

export const SKIN_PRESETS: readonly SkinPreset[] = [
  {
    label: "Noche",
    draft: {
      ...DEFAULT_SKIN_DRAFT,
      name: "Noche",
      radius: 16,
      shadow: "strong",
    },
  },
  {
    label: "Papel",
    draft: {
      ...DEFAULT_SKIN_DRAFT,
      ...SKIN_PALETTES.light,
      name: "Papel",
      mode: "light",
      radius: 5,
      borderWidth: 1,
      shadow: "soft",
      font: "serif",
    },
  },
  {
    label: "Neón",
    draft: {
      ...DEFAULT_SKIN_DRAFT,
      name: "Neón",
      accent: "#c084fc",
      hover: "#3b1d58",
      active: "#6d28d9",
      radius: 20,
      blur: 8,
      borderWidth: 1,
      shadow: "strong",
      font: "display",
    },
  },
  {
    label: "Cristal",
    draft: {
      ...DEFAULT_SKIN_DRAFT,
      ...SKIN_PALETTES.light,
      name: "Cristal",
      mode: "light",
      background: "#dbeafecc",
      surface: "#ffffffaa",
      panel: "#eff6ffb3",
      text: "#172554",
      textDim: "#64748b",
      border: "#ffffff99",
      accent: "#2563eb",
      hover: "#ffffff66",
      active: "#bfdbfe99",
      radius: 24,
      blur: 20,
      borderWidth: 1,
      shadow: "strong",
    },
  },
];
