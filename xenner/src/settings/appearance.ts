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

export const FONT_OPTIONS = [
  { id: "system", label: "Sistema", value: "system-ui, sans-serif" },
  { id: "roboto", label: "Roboto / Noto Sans", value: 'Roboto, "Noto Sans", system-ui, sans-serif' },
  { id: "inter", label: "Inter", value: 'Inter, "Noto Sans", system-ui, sans-serif' },
  { id: "serif", label: "Serif editorial", value: 'Georgia, "Noto Serif", serif' },
  { id: "mono", label: "Monoespaciada", value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
] as const;

const STORAGE_KEY = "xenner:appearance:v1";
const MIN_EDITOR_SIZE = 12;
const MAX_EDITOR_SIZE = 24;
const MIN_LINE_HEIGHT = 1.2;
const MAX_LINE_HEIGHT = 2.2;
const MIN_CONTENT_WIDTH = 560;
const MAX_CONTENT_WIDTH = 1200;

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  uiFont: FONT_OPTIONS[0].value,
  editorFont: FONT_OPTIONS[0].value,
  editorSize: 16,
  lineHeight: 1.7,
  contentWidth: 860,
};

function safeFont(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 160) return fallback;
  if (!/^[a-zA-Z0-9 ,.'\"()_-]+$/.test(value)) return fallback;
  if (
    value.includes(";") ||
    value.includes("{") ||
    value.includes("}") ||
    value.includes(":") ||
    value.includes("/") ||
    value.includes("\\") ||
    value.toLowerCase().includes("url(")
  ) return fallback;
  return value;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
  const candidate = value as Partial<Appearance>;
  return {
    mode:
      candidate.mode === "light" || candidate.mode === "dark" || candidate.mode === "system"
        ? candidate.mode
        : DEFAULT_APPEARANCE.mode,
    uiFont: safeFont(candidate.uiFont, DEFAULT_APPEARANCE.uiFont),
    editorFont: safeFont(candidate.editorFont, DEFAULT_APPEARANCE.editorFont),
    editorSize: Math.round(
      boundedNumber(candidate.editorSize, DEFAULT_APPEARANCE.editorSize, MIN_EDITOR_SIZE, MAX_EDITOR_SIZE),
    ),
    lineHeight: Number(
      boundedNumber(candidate.lineHeight, DEFAULT_APPEARANCE.lineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT).toFixed(2),
    ),
    contentWidth: Math.round(
      boundedNumber(candidate.contentWidth, DEFAULT_APPEARANCE.contentWidth, MIN_CONTENT_WIDTH, MAX_CONTENT_WIDTH),
    ),
  };
}

export function readAppearance(): Appearance {
  if (typeof localStorage === "undefined") return { ...DEFAULT_APPEARANCE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return sanitizeAppearance(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(appearance: Appearance): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAppearance(appearance)));
  } catch {
    // Una preferencia no esencial nunca debe impedir abrir la app.
  }
}

export function resolveColorScheme(appearance: Appearance): ColorScheme {
  if (appearance.mode !== "system") return appearance.mode;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(appearance: Appearance): ColorScheme {
  const scheme = resolveColorScheme(appearance);
  const root = document.documentElement;
  root.dataset.colorScheme = scheme;
  root.style.setProperty("--skin-ui-font", appearance.uiFont);
  root.style.setProperty("--skin-editor-font", appearance.editorFont);
  root.style.setProperty("--skin-editor-size", `${appearance.editorSize}px`);
  root.style.setProperty("--skin-editor-line-height", String(appearance.lineHeight));
  root.style.setProperty("--skin-content-width", `${appearance.contentWidth}px`);
  return scheme;
}

export function watchSystemColorScheme(callback: (scheme: ColorScheme) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => callback(media.matches ? "dark" : "light");
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener(listener);
  return () => media.removeListener(listener);
}
