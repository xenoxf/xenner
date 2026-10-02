import { COMPONENT_KEYS } from "./keys.ts";
import { parseSkinComponent, stringifySkinComponent, type ParsedSkinComponent } from "./parse.ts";
import type { SkinAsset, SkinEditor } from "../types/skin";

/**
 * El editor de un tema: seis archivos de texto, un CSS y unas imágenes.
 *
 * Este módulo es el puente entre las dos formas de hacer lo mismo. El panel con
 * deslizadores escribe archivos de texto; quien abre el texto a mano escribe
 * archivos de texto. No hay dos almacenes de ajustes que se puedan
 * desincronizar, que es como se rompe esto.
 *
 * Las funciones son puras y sin dependencias de Tauri, que es lo que permite
 * probarlas con `node --test`.
 */

/** Los seis archivos, en el orden en que los enseña el panel. */
export const COMPONENTES: readonly ParsedSkinComponent[] = [
  "background",
  "sidebar",
  "note",
  "toolbar",
  "button",
  "input",
];

/** Cómo llama el panel a cada archivo. Sin nombres de archivo: «la lista de notas». */
export const COMPONENT_LABELS: Record<ParsedSkinComponent, string> = {
  background: "El fondo de la ventana",
  sidebar: "La lista de notas",
  note: "La nota",
  toolbar: "La barra del editor",
  button: "Los botones",
  input: "Los campos de escritura",
};

/** Un archivo vacío: la forma en que empieza un tema nuevo. */
export function emptyEditor(name = "Mi tema"): SkinEditor {
  return {
    name,
    files: Object.fromEntries(COMPONENTES.map((component) => [component, ""])),
    customCss: "",
    assets: [],
    mode: "dark",
  };
}

/** Los valores de un archivo, ya interpretados. */
export function valuesOf(editor: SkinEditor, component: ParsedSkinComponent): Record<string, string> {
  return parseSkinComponent(component, editor.files[component] ?? "");
}

/** Escribe un valor. Si queda vacío, se borra la línea en vez de dejar `=""`. */
export function setValue(
  editor: SkinEditor,
  component: ParsedSkinComponent,
  key: string,
  value: string,
): SkinEditor {
  const actuales = valuesOf(editor, component);
  if (value.trim() === "") delete actuales[key];
  else actuales[key] = value;

  return {
    ...editor,
    files: { ...editor.files, [component]: stringifySkinComponent(actuales) },
  };
}

/** Los valores de un archivo, con las imágenes de la lista ya resueltas. */
export function valuesWithAssets(
  editor: SkinEditor,
  component: ParsedSkinComponent,
): Record<string, string> {
  return resolverAssets(valuesOf(editor, component), editor.assets);
}

/**
 * Cambia `assets/fondo.svg` por su contenido, para poder verlo antes de que
 * exista la carpeta.
 *
 * Solo para la previsualización. Lo que se guarda es siempre la ruta, que es lo
 * que sobrevive a que la imagen se mueva o a que el tema se copie a otro equipo.
 */
export function resolverAssets(
  values: Record<string, string>,
  assets: readonly SkinAsset[],
): Record<string, string> {
  if (assets.length === 0) return values;
  const porRuta = new Map(assets.map((asset) => [asset.path, asset.dataUrl]));
  const salida: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    salida[key] = value.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (todo, ruta: string) => {
      const clave = ruta.trim();
      const data = porRuta.get(clave);
      return data ? `url("${data}")` : todo;
    });
  }
  return salida;
}

/** Todas las rutas `assets/...` que usa un editor, en orden y sin repetir. */
export function usedAssetPaths(editor: SkinEditor): string[] {
  const encontradas = new Set<string>();
  const patron = /url\(\s*['"]?(assets\/[^'")]+)['"]?\s*\)/g;
  for (const component of COMPONENTES) {
    for (const coincidencia of (editor.files[component] ?? "").matchAll(patron)) {
      encontradas.add(coincidencia[1]);
    }
  }
  return [...encontradas];
}

/**
 * Los assets que ya no usa ningún archivo.
 *
 * No se borran al guardar: se quedan en `assets/` y el backend se encarga de no
 * tocar lo que hubiera. Lo que sí se avisa es para que nadie acumule imágenes que
 * ya no salen en ninguna parte, que es como se llena una carpeta sin que nadie
 * decida llenarla.
 */
export function unusedAssetPaths(editor: SkinEditor): string[] {
  const usadas = new Set(usedAssetPaths(editor));
  return editor.assets.map((asset) => asset.path).filter((path) => !usadas.has(path));
}

/** Las claves que admite un componente, en el orden en que se las enseña. */
export function keysOf(component: ParsedSkinComponent): readonly string[] {
  return COMPONENT_KEYS[component];
}

