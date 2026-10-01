import { invoke, isTauri } from "@tauri-apps/api/core";

import { COMPONENTES, emptyEditor, fileWith, resolverAssets } from "./editor.ts";
import { parseSkinComponent } from "./parse.ts";
import { DEFAULT_SKIN_DRAFT } from "../data/skin.ts";
import type {
  CreateSkinRequest,
  SkinDraft,
  SkinEditor,
  SkinInfo,
  SkinPalette,
} from "../types/skin";

/**
 * Los temas antiguos guardaban un identificador corto ("serif", "mono") en vez de
 * la pila de CSS completa. Se siguen entendiendo para no romper lo ya creado.
 */
const LEGACY_FONT_STACKS: Record<string, string> = {
  system: "system-ui, sans-serif",
  serif: 'Georgia, "Noto Serif", serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  rounded: 'ui-rounded, "SF Pro Rounded", "Segoe UI", sans-serif',
  display: '"Avenir Next", "Trebuchet MS", sans-serif',
};

/** Normaliza a una pila de CSS segura, cayendo en la de sistema. */
export function resolveFontStack(value: string): string {
  const legacy = LEGACY_FONT_STACKS[value];
  if (legacy) return legacy;
  if (value.length > 0 && value.length <= 160 && /^[a-zA-Z0-9 ,.'\"()_-]+$/.test(value)) {
    return value;
  }
  return LEGACY_FONT_STACKS.system;
}

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

/**
 * Un color transparente es un caso aparte y muy usado: los vidrios y los fondos
 * de foto se hacen con `rgba` o con `#rrggbbaa`, y el selector de color del
 * navegador no sabe escribirlos.
 */
const RGBA_PATTERN = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i;

export function isColorValue(value: string): boolean {
  const v = value.trim();
  return COLOR_PATTERN.test(v) || RGBA_PATTERN.test(v) || v === "transparent";
}

/** Los nueve colores, con su nombre de pantalla, no su nombre técnico. */
export const CAMPOS_COLOR: readonly (keyof SkinPalette)[] = [
  "background",
  "surface",
  "panel",
  "text",
  "textDim",
  "border",
  "accent",
  "hover",
  "active",
];

/**
 * Vuelca un `SkinDraft` —el resumen de los deslizadores— en los seis archivos.
 *
 * Es lo que hace que el camino corto siga siendo corto: quien mueve un color no
 * ve seis archivos, pero lo que sale son exactamente los mismos archivos de
 * texto que vería si los escribiera a mano. Un panel que guardara en otro sitio
 * y una edición a mano que guardara en el suyo acabarían discrepando, y siempre
 * con la culpa en el panel, que es el que nadie mira.
 */
export function buildSkinComponents(draft: SkinDraft): Record<string, Record<string, string>> {
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
  const font = resolveFontStack(draft.font);
  const shadow = shadowValue(draft.shadow);

  return {
    background: {
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
    },
    button: {
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
    },
    note: {
      background: surface,
      backgroundHover: hover,
      text,
      border,
      radius: `${radius}px`,
      blur: `${blur}px`,
      shadow,
      accent,
      font,
    },
    sidebar: {
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
    },
    input: {
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
    },
    toolbar: {
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
    },
  };
}

/** El mismo volcado, pero a un editor. De aquí sale el tema que se guarda. */
export function draftToEditor(draft: SkinDraft): SkinEditor {
  const editor = emptyEditor(draft.name);
  const componentes = buildSkinComponents(draft);
  let salida = editor;
  for (const component of COMPONENTES) {
    const values = componentes[component];
    if (!values) continue;
    salida = fileWith(
      salida,
      component,
      Object.entries(values)
        .map(([key, value]) => `${key}="${value}"`)
        .join("\n"),
    );
  }
  return { ...salida, mode: draft.mode };
}

/**
 * Saca el color de un valor de borde, venga como venga.
 *
 * El deslizador de bordes maneja un color, pero el archivo guarda la línea
 * entera —`1px solid #333`—. Sin esto el selector se caería al valor de fábrica
 * en cuanto se tocara el borde, que es el ajuste más tocado de todos: la
 * garantía de que la ida y vuelta funciona se rompía justo en el campo más
 * usado.
 */
export function colorFromBorder(value: string): string {
  const v = value.trim();
  if (isColorValue(v)) return v;
  // Primero lo que parezca un color en hexadecimal, y si no un `rgba(…)`, que es
  // la otra forma que aparece en la práctica.
  const hex = /#[0-9a-f]{3,8}\b/i.exec(v);
  if (hex) return hex[0];
  const rgb = /rgba?\([^)]*\)/i.exec(v);
  if (rgb) return rgb[0];
  return "";
}

