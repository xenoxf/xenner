import type { SkinDraft } from "../types/skin";

export const DEFAULT_SKIN_DRAFT: SkinDraft = {
  name: "Mi skin",
  accent: "#2383e2",
  mode: "dark",
  radius: 10,
  font: "system",
};

export const SKIN_FONT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "serif", label: "Editorial serif" },
  { value: "mono", label: "Monoespaciada" },
];
