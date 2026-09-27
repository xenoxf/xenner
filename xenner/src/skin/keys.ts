/**
 * Las claves que acepta cada componente, en un solo sitio.
 *
 * Antes esta lista vivía duplicada: aquí y en `allowed_component_keys` de
 * `src-tauri/src/skin.rs`. El backend la necesita porque valida lo que se le
 * pide escribir con `create_skin`, y el frontend la necesita para no crear
 * variables CSS que nadie va a leer. Duplicada, las dos se desincronizaban y una
 * skin creada desde la aplicación se rechazaba al volver a cargarla, sin más
 * pista que una clave que «desaparecía».
 *
 * Esta es la lista de la v1 y no ha cambiado: una skin hecha para la v1 sigue
 * funcionando igual. Lo que se añadió en la v2 (`custom.css`, `assets/`) no
 * son claves, es un archivo aparte, y por eso no aparece aquí.
 *
 * Referencia para quien escribe una skin: docs/SKIN_SPEC.md §4.
 */

const SHARED_KEYS = [
  "background",
  "text",
  "border",
  "radius",
  "blur",
  "shadow",
  "accent",
  "font",
] as const;

export const COMPONENT_KEYS = {
  background: [...SHARED_KEYS, "textDim", "overlay"],
  button: [...SHARED_KEYS, "backgroundHover", "textHover", "borderHover"],
  note: [...SHARED_KEYS, "backgroundHover"],
  sidebar: [...SHARED_KEYS, "itemHover", "itemActive", "textDim"],
  input: [...SHARED_KEYS, "placeholder", "focus"],
  toolbar: [...SHARED_KEYS, "textDim", "backgroundHover"],
} as const;

export const MANIFEST_KEYS = ["name", "version", "author"] as const;
export const CONFIG_KEYS = ["skinPath"] as const;

export type SkinComponentFile = keyof typeof COMPONENT_KEYS;

/** Todas las claves sin repetir, para el parseo que no sabe de componentes. */
export function allSkinKeys(): string[] {
  return [
    ...new Set([
      ...SHARED_KEYS,
      ...MANIFEST_KEYS,
      ...CONFIG_KEYS,
      ...Object.values(COMPONENT_KEYS).flat(),
    ]),
  ];
}
