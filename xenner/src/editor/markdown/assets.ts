import { resolveAssetReference } from "../asset-paths.ts";
import { IMAGE_MARKDOWN_PARTS, readImageSource } from "../extensions/note-image.ts";
import type { AssetPayload } from "../../types/workspace.ts";

/**
 * Los assets de una nota, ya cargados.
 *
 * `markdown` es lo que se pasa a `contentType: "markdown"`: cada
 * `./.assets/…` sustituido por su `data:` URL, porque el navegador no sabe leer
 * una ruta de archivo relativa a la nota. `paths` es el camino de vuelta, y sin
 * él lo que se guardaría sería un `data:` de un megabyte en un fichero de texto.
 */
export interface NoteAssets {
  /** Markdown con cada referencia a `.assets` sustituida por su `data:` URL. */
  markdown: string;
  /** `data:` URL → ruta dentro de `.assets`. */
  paths: Map<string, string>;
  /** `data:` URL → revisión del asset en el momento de leerlo. */
  revisions: Map<string, string>;
}

/**
 * Cómo lee el editor un asset de `.assets`.
 *
 * El salto a `await import` no es caprichoso: `services/workspace/gateway.ts`
 * importa sus hermanos sin extensión (lo que Vite resuelve y el cargador de
 * Node no), así que un `import` normal haría que este archivo —que es lógica
 * pura— no se pudiera ni importar desde un test de Node. Cargando el gateway
 * solo cuando de verdad se lee algo, la capa de Markdown se abre en Node.
 */
export type ReadNoteAsset = (notePath: string, assetPath: string) => Promise<AssetPayload>;

const readFromGateway: ReadNoteAsset = async (notePath, assetPath) => {
  const { getWorkspaceGateway } = await import("../../services/workspace/gateway.ts");
  return getWorkspaceGateway().readAsset(notePath, assetPath);
};

/**
 * Solo la parte de una línea que es una imagen: `![alt](src "titulo")`.
 *
 * Los patrones vienen de la extensión del nodo de imagen y **no se vuelven a
 * escribir aquí**: es la misma sintaxis que el serializador emite, así que esta
 * lista tiene que aceptar todo lo que `noteImage` sabe escribir —un destino
 * entre ángulos, con espacios o con paréntesis, un pie con `\]`, un título entre
 * paréntesis— o el editor abriría la nota con huecos donde él mismo acaba de
 * guardar las imágenes. Aquí no se exige que la imagen esté sola en su línea
 * (una imagen dentro de un párrafo también tiene un asset que cargar).
 */
const IMAGE_MARKDOWN = new RegExp(
  `(!\\[${IMAGE_MARKDOWN_PARTS.alt}\\]\\(\\s*)(${IMAGE_MARKDOWN_PARTS.destination})(${IMAGE_MARKDOWN_PARTS.title}\\s*\\))`,
  "g",
);

function toDataUrl(payload: AssetPayload): string {
  return `data:${payload.mime};base64,${payload.dataBase64}`;
}

/**
 * Lee los assets de `.assets` y devuelve el Markdown con sus `data:` URL.
 *
 * Un asset que no se puede leer **no** rompe la apertura: se deja la referencia
 * tal cual. Es lo que enseña algo que está mal en vez de no abrir la nota, que es
 * justo lo contrario de lo que se quiere cuando el disco ha fallado.
 *
 * `readAsset` es el hueco por el que se prueba el caso del asset roto sin un
 * disco delante; la app llama con dos argumentos y sale por el gateway.
 */
export async function loadNoteAssets(
  notePath: string,
  markdown: string,
  readAsset: ReadNoteAsset = readFromGateway,
): Promise<NoteAssets> {
  /**
   * La ruta dentro de `.assets` → el destino tal cual está escrito en la nota.
   *
   * La clave es la ruta ya leída, no el texto crudo, porque `./.assets/x.png` y
   * `.assets/x.png` son **el mismo fichero**: leerlo dos veces era tirar el
   * disco. Lo que se guarda para volver es el texto crudo, porque al guardar hay
   * que devolver la nota tal cual estaba y reescribir `./.assets/x.png` como
   * `.assets/x.png` no lo arregla nadie.
   */
  const enNota = new Map<string, string>();
  for (const match of markdown.matchAll(IMAGE_MARKDOWN)) {
    const source = match[2];
    const assetPath = resolveAssetReference(notePath, readImageSource(source));
    if (assetPath && !enNota.has(assetPath)) enNota.set(assetPath, source);
  }

  const loaded = new Map<string, { dataUrl: string; revision: string }>();
  await Promise.all(
    [...enNota].map(async ([assetPath]) => {
      try {
        const payload = await readAsset(notePath, assetPath);
        loaded.set(assetPath, { dataUrl: toDataUrl(payload), revision: payload.revision });
      } catch {
        // Un asset roto no impide abrir el Markdown; se conserva la referencia.
      }
    }),
  );

  const paths = new Map<string, string>();
  const revisions = new Map<string, string>();
  const content = markdown.replace(IMAGE_MARKDOWN, (full, prefix, source, suffix) => {
    const assetPath = resolveAssetReference(notePath, readImageSource(source));
    const asset = assetPath ? loaded.get(assetPath) : undefined;
    if (!asset) return full;
    paths.set(asset.dataUrl, source);
    revisions.set(asset.dataUrl, asset.revision);
    return `${prefix}${asset.dataUrl}${suffix}`;
  });
  return { markdown: content, paths, revisions };
}

/**
 * Devuelve al Markdown sus rutas de `.assets`.
 *
 * Se sustituye la `data:` URL más larga primero: dos assets pueden empezar igual
 * (`data:image/png;base64,AAAA…` y `data:image/png;base64,AAAB…`) y cambiar la
 * corta dentro de la larga dejaría la larga con un `data:` dentro.
 */
export function restoreNoteAssets(
  markdown: string,
  paths: ReadonlyMap<string, string>,
): string {
  let serialized = markdown;
  const ordered = [...paths.entries()].sort((left, right) => right[0].length - left[0].length);
  for (const [dataUrl, source] of ordered) {
    serialized = serialized.split(dataUrl).join(source);
  }
  return serialized;
}