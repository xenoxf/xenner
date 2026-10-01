import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

import {
  buildEditorPreviewStyle,
  draftToEditor,
  editorId,
  readUserSkinFiles,
  saveUserSkin,
} from "../../skin/creator";
import {
  COMPONENTES,
  COMPONENT_LABELS,
  emptyEditor,
  fileWith,
  setValue,
  unusedAssetPaths,
  valuesWithAssets,
} from "../../skin/editor";
import {
  explainIgnoredLine,
  ignoredSkinLines,
  type ParsedSkinComponent,
} from "../../skin/parse";
import { assetName, chooseSkinAsset, humanBytes } from "../../services/skinAssets";
import styles from "../../styles/components/SkinCreator.module.css";
import type { SkinDraft, SkinEditor, SkinInfo } from "../../types/skin";
import { Button } from "../ui/Button";
import { ConfigFolder } from "./ConfigFolder";
import { QuickPalette } from "./QuickPalette";
import { SkinFilesEditor } from "./SkinFilesEditor";

export interface SkinCreatorProps {
  /** El tema que se está editando, o `null` para crear uno nuevo. */
  editing?: SkinInfo | null;
  onCreated(skin: SkinInfo): void;
  /** Se llama tras guardar un tema que ya existía, para refrescarlo en pantalla. */
  onSaved?(id: string): void;
}

type Pestana = "rapido" | "archivos" | "css";

const PESTANAS: readonly { id: Pestana; label: string; hint: string }[] = [
  { id: "rapido", label: "Con deslizadores", hint: "Colores y formas" },
  { id: "archivos", label: "Cada parte", hint: "Todo, clave por clave" },
  { id: "css", label: "CSS", hint: "Lo que no cabe en un ajuste" },
];

/**
 * El creador de temas, sin techo.
 *
 * Tres puertas a lo mismo, y las tres escriben los mismos archivos:
 *
 *   - **Con deslizadores**, para cambiar nueve colores y cuatro medidas. Es el
 *     camino corto y no hace falta saber nada.
 *   - **Cada parte por separado**, con todas sus claves y el valor escrito a
 *     mano. Aquí cabe un degradado, una sombra larga, un `url()` con una imagen
 *     propia. No hay lista cerrada de valores, solo de claves.
 *   - **El CSS entero**, para lo que no cabe en un `clave="valor"`: dónde está
 *     cada cosa, cuánto se mueve, una paleta distinta de día y de noche.
 *
 * Por qué tres y no uno: quien no sabe CSS nunca quiere escribirlo, y quien sí
 * sabe no quiere mover un deslizador. Lo que no valía es que el del deslizador
 * no pudiera ver el archivo, porque entonces el ajuste fino se acaba con él. Por
 * eso el panel rápido y la edición a mano son la misma cosa de dos maneras, y
 * una se cambia a la otra sin perder nada.
 *
 * Y en las dos formas hay imágenes: se elige un archivo del disco y se usa donde
 * haga falta. Un SVG de fondo en un botón no es un truco, es un campo.
 */
