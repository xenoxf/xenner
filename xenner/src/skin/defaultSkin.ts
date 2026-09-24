// Skin default EMBEBIDA (vidrio esmerilado). Idéntica a
// skins/glass-default/*.txt. Si cualquier I/O de skins falla, la app se
// resuelve contra este diccionario.

export type SkinVars = Record<string, string>;

export const DEFAULT_SKIN: Record<string, SkinVars> = {
  background: {
    background: "rgba(28,34,44,0.34)",
    overlay:
      "radial-gradient(circle at 8% 6%, rgba(255,255,255,0.20), transparent 32%), radial-gradient(circle at 92% 14%, rgba(177,198,214,0.16), transparent 38%), radial-gradient(circle at 68% 94%, rgba(111,130,148,0.12), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.08), rgba(36,43,54,0.10))",
    blur: "32px",
    border: "1px solid rgba(255,255,255,0.24)",
    radius: "24px",
    shadow: "0 20px 60px rgba(8,12,18,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
    text: "#f4f7fb",
    textDim: "rgba(244,247,251,0.70)",
    accent: "#b7cee1",
    font: "Inter, Avenir, Helvetica, Arial, sans-serif",
  },
  button: {
    background: "rgba(226,232,240,0.12)",
    backgroundHover: "rgba(226,232,240,0.22)",
    text: "#f4f7fb",
    textHover: "#ffffff",
    border: "1px solid rgba(255,255,255,0.28)",
    borderHover: "1px solid rgba(183,206,225,0.78)",
    radius: "12px",
    blur: "20px",
    shadow: "0 8px 20px rgba(8,12,18,0.20), inset 0 1px 0 rgba(255,255,255,0.18)",
    accent: "#b7cee1",
  },
  note: {
    background: "rgba(226,232,240,0.11)",
    backgroundHover: "rgba(226,232,240,0.16)",
    text: "#f4f7fb",
    border: "1px solid rgba(255,255,255,0.24)",
    radius: "20px",
    blur: "28px",
    shadow: "0 18px 48px rgba(8,12,18,0.24), inset 0 1px 0 rgba(255,255,255,0.16)",
    accent: "#b7cee1",
  },
  sidebar: {
    background: "rgba(226,232,240,0.085)",
    text: "#f4f7fb",
    textDim: "rgba(244,247,251,0.66)",
    itemHover: "rgba(226,232,240,0.13)",
    itemActive: "rgba(183,206,225,0.18)",
    border: "1px solid rgba(255,255,255,0.20)",
    radius: "20px",
    blur: "30px",
    shadow: "0 16px 42px rgba(8,12,18,0.22), inset 0 1px 0 rgba(255,255,255,0.14)",
    accent: "#b7cee1",
  },
  input: {
    background: "rgba(12,17,26,0.34)",
    text: "#f4f7fb",
    placeholder: "rgba(244,247,251,0.48)",
    border: "1px solid rgba(255,255,255,0.22)",
    focus: "#b7cee1",
    radius: "14px",
    blur: "18px",
    shadow: "inset 0 1px 14px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.08)",
  },
  toolbar: {
    background: "rgba(226,232,240,0.12)",
    text: "#f4f7fb",
    textDim: "rgba(244,247,251,0.70)",
    border: "1px solid rgba(255,255,255,0.28)",
    radius: "18px",
    blur: "30px",
    shadow: "0 10px 30px rgba(8,12,18,0.22), inset 0 1px 0 rgba(255,255,255,0.20)",
    accent: "#b7cee1",
  },
};
