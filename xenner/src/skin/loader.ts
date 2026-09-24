// SkinEngine: carga la skin activa y la publica como variables CSS
// `--skin-<componente>-<clave>` en :root.
//
// Cadena de fallback POR CADA fichero:
//   1) comandos Tauri (runtime desktop)
//   2) bundle Vite de xenner/skins/**/*.txt (pnpm dev sin Tauri)
//   3) DEFAULT_SKIN embebida
// Regla: loadSkin() nunca lanza excepción sin capturar.

import { invoke } from "@tauri-apps/api/core";
import {
  parseSkinComponent,
  parseSkinConfig,
  parseSkinManifest,
} from "./parse";
import { DEFAULT_SKIN, type SkinVars } from "./defaultSkin";

export const SKIN_COMPONENTS = [
  "background",
  "button",
  "note",
  "sidebar",
  "input",
  "toolbar",
] as const;

export type SkinComponent = (typeof SKIN_COMPONENTS)[number];

export interface SkinInfo {
  id: string;
  name: string;
  version: string;
  author: string;
}

export interface LoadedSkin {
  activeId: string;
  skins: SkinInfo[];
}

// Bundling de skins para dev sin runtime Tauri (rutas relativas a este módulo).
const BUNDLE = import.meta.glob("../../skins/**/*.txt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

async function tauriReadConfig(): Promise<string | null> {
  try {
    return await invoke<string>("read_config");
  } catch {
    return null;
  }
}

async function tauriScan(): Promise<SkinInfo[] | null> {
  try {
    return await invoke<SkinInfo[]>("scan_skins");
  } catch {
    return null;
  }
}

async function tauriReadFile(skin: string, file: string): Promise<string | null> {
  try {
    return await invoke<string>("read_skin_file", { skin, file });
  } catch {
    return null;
  }
}

function bundleSkins(): SkinInfo[] {
  const re = /^\.\.\/\.\.\/skins\/([^/]+)\/skin\.txt$/;
  const infos: SkinInfo[] = [];
  for (const [path, raw] of Object.entries(BUNDLE)) {
    const m = path.match(re);
    if (!m) continue;
    const id = m[1];
    const manifest = parseSkinManifest(raw);
    infos.push({
      id,
      name: manifest.name || id,
      version: manifest.version || "",
      author: manifest.author || "",
    });
  }
  infos.sort((a, b) => a.id.localeCompare(b.id));
  return infos;
}

function bundleConfig(): string {
  return BUNDLE["../../skins/config.txt"] ?? "";
}

async function readComponentText(
  activeId: string,
  component: SkinComponent,
): Promise<string | null> {
  if (!activeId) return null;
  const viaTauri = await tauriReadFile(activeId, component);
  if (viaTauri !== null) return viaTauri;
  return BUNDLE[`../../skins/${activeId}/${component}.txt`] ?? null;
}

const appliedVars = new Set<string>();

function applyVars(vars: Record<string, SkinVars>): void {
  const root = document.documentElement;
  for (const name of appliedVars) root.style.removeProperty(name);
  appliedVars.clear();
  for (const [component, values] of Object.entries(vars)) {
    for (const [key, value] of Object.entries(values)) {
      const name = `--skin-${component}-${key}`;
      root.style.setProperty(name, value);
      appliedVars.add(name);
    }
  }
}

/**
 * Carga la skin activa (config.txt, o `preferredId` si se indicó) y aplica
 * sus variables CSS. Resolución por clave: skin activa → default embebida.
 * Cualquier fallo en cualquier nivel cae al siguiente; jamás propaga error.
 */
export async function loadSkin(preferredId?: string): Promise<LoadedSkin> {
  try {
    let skins = await tauriScan();
    if (!skins || skins.length === 0) skins = bundleSkins();

    let cfg = await tauriReadConfig();
    if (cfg === null) cfg = bundleConfig();
    const configId = parseSkinConfig(cfg).skinPath ?? "";
    const activeId = preferredId ?? configId;

    const vars: Record<string, SkinVars> = {};
    for (const component of SKIN_COMPONENTS) {
      // Empezamos SIEMPRE por la default: así una skin parcial (o rota)
      // solo sobreescribe lo que define y el resto queda en default.
      const merged: SkinVars = { ...DEFAULT_SKIN[component] };
      const text = await readComponentText(activeId, component);
      if (text !== null) Object.assign(merged, parseSkinComponent(component, text));
      vars[component] = merged;
    }
    applyVars(vars);

    if (activeId && !skins.some((s) => s.id === activeId)) {
      console.warn(
        `[xenner] skin "${activeId}" no encontrada en scan: usando default embebida para claves ausentes`,
      );
    }
    return { activeId, skins };
  } catch (err) {
    console.warn("[xenner] loadSkin falló, se aplica default embebida:", err);
    try {
      const vars: Record<string, SkinVars> = {};
      for (const component of SKIN_COMPONENTS) {
        vars[component] = { ...DEFAULT_SKIN[component] };
      }
      applyVars(vars);
    } catch {
      /* nunca propagar */
    }
    return { activeId: "", skins: [] };
  }
}
