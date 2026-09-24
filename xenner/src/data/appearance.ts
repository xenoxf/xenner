import type { FontOption } from "../types/appearance";

export const FONT_OPTIONS: readonly FontOption[] = [
  { id: "system", label: "Sistema", value: "system-ui, sans-serif" },
  { id: "roboto", label: "Roboto / Noto Sans", value: 'Roboto, "Noto Sans", system-ui, sans-serif' },
  { id: "inter", label: "Inter", value: 'Inter, "Noto Sans", system-ui, sans-serif' },
  { id: "serif", label: "Serif editorial", value: 'Georgia, "Noto Serif", serif' },
  { id: "mono", label: "Monoespaciada", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];