/**
 * Lo que Xenner pone cuando un tema no dice nada.
 *
 * Sale de `styles/global.css`, que es la fuente de verdad. Está aquí para que el
 * «restablecer» de cada fila tenga algo que poner, y para que el panel pueda
 * enseñarlo. Si un día cambia `global.css` y no se cambia esto, el botón
 * «restablecer» mentiría: por eso la lista está completa y hay un test que
 * comprueba que no le falta ninguna clave.
 */
const VALORES_POR_DEFECTO: Record<string, Record<string, string>> = {
  background: {
    background: "#ffffff",
    text: "#2f2f2f",
    textDim: "#787774",
    overlay: "none",
    border: "1px solid #e6e6e3",
    radius: "0px",
    blur: "0px",
    shadow: "none",
    accent: "#2383e2",
    // La pila de fábrica, la misma que declara `--skin-background-font` en
    // `styles/global.css`. Un test lo comprueba clave por clave.
    font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    selection: "color-mix(in srgb, var(--skin-background-accent) 30%, transparent)",
    selectionText: "var(--skin-background-text)",
  },
  button: {
    background: "transparent",
    backgroundHover: "#f1f1ef",
    text: "#37352f",
    textHover: "#2f2f2f",
    border: "1px solid transparent",
    borderHover: "#d9d9d7",
    radius: "7px",
    blur: "0px",
    shadow: "none",
    accent: "#2383e2",
    selection: "color-mix(in srgb, var(--skin-button-accent) 30%, transparent)",
    selectionText: "var(--skin-button-text)",
  },
  note: {
    background: "#ffffff",
    backgroundHover: "#f7f7f5",
    text: "#2f2f2f",
    border: "1px solid #0a0a0a",
    radius: "10px",
    blur: "0px",
    shadow: "0 8px 28px rgba(15, 15, 15, 0.1)",
    accent: "#2383e2",
    selection: "color-mix(in srgb, var(--skin-note-accent) 30%, transparent)",
    selectionText: "var(--skin-note-text)",
  },
  sidebar: {
    background: "#f7f7f5",
    text: "#37352f",
    textDim: "#787774",
    itemHover: "#efefed",
    itemActive: "#e7e7e4",
    border: "1px solid #e6e6e3",
    radius: "0px",
    blur: "0px",
    shadow: "none",
    accent: "#2383e2",
    selection: "color-mix(in srgb, var(--skin-sidebar-accent) 30%, transparent)",
    selectionText: "var(--skin-sidebar-text)",
  },
  input: {
    background: "#ffffff",
    text: "#2f2f2f",
    placeholder: "#9b9a97",
    border: "1px solid #e3e2e0",
    focus: "#2383e2",
    radius: "6px",
    blur: "0px",
    shadow: "none",
    accent: "#2383e2",
    selection: "color-mix(in srgb, var(--skin-input-accent) 30%, transparent)",
    selectionText: "var(--skin-input-text)",
  },
  toolbar: {
    background: "#ffffff",
    backgroundHover: "#f1f1ef",
    text: "#2f2f2f",
    textDim: "#787774",
    border: "1px solid #e6e6e3",
    radius: "0px",
    blur: "0px",
    shadow: "none",
    accent: "#2383e2",
    selection: "color-mix(in srgb, var(--skin-toolbar-accent) 30%, transparent)",
    selectionText: "var(--skin-toolbar-text)",
  },
};

/**
 * El valor de una clave cuando el tema no dice nada.
 *
 * La lista de arriba y `styles/global.css` son el mismo dato escrito dos veces,
 * y no hay forma de que sea una sola sin leer el CSS al arrancar —y `global.css`
 * no se puede importar desde un módulo que también usan los tests, porque
 * `import.meta.glob` solo existe dentro del agrupador.
 *
 * Así que se duplica y se vigila: `editor.test.ts` compara las dos listas clave
 * por clave. Ya ha servido: la primera vez que se ejecutópilló una tipografía de
 * fábrica que no era la de `global.css`, y un botón «restablecer» que pone una
 * cosa que no es la de fábrica es peor que no tener botón.
 *
 * `font` solo se declara en `background`, y es un grupo de tres variables que
 * tienen que ir juntas. Las demás componentes la heredan, y para ellas el
 * ejemplo sale de la de `background`.
 */
export function defaultValue(component: ParsedSkinComponent, key: string): string {
  const propios = (VALORES_POR_DEFECTO[component] as Record<string, string> | undefined)?.[key];
  if (propios !== undefined) return propios;
  if (key === "font") {
    return (VALORES_POR_DEFECTO.background as Record<string, string>).font;
  }
  return "";
}

/** Un archivo tal como estaba en el disco, para editarlo sin perder los comentarios. */
export function fileWith(
  editor: SkinEditor,
  component: ParsedSkinComponent,
  text: string,
): SkinEditor {
  return { ...editor, files: { ...editor.files, [component]: text } };
}