/** El grosor de un valor de borde: el primer número, que es el del ancho. */
export function widthFromBorder(value: string, fallback: number): number {
  const parsed = parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Lee un `SkinDraft` de un editor, para que el panel con deslizadores siga
 * teniendo algo que enseñar cuando el tema se ha editado a mano.
 *
 * Lo que no encuentra se queda como Xenner lo tendría sin skin, no como el otro
 * tema: así el panel nunca inventa un valor que no está en el archivo.
 */
export function editorToDraft(editor: SkinEditor): SkinDraft {
  const leer = (component: string, key: string): string => {
    const coincidencia = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(
      editor.files[component] ?? "",
    );
    return coincidencia?.[1] ?? "";
  };

  const color = (component: string, key: string, fallback: string): string => {
    const value = leer(component, key);
    return isColorValue(value) ? value.trim() : fallback;
  };

  const numero = (component: string, key: string, fallback: number): number => {
    const value = parseFloat(leer(component, key));
    return Number.isFinite(value) ? value : fallback;
  };

  const shadowCrudo = leer("note", "shadow").trim();
  const shadow: SkinDraft["shadow"] =
    shadowCrudo === "none" ? "none" : shadowCrudo.startsWith("0 16px") ? "strong" : "soft";

  return {
    name: editor.name,
    mode: editor.mode,
    background: color("background", "background", DEFAULT_SKIN_DRAFT.background),
    surface: color("note", "background", DEFAULT_SKIN_DRAFT.surface),
    panel: color("sidebar", "background", DEFAULT_SKIN_DRAFT.panel),
    text: color("note", "text", DEFAULT_SKIN_DRAFT.text),
    textDim: color("sidebar", "textDim", DEFAULT_SKIN_DRAFT.textDim),
    border: colorFromBorder(leer("sidebar", "border")) || DEFAULT_SKIN_DRAFT.border,
    accent: color("note", "accent", DEFAULT_SKIN_DRAFT.accent),
    hover: color("sidebar", "itemHover", DEFAULT_SKIN_DRAFT.hover),
    active: color("sidebar", "itemActive", DEFAULT_SKIN_DRAFT.active),
    radius: numero("note", "radius", DEFAULT_SKIN_DRAFT.radius),
    blur: numero("note", "blur", DEFAULT_SKIN_DRAFT.blur),
    borderWidth: widthFromBorder(leer("sidebar", "border"), DEFAULT_SKIN_DRAFT.borderWidth),
    shadow,
    font: leer("note", "font") || DEFAULT_SKIN_DRAFT.font,
  };
}

/**
 * El estilo de la previsualización, con las imágenes ya resueltas.
 *
 * Pasa por el parser de verdad y no por los valores en crudo, así que la
 * previsualización enseña exactamente lo que va a verse: una línea que Xenner va
 * a ignorar se ve sin efecto en el panel, que es la mitad del ahorro de
 * sorpresas.
 */
export function buildEditorPreviewStyle(editor: SkinEditor): string {
  const declaraciones: string[] = [];
  for (const component of COMPONENTES) {
    const values = resolverAssets(
      parseSkinComponent(component, editor.files[component] ?? ""),
      editor.assets,
    );
    for (const [key, value] of Object.entries(values)) {
      declaraciones.push(`--skin-${component}-${key}:${value}`);
    }
  }
  return declaraciones.join(";");
}

/** Crea un tema nuevo, o guarda encima del que ya se está editando. */
export async function saveUserSkin(
  editor: SkinEditor,
  opciones: { id?: string; overwrite?: boolean } = {},
): Promise<SkinInfo> {
  const id = opciones.id ?? slugifySkinId(editor.name);
  const request: CreateSkinRequest = {
    id,
    name: editor.name.trim() || id,
    version: "1.0.0",
    author: "Xenner",
    components: {},
    files: Object.fromEntries(
      COMPONENTES.filter((component) => (editor.files[component] ?? "").trim() !== "").map(
        (component) => [component, editor.files[component]],
      ),
    ),
    customCss: editor.customCss.trim() === "" ? undefined : editor.customCss,
    assets: editor.assets,
    overwrite: opciones.overwrite ?? false,
  };

  if (!isTauri()) {
    // La previsualización en el navegador guarda en `localStorage`, con la misma
    // forma que el backend leería del disco. Es lo que permite probar el flujo
    // entero sin compilar.
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
      existing[id] = { info, files: request.files, customCss: request.customCss ?? "" };
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // La vista previa del navegador puede seguir funcionando sin persistencia.
    }
    return info;
  }

  return invoke<SkinInfo>("create_skin", { request });
}

/** Lee los archivos de un tema para poder editarlos. */
export async function readUserSkinFiles(id: string): Promise<SkinEditor> {
  const editor = emptyEditor();
  let editorConNombre = { ...editor, files: { ...editor.files } };

  if (!isTauri()) {
    try {
      const raw = localStorage.getItem("xenner:user-skins:preview:v1");
      const parsed = raw ? (JSON.parse(raw) as Record<string, { info?: SkinInfo; files?: Record<string, string> }>) : {};
      const guardado = parsed[id];
      if (guardado) {
        editorConNombre = {
          ...editorConNombre,
          name: guardado.info?.name ?? id,
          files: { ...editorConNombre.files, ...(guardado.files ?? {}) },
        };
      }
    } catch {
      // Sin persistencia se abre un editor vacío, que es mejor que no abrir nada.
    }
    return editorConNombre;
  }

  for (const component of COMPONENTES) {
    try {
      const text = await invoke<string>("read_skin_file", { skin: id, file: component });
      if (text) {
        editorConNombre = fileWith(editorConNombre, component, text);
      }
    } catch {
      // Un componente que no se puede leer no invalida el resto del tema.
    }
  }
  try {
    const css = await invoke<string>("read_skin_file", { skin: id, file: "custom" });
    if (css) editorConNombre = { ...editorConNombre, customCss: css };
  } catch {
    // Igual que arriba: el CSS es opcional.
  }
  return editorConNombre;
}

/** El identificador del tema que se está editando, a partir de su nombre. */
export function editorId(editor: SkinEditor, existingId?: string): string {
  return existingId ?? slugifySkinId(editor.name);
}
