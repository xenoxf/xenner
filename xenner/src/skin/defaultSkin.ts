// Skin default EMBEBIDA (glassmorphism). Idéntica a skins/glass-default/*.txt.
// Si cualquier I/O de skins falla, la app se resuelve contra este diccionario.

export type SkinVars = Record<string, string>;

export const DEFAULT_SKIN: Record<string, SkinVars> = {
  background: {
    background: "rgba(255,255,255,0.06)",
    overlay:
      "linear-gradient(135deg, rgba(125,211,252,0.12), rgba(167,139,250,0.12))",
    blur: "24px",
    border: "1px solid rgba(255,255,255,0.18)",
    radius: "20px",
    shadow: "0 8px 32px rgba(0,0,0,0.30)",
    text: "#ffffff",
    textDim: "rgba(255,255,255,0.65)",
    accent: "#7dd3fc",
    font: "Inter, Avenir, Helvetica, Arial, sans-serif",
  },
  button: {
    background: "rgba(255,255,255,0.12)",
    backgroundHover: "rgba(255,255,255,0.24)",
    text: "#ffffff",
    textHover: "#ffffff",
    border: "1px solid rgba(255,255,255,0.25)",
    borderHover: "1px solid rgba(125,211,252,0.70)",
    radius: "10px",
    blur: "12px",
    shadow: "0 2px 12px rgba(0,0,0,0.25)",
    accent: "#7dd3fc",
  },
  note: {
    background: "rgba(255,255,255,0.10)",
    backgroundHover: "rgba(255,255,255,0.16)",
    text: "#ffffff",
    border: "1px solid rgba(255,255,255,0.18)",
    radius: "14px",
    blur: "16px",
    shadow: "0 4px 24px rgba(0,0,0,0.22)",
    accent: "#7dd3fc",
  },
  sidebar: {
    background: "rgba(255,255,255,0.05)",
    text: "#ffffff",
    textDim: "rgba(255,255,255,0.60)",
    itemHover: "rgba(255,255,255,0.12)",
    itemActive: "rgba(125,211,252,0.22)",
    border: "1px solid rgba(255,255,255,0.12)",
    radius: "14px",
    blur: "20px",
    shadow: "0 4px 24px rgba(0,0,0,0.20)",
    accent: "#7dd3fc",
  },
  input: {
    background: "rgba(0,0,0,0.25)",
    text: "#ffffff",
    placeholder: "rgba(255,255,255,0.45)",
    border: "1px solid rgba(255,255,255,0.16)",
    focus: "#7dd3fc",
    radius: "10px",
    blur: "8px",
    shadow: "inset 0 2px 8px rgba(0,0,0,0.30)",
  },
  toolbar: {
    background: "rgba(255,255,255,0.07)",
    text: "#ffffff",
    textDim: "rgba(255,255,255,0.60)",
    border: "1px solid rgba(255,255,255,0.12)",
    radius: "14px",
    blur: "20px",
    shadow: "0 2px 16px rgba(0,0,0,0.20)",
    accent: "#7dd3fc",
  },
};
