import { createResource, createSignal, Show } from "solid-js";

import {
  configFolderName,
  readConfigInfo,
  revealConfigDir,
  selectPath,
} from "../../services/configFolder";
import styles from "../../styles/components/ConfigFolder.module.css";
import { Button } from "../ui/Button";

export interface ConfigFolderProps {
  /**
   * Qué está explicando este bloque. Cambia el texto, no la mecánica: la misma
   * caja sirve para «aquí están tus temas» y para «aquí puedes crearlos».
   */
  variant?: "skins" | "create";
}

/**
 * «Dónde está esto y cómo llego» — el bloque que hacía falta y no estaba.
 *
 * La documentación dice que los temas son archivos tuyos, y eso solo es cierto
 * si hay un camino corto entre el botón y el explorador de archivos. Por eso
 * esto enseña la ruta exacta y la abre con un clic, en vez de dejar que alguien
 * la busque por el disco.
 *
 * Sin la app de escritorio no hay carpeta que enseñar, y en vez de un texto
 * vacío sale una explicación de por qué.
 */
export function ConfigFolder(props: ConfigFolderProps) {
  const [info] = createResource(readConfigInfo);
  const [error, setError] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  const variant = () => props.variant ?? "skins";

  const titulo = (): string =>
    variant() === "create" ? "Los archivos de este tema" : "La carpeta donde están tus temas";

  async function abrir(): Promise<void> {
    setError(null);
    const motivo = await revealConfigDir();
    if (motivo) setError(motivo);
  }

  function copiar(): void {
    const path = info()?.root;
    if (!path) return;
    selectPath(path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div class={styles.folder}>
      <div class={styles.folderHead}>
        <strong>{titulo()}</strong>
        <small>
          {variant() === "create"
            ? "Un tema es una carpeta con unos archivos de texto dentro. Puedes escribirlos aquí o dejarlos como están."
            : "Puedes editarlos con el Bloc de notas. Xenner los relee solo, sin reiniciar."}
        </small>
      </div>

      <Show
        when={info()}
        fallback={
          <p class={styles.folderNote}>
            La carpeta solo existe en la app de escritorio. Esta es la vista previa en el
            navegador, así que no hay nada que abrir.
          </p>
        }
      >
        {(data) => (
          <>
            <code class={styles.folderPath} title="La ruta exacta, por si la quieres copiar">
              {data().root}
            </code>
            <div class={styles.folderActions}>
              <Button type="button" onClick={() => void abrir()}>
                Abrir la carpeta de {configFolderName(data().root)}
              </Button>
              <button type="button" class={styles.linkButton} onClick={copiar}>
                {copied() ? "Ruta copiada" : "Copiar la ruta"}
              </button>
            </div>
            <Show when={data().previous}>
              {(previous) => (
                <p class={styles.folderNote}>
                  Tus temas estaban antes en <code>{previous()}</code>. Ya están copiados aquí;
                  la carpeta antigua se puede borrar cuando quieras.
                </p>
              )}
            </Show>
            <Show when={error()}>
              {(motivo) => (
                <p class={styles.formError} role="alert">
                  {motivo()}
                </p>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