export function SkinCreator(props: SkinCreatorProps) {
  const [editor, setEditor] = createSignal<SkinEditor>(emptyEditor());
  const [pestana, setPestana] = createSignal<Pestana>("rapido");
  const [componenteAbierto, setComponenteAbierto] = createSignal<ParsedSkinComponent>("button");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [aviso, setAviso] = createSignal<string | null>(null);
  const [cargando, setCargando] = createSignal(false);
  /** El CSS sin pasar por el store en cada tecla: 400 líneas a 60 fps no es una broma. */
  const [cssPendiente, setCssPendiente] = createSignal<string | null>(null);
  let abiertoId: string | null = null;

  // Abrir «Editar» sobre un tema existente tiene que leer sus archivos del disco.
  // Se comprueba en cada render en vez de al montar porque el componente se
  // monta una sola vez y el tema se elige después; el `abiertoId` es lo que
  // evita volver a cargarlo en cada keystroke.
  const objetivo = () => props.editing?.id ?? null;
  if (objetivo() !== abiertoId) {
    abiertoId = objetivo();
    const id = abiertoId;
    if (id === null) {
      setEditor(emptyEditor());
      setCargando(false);
    } else {
      setCargando(true);
      void readUserSkinFiles(id)
        .then((leido) => setEditor({ ...leido, name: props.editing?.name ?? leido.name }))
        .catch(() =>
          setError("No se pudieron leer los archivos del tema. Se abre uno en blanco."),
        )
        .finally(() => setCargando(false));
    }
  }
  onCleanup(() => {
    abiertoId = null;
  });

  const imagenesSinUso = createMemo(() => unusedAssetPaths(editor()));
  const lineasAvisadas = createMemo(() => {
    if (pestana() !== "archivos") return [];
    return ignoredSkinLines(componenteAbierto(), editor().files[componenteAbierto()] ?? "");
  });

  function actualizar(cambio: (previo: SkinEditor) => SkinEditor): void {
    setError(null);
    setEditor((previo) => cambio(previo));
  }

  function ponerValor(component: ParsedSkinComponent, key: string, value: string): void {
    actualizar((previo) => setValue(previo, component, key, value));
  }

  async function anadirImagen(): Promise<void> {
    setError(null);
    setAviso(null);
    try {
      const tomadas = editor().assets.map((asset) => asset.path.split("/").pop() ?? "");
      const elegido = await chooseSkinAsset(tomadas);
      if (!elegido) return;

      actualizar((previo) => ({ ...previo, assets: [...previo.assets, elegido] }));

      // Se ofrece aplicada en el sitio donde suele ser lo que la persona quiere.
      // El paso de escribir `url(...)` a mano es justo el que hay que quitar de
      // en medio, y si en ese archivo no hay una clave de imagen se dice en voz
      // alta, en vez de ponerla en un sitio donde no va a hacer nada.
      const destino = componenteAbierto();
      const clave = claveParaImagen(destino);
      if (clave) {
        ponerValor(destino, clave, `url("${elegido.path}")`);
        setAviso(`Se ha puesto ${elegido.name} en «${COMPONENT_LABELS[destino]}».`);
      } else {
        setAviso(
          `Añadido. Para usarlo escríbelo donde quieras: url("${elegido.path}")`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo elegir el archivo");
    }
  }

  function quitarImagen(path: string): void {
    actualizar((previo) => ({
      ...previo,
      assets: previo.assets.filter((asset) => asset.path !== path),
    }));
  }

  /**
   * Renombrar una imagen reescribe su referencia en todos los archivos a la vez.
   *
   * Es lo que evita la mitad de los «funcionaba y ahora no»: cambiar el nombre
   * sin tocar el `.txt` deja un `url()` apuntando a un archivo que ya no está.
   */
  function renombrarImagen(path: string, nuevaRuta: string): void {
    actualizar((previo) => {
      const archivos: Record<string, string> = { ...previo.files };
      for (const component of COMPONENTES) {
        const actual = archivos[component] ?? "";
        if (actual.includes(path)) {
          archivos[component] = actual.split(path).join(nuevaRuta);
        }
      }
      return {
        ...previo,
        files: archivos,
        assets: previo.assets.map((asset) =>
          asset.path === path ? { ...asset, path: nuevaRuta } : asset,
        ),
      };
    });
  }

  async function guardar(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy() || !editor().name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Si el CSS se estaba escribiendo, va con el resto: si no, se perderían las
      // últimas teclas al pulsar el botón.
      const cssFinal = cssPendiente() ?? editor().customCss;
      const listo = { ...editor(), customCss: cssFinal };
      setCssPendiente(null);

      const skin = await saveUserSkin(listo, {
        id: editorId(listo, props.editing?.id),
        overwrite: Boolean(props.editing),
      });
      if (props.editing) props.onSaved?.(skin.id);
      else props.onCreated(skin);
      setAviso(
        props.editing
          ? "Guardado. Xenner ya lo está aplicando."
          : "Tema creado. Ya está en tu lista de temas.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el tema");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class={styles.form} onSubmit={(event) => void guardar(event)}>
      <div
        class={styles.preview}
        data-mode={editor().mode}
        style={buildEditorPreviewStyle(editor())}
      >
        <div class={styles.previewToolbar}>
          <span class={styles.previewDots}>
            <i />
            <i />
            <i />
          </span>
          <span class={styles.previewToolbarLine} />
        </div>
        <div class={styles.previewSidebar}>
          <span />
          <span />
          <span />
        </div>
        <div class={styles.previewEditor}>
          <strong>{editor().name || "Mi tema"}</strong>
          <div class={styles.previewNote}>
            <span />
            <i />
          </div>
          <span class={styles.previewLine} />
        </div>
      </div>

      <label class={styles.nameControl} for="skin-name">
        <span>Cómo se llamará tu tema</span>
        <input
          id="skin-name"
          class={styles.nameInput}
          value={editor().name}
          maxlength={64}
          required
          onInput={(event) =>
            actualizar((previo) => ({ ...previo, name: event.currentTarget.value }))
          }
        />
      </label>

      <div class={styles.tabs} role="tablist" aria-label="Cómo editar el tema">
        <For each={PESTANAS}>
          {(pestaña) => (
            <button
              type="button"
              role="tab"
              id={`skin-tab-${pestaña.id}`}
              aria-selected={pestana() === pestaña.id}
              aria-controls={`skin-panel-${pestaña.id}`}
              class={pestana() === pestaña.id ? styles.tabOn : styles.tab}
              onClick={() => setPestana(pestaña.id)}
            >
              <strong>{pestaña.label}</strong>
              <small>{pestaña.hint}</small>
            </button>
          )}
        </For>
      </div>

      <div
        class={styles.panel}
        role="tabpanel"
        id="skin-panel-rapido"
        aria-labelledby="skin-tab-rapido"
        hidden={pestana() !== "rapido"}
      >
        <QuickPalette
          value={editor()}
          onChange={(draft) =>
            actualizar((previo) => draftToEditor({ ...draft, name: previo.name }, previo))
          }
        />
      </div>

      <div
        class={styles.panel}
        role="tabpanel"
        id="skin-panel-archivos"
        aria-labelledby="skin-tab-archivos"
        hidden={pestana() !== "archivos"}
      >
        <div class={styles.componentTabs} role="tablist" aria-label="Qué parte de la ventana">
          <For each={COMPONENTES}>
            {(component) => (
              <button
                type="button"
                role="tab"
                aria-selected={componenteAbierto() === component}
                class={componenteAbierto() === component ? styles.componentOn : styles.component}
                onClick={() => setComponenteAbierto(component)}
              >
                {COMPONENT_LABELS[component]}
              </button>
            )}
          </For>
        </div>

        <SkinFilesEditor
          component={componenteAbierto()}
          values={valuesWithAssets(editor(), componenteAbierto())}
          label={COMPONENT_LABELS[componenteAbierto()]}
          onSet={(key, value) => ponerValor(componenteAbierto(), key, value)}
          onRaw={(text) => actualizar((previo) => fileWith(previo, componenteAbierto(), text))}
        />

        <Show when={lineasAvisadas().length > 0}>
          <ul class={styles.lineWarnings}>
            <For each={lineasAvisadas()}>
              {(linea) => <li>{explainIgnoredLine(linea)}</li>}
            </For>
          </ul>
        </Show>
      </div>

      <div
        class={styles.panel}
        role="tabpanel"
        id="skin-panel-css"
        aria-labelledby="skin-tab-css"
        hidden={pestana() !== "css"}
      >
        <div class={styles.cssHead}>
          <strong>Tu CSS</strong>
          <p>
            Aquí va lo que no cabe en una línea de ajustes: dónde está cada cosa, cuánto
            se mueve, y una paleta distinta de día y de noche. Es un archivo de CSS
            normal, y si tiene un error solo se pierde esta parte.
          </p>
        </div>
        <textarea
          class={styles.cssArea}
          spellcheck={false}
          wrap="off"
          aria-label="El CSS de tu tema"
          value={cssPendiente() ?? editor().customCss}
          onInput={(event) => {
            const texto = event.currentTarget.value;
            setCssPendiente(texto);
          }}
          onBlur={() => {
            const texto = cssPendiente();
            if (texto === null) return;
            setCssPendiente(null);
            setEditor((previo) => ({ ...previo, customCss: texto }));
          }}
        />
      </div>

      <section class={styles.assetsBlock}>
        <div class={styles.blockHeader}>
          <strong>Imágenes y tipografías</strong>
          <button type="button" class={styles.addAsset} onClick={() => void anadirImagen()}>
            Añadir un archivo…
          </button>
        </div>
        <p class={styles.assetsHint}>
          Elige un archivo de tu equipo y úsalo como fondo de un botón, de una nota o de
          la ventana. SVG, PNG, JPG… y también tipografías.
        </p>
        <Show
          when={editor().assets.length > 0}
          fallback={<p class={styles.assetsEmpty}>Todavía no hay ninguna.</p>}
        >
          <ul class={styles.assetList}>
            <For each={editor().assets}>
              {(asset) => (
                <li class={styles.asset}>
                  <span
                    class={styles.assetThumb}
                    style={`background-image:url("${asset.dataUrl}")`}
                    aria-hidden="true"
                  />
                  <span class={styles.assetBody}>
                    <strong>{assetName(asset.path)}</strong>
                    <input
                      class={styles.assetRef}
                      value={asset.path}
                      aria-label={`Cómo se llama ${assetName(asset.path)} dentro del CSS`}
                      onChange={(evento) =>
                        renombrarImagen(asset.path, evento.currentTarget.value)
                      }
                    />
                    <small>{humanBytes(asset.bytes)}</small>
                    <Show when={imagenesSinUso().includes(asset.path)}>
                      <em class={styles.assetIdle}>No lo está usando ningún archivo.</em>
                    </Show>
                  </span>
                  <button
                    type="button"
                    class={styles.assetRemove}
                    aria-label={`Quitar ${assetName(asset.path)}`}
                    onClick={() => quitarImagen(asset.path)}
                  >
                    Quitar
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <ConfigFolder variant="create" />

      <Show when={aviso()}>
        {(mensaje) => (
          <p class={styles.formOk} role="status">
            {mensaje()}
          </p>
        )}
      </Show>
      <Show when={error()}>
        {(mensaje) => (
          <p class={styles.formError} role="alert">
            {mensaje()}
          </p>
        )}
      </Show>
      <div class={styles.actions}>
        <Button type="submit" variant="primary" disabled={busy() || cargando()}>
          {busy() ? "Guardando…" : props.editing ? "Guardar los cambios" : "Guardar tema"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Qué clave de un componente es la que la gente quiere para una imagen.
 *
 * No es arbitrario: es la clave que el formato ya llama «el fondo de esto», que es
 * donde un SVG se pone sin tener que inventar nada. Donde no hay una clave de
 * imagen propia, se dice en voz alta que hay que escribir la referencia a mano, en
 * vez de dejarla en un sitio donde no va a hacer nada.
 */
function claveParaImagen(component: ParsedSkinComponent): string | null {
  switch (component) {
    case "background":
      return "overlay";
    case "sidebar":
      return "itemHover";
    case "note":
      return "background";
    case "toolbar":
      return "background";
    case "button":
      return "background";
    case "input":
      return "background";
  }
  return null;
}

export type { SkinDraft };
