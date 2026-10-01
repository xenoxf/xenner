import type { ColorScheme } from "./appearance";

export type SkinComponent = "background" | "button" | "note" | "sidebar" | "input" | "toolbar";

export type SkinColorKey =
  | "background"
  | "surface"
  | "panel"
  | "text"
  | "textDim"
  | "border"
  | "accent"
  | "hover"
  | "active";

export type SkinShadow = "none" | "soft" | "strong";

export interface SkinPalette {
  background: string;
  surface: string;
  panel: string;
  text: string;
  textDim: string;
  border: string;
  accent: string;
  hover: string;
  active: string;
}

export interface SkinInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  origin: "system" | "user";
  editable: boolean;
}

export interface LoadedSkin {
  activeId: string;
  skins: SkinInfo[];
}

/** Un archivo que la persona ha elegido de su disco para meter en la skin. */
export interface SkinAsset {
  /** La ruta dentro de la skin: `assets/fondo.svg`. También es la referencia. */
  path: string;
  /** El nombre original, solo para enseñárselo a quien lo ve. */
  name: string;
  /** Para la previsualización, antes de que exista la carpeta. */
  dataUrl: string;
  /** El contenido sin codificar, para mandarlo al backend al guardar. */
  dataBase64: string;
  /** Los bytes, para saber el tamaño sin preguntar. */
  bytes: number;
}

export interface CreateSkinRequest {
  id: string;
  name: string;
  version: string;
  author: string;
  /** Un mapa por componente. Lo rellena el panel con deslizadores. */
  components: Record<string, Record<string, string>>;
  /** El texto literal de cada `.txt`. Si está, manda sobre `components`. */
  files?: Record<string, string>;
  customCss?: string;
  assets?: SkinAsset[];
  /** `true` para editar un tema que ya existe. */
  overwrite?: boolean;
}

/** Un valor: una clave de un componente, escrito como va a quedar en el archivo. */
export interface SkinComponentDraft {
  component: SkinComponent;
  values: Record<string, string>;
}

export interface SkinDraft {
  name: string;
  mode: ColorScheme;
  accent: string;
  background: string;
  surface: string;
  panel: string;
  text: string;
  textDim: string;
  border: string;
  hover: string;
  active: string;
  radius: number;
  blur: number;
  borderWidth: number;
  shadow: SkinShadow;
  font: string;
}

/**
 * El tema entero tal como lo ve el editor: los seis archivos, sus valores, el
 * CSS y las imágenes.
 *
 * Es un tipo aparte de `SkinDraft` a propósito. `SkinDraft` es el resumen de un
 * deslizador: nueve colores y cuatro medidas, todo deducido. Este es lo que se
 * guarda de verdad, una clave por línea y nada impuesto. El panel rápido
 * construye el segundo a partir del primero; el editor avanzado escribe el
 * segundo directamente.
 */
export interface SkinEditor {
  name: string;
  /** Un archivo por componente, con el texto tal cual. */
  files: Record<string, string>;
  customCss: string;
  assets: SkinAsset[];
  /** El modo solo se usa para los deslizadores del panel rápido. */
  mode: ColorScheme;
}

export interface SkinPreset {
  label: string;
  draft: SkinDraft;
}
