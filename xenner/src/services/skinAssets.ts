import { invoke, isTauri } from "@tauri-apps/api/core";

import type { SkinAsset } from "../types/skin";

/**
 * Elegir una imagen de tu disco para usarla en el tema.
 *
 * La pieza que faltaba para que «un SVG de fondo en un botón» sea una cosa que
 * se hace y no una cosa que hay que saber escribir. El archivo no se copia
 * todavía: se queda en memoria hasta que se guarda el tema, y entonces entra
 * dentro de `assets/` de una sola vez. Así se pueden probar cinco fondos sin
 * dejar cinco archivos a medias, y cancelar no deja rastro.
 */

interface ChosenAsset {
  name: string;
  dataBase64: string;
  bytes: number;
}

const EXTENSIONES_PERMITIDAS = [
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "bmp",
  "ico",
  "woff2",
  "woff",
  "ttf",
  "otf",
];

const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

/**
 * El nombre dentro de `assets/`, con las mismas reglas que el backend.
 *
 * Se repiten aquí a propósito, y no por descuido: el nombre va escrito en el
 * `.txt` que se va a guardar, así que hay que poder calcularlo antes de tener
 * la carpeta. Si las reglas se moviean, el backend rechaza el nombre con un
 * error claro, que es justo el fallo que hay que prefirir a un tema guardado con
 * una imagen que apunta a ninguna parte.
 */
export function assetPathFor(name: string, taken: readonly string[] = []): string {
  const punto = name.lastIndexOf(".");
  const rawBase = punto > 0 ? name.slice(0, punto) : name;
  const extension = (punto > 0 ? name.slice(punto + 1) : "").toLowerCase();

  let base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (base === "") base = "imagen";

  // Dos archivos con el mismo nombre base se llaman distinto, en vez de que el
  // segundo pise al primero.
  let candidate = `${base}.${extension}`;
  let contador = 2;
  while (taken.includes(candidate)) {
    candidate = `${base}-${contador}.${extension}`;
    contador += 1;
  }
  return `assets/${candidate}`;
}

/** De `dataBase64` a `data:` URL, que es como lo pinta la previsualización. */
export function toDataUrl(asset: Pick<SkinAsset, "path" | "dataBase64">): string {
  const extension = asset.path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[extension] ?? "application/octet-stream";
  return `data:${mime};base64,${asset.dataBase64}`;
}

/** El nombre corto, para enseñarlo junto a la miniatura. */
export function assetName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Cuánto pesa, en un tamaño que se lee de un vistazo. */
export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Abre el diálogo y devuelve el asset, o `null` si se canceló.
 *
 * El error viene como texto y se enseña tal cual: un diálogo del sistema que no
 * se abre tiene un motivo, y Saying «no se pudo» sin más deja a quien lo ve
 * igual de perdido.
 */
export async function chooseSkinAsset(
  taken: readonly string[] = [],
): Promise<SkinAsset | null> {
  if (!isTauri()) {
    return {
      path: "assets/ejemplo.svg",
      name: "ejemplo.svg",
      dataUrl: SVG_DE_EJEMPLO,
      dataBase64: "",
      bytes: 0,
    };
  }

  const elegido = await invoke<ChosenAsset | null>("choose_skin_asset");
  if (!elegido) return null;

  const path = assetPathFor(elegido.name, taken);
  if (!EXTENSIONES_PERMITIDAS.includes(path.split(".").pop()?.toLowerCase() ?? "")) {
    throw new Error(`Xenner no sabe usar un archivo ${path.split(".").pop()}.`);
  }
  return {
    path,
    name: elegido.name,
    dataUrl: toDataUrl({ path, dataBase64: elegido.dataBase64 }),
    dataBase64: elegido.dataBase64,
    bytes: elegido.bytes,
  };
}

/** Un SVG de verdad, para que la previsualización del navegador no esté vacía. */
const SVG_DE_EJEMPLO =
  "data:image/svg+xml;base64," +
  btoaSafe(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
      `<rect width="48" height="48" rx="10" fill="#c9a227"/>` +
      `<path d="M14 30l7-9 5 6 4-5 4 8z" fill="#3b2f14"/>` +
      `<circle cx="32" cy="15" r="3.5" fill="#3b2f14"/></svg>`,
  );

/**
 * `btoa` solo acepta el rango Latin-1, y aquí solo hay ASCII. Se hace a mano
 * para que el módulo no dependa de que exista en el entorno donde se importa.
 */
function btoaSafe(texto: string): string {
  let salida = "";
  for (let i = 0; i < texto.length; i += 1) {
    const byte = texto.charCodeAt(i);
    if (byte > 0xff) continue;
    salida += String.fromCharCode(byte);
  }
  if (typeof btoa === "function") return btoa(salida);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  for (let i = 0; i < salida.length; i += 3) {
    const a = salida.charCodeAt(i);
    const b = i + 1 < salida.length ? salida.charCodeAt(i + 1) : 0;
    const c = i + 2 < salida.length ? salida.charCodeAt(i + 2) : 0;
    base64 += alphabet[a >> 2];
    base64 += alphabet[((a & 3) << 4) | (b >> 4)];
    base64 += i + 1 < salida.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    base64 += i + 2 < salida.length ? alphabet[c & 63] : "=";
  }
  return base64;
}
