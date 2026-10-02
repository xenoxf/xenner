import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";

import type {
  NoteDocument,
  SaveStatus,
  VaultErrorShape,
  WorkspaceScan,
  WorkspaceTreeNode,
} from "../../types/workspace";
import { noteTitleFromPath } from "../../workspace/note";
import { flattenTree, parentPath } from "../../workspace/tree";
import styles from "../../styles/components/MobileShell.module.css";
import { EditorPane } from "../editor/EditorPane";
import type { CreationKind } from "../explorer/CreationRow";
import type { CreationDraft } from "../explorer/Explorer";
import { PlusIcon } from "../ui/Icons";
import { MobileEditorBar } from "./MobileEditorBar";
import { MobileFolderStrip, type MobileFolder } from "./MobileFolderStrip";
import { MobileNoteList, type MobileNoteEntry } from "./MobileNoteList";
import { MobileSearchBar } from "./MobileSearchBar";
import { MobileTopBar } from "./MobileTopBar";

/** Marca la entrada de historial que corresponde a estar con el editor abierto. */
const EDITOR_HISTORY_STATE = "xenner:mobile-editor";

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

const DIACRITICS = /\p{Diacritic}/gu;

/**
 * Plegar para buscar: sin acentos y en minúsculas, de modo que «viaje» encuentre
 * «Viaje» y « reunion » encuentre «Reunión».
 */
function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase("es");
}

export interface MobileShellProps {
  /** Biblioteca: `null` mientras el primer escaneo no haya respondido. */
  workspace: WorkspaceScan | null;
  tree: WorkspaceTreeNode[];
  loading: boolean;
  error: VaultErrorShape | null;
  selectedPath: string | null;

  /** Estado del editor, tal y como lo recibe hoy `EditorPane` en `App.tsx`. */
  document: NoteDocument | null;
  status: SaveStatus;
  documentLoading: boolean;
  documentReloadToken: number;

  /** Creación de entradas, con el mismo `CreationRow` del explorador. */
  creation: CreationDraft | null;
  creating: boolean;
  canPaste: boolean;

  onOpenSettings(): void;
  onDismissError(): void;
  onStartCreation(kind: CreationKind, parent?: string): void;
  onSubmitCreation(name: string): void | Promise<void>;
  onCancelCreation(): void;
  onSelect(path: string): void | Promise<boolean>;
  onRename(path: string): void;
  onDelete(path: string): void;
  onCopyMarkdown(path: string): void;
  onCut(path: string): void;
  onPaste(parent: string): void;
  onShowHistory(path: string): void;
  onCreate(): void;
  onRetry(): void;
  onReload(): void;
  onChange(body: string): void;
  onTitleChange(title: string): void | boolean | Promise<void | boolean>;

  /**
   * Modales globales, tal cual los monta hoy `App.tsx` (`SettingsModal`,
   * `NoteHistoryPanel` y `ToastRegion`).
   *
   * Van como `children` en vez de por props porque su estado vive en el
   * controlador de la aplicación, no aquí: quien los abre (el icono de ajustes,
   * el «Últimos cambios» del menú de cada nota) y quien los cierra son el
   * mismo sitio. Se renderizan al final del shell para que su `Portal` y su
   * `position: fixed` queden por encima de las dos pantallas.
   */
  overlays?: JSX.Element;
}

/**
 * Contenedor de la vista móvil con sus dos estados: la lista de notas y el
 * editor a pantalla completa. Se monta **en lugar de** `AppShell`, nunca dentro
 * (AppShell es una rejilla de dos columnas pensada para el ratón) y como
 * hermano suyo, para que los modales de `overlays` se pinten encima.
 *
 * Decide el dibujo por la biblioteca y por la carpeta que haya seleccionada en
 * la tira de arriba:
 *
 * - **Carpetas**: tira plana con todas las carpetas de la biblioteca, a
 *   cualquier nivel, etiquetadas con su ruta relativa. Tocar un chip filtra la
 *   lista por las notas directas de esa carpeta; tocarlo otra vez quita el
 *   filtro.
 * - **Buscar**: busca por nombre en toda la biblioteca e ignora el filtro de
 *   carpeta. Con el texto vacío se comporta como el filtro.
 * - **Crear**: la carpeta se crea dentro de la seleccionada y el botón flotante
 *   crea una nota en ella. Los dos usan `onStartCreation`, que es el mismo flujo
 *   que el explorador de escritorio, y la escritura la pone `CreationRow`.
 *
 * El botón atrás de Android se resuelve con el historial del WebView: entrar en
 * el editor empuja una entrada y el `popstate` devuelve a la lista. Si el WebView
 * no reenvía la pulsación, la flecha de la barra hace lo mismo.
 */
export function MobileShell(props: MobileShellProps) {
  const [editing, setEditing] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [folder, setFolder] = createSignal<string | null>(null);
  /** Guardando las carpetas de antes de empezar a crear una, para ver la nueva. */
  let foldersBefore: ReadonlySet<string> = new Set<string>();
  const [awaitingFolder, setAwaitingFolder] = createSignal(false);
  /**
   * Se ha pedido una nota nueva y aún no existe su documento. El editor no se
   * abre hasta que llegue: si se abriera antes, se vería la nota anterior con el
   * foco en su título, y escribir un nombre renombraría el fichero viejo.
   */
  const [startingNote, setStartingNote] = createSignal(false);
  let editorInHistory = false;
  /** Pide el foco del editor en cuanto la nota nueva esté cargada. */
  let focusWhenReady = false;
  let editorPane: HTMLDivElement | undefined;

  const folders = createMemo<MobileFolder[]>(() =>
    flattenTree(props.tree)
      .filter((node) => node.kind === "directory")
      .map((node) => ({ path: node.path }))
      .sort((left, right) => collator.compare(left.path, right.path)),
  );

  /**
   * Todas las notas de la biblioteca con su nombre ya plegado. La búsqueda
   * ignora la carpeta, así que esto no depende de ella y se calcula una sola vez
   * por cambio del árbol.
   */
  const noteIndex = createMemo<{ entry: MobileNoteEntry; folded: string }[]>(() => {
    const list = flattenTree(props.tree)
      .filter((node) => node.kind === "note")
      .map((node) => ({
        entry: { path: node.path, name: node.name },
        folded: foldForSearch(noteTitleFromPath(node.path)),
      }));
    return list.sort((left, right) =>
      collator.compare(left.entry.path, right.entry.path),
    );
  });

  const notes = createMemo<MobileNoteEntry[]>(() => {
    const search = foldForSearch(query().trim());
    if (search) return noteIndex().filter((item) => item.folded.includes(search)).map((item) => item.entry);
    const current = folder();
    if (!current) return noteIndex().map((item) => item.entry);
    return noteIndex()
      .filter((item) => parentPath(item.entry.path) === current)
      .map((item) => item.entry);
  });

  const emptyState = createMemo<{ message: string; hint: string }>(() => {
    if (props.loading) {
      return { message: "Abriendo la biblioteca…", hint: "Las notas aparecerán en cuanto termine." };
    }
    if (query().trim()) {
      return {
        message: "Ninguna nota coincide con la búsqueda",
        hint: "Se busca en toda la biblioteca, sin tildes. Prueba con otra palabra.",
      };
    }
    if (folder()) {
      return {
        message: "Esta carpeta está vacía",
        hint: "Crea aquí la primera nota con el botón +.",
      };
    }
    return {
      message: "La biblioteca está vacía",
      hint: "Crea una nota con el botón + para empezar a escribir.",
    };
  });

  const noteTitle = createMemo(() => {
    const current = props.document;
    if (!current) return "Nota";
    return current.title || noteTitleFromPath(current.path);
  });

  /**
   * Al crear una carpeta no hay forma de saber su ruta antes de crearla, así que
   * se guarda el censo de carpetas de antes y se espera a que aparezca una nueva.
   *
   * Solo se mira el diff **mientras se está creando**. El watcher de la biblioteca
   * sondea cada 2,5 segundos y puede traer una carpeta que no es de esta creación
   * —una sincronizada desde otro sitio, otra máquina— y se seleccionaba esa en vez
   * de la recién creada. Con la lista congelada no hay carrera, porque la carpeta
   * propia tampoco estará aún.
   */
  createEffect(() => {
    if (!awaitingFolder()) return;
    const creating = props.creating;
    const draft = props.creation;
    const paths = folders().map((item) => item.path);
    if (creating || draft) {
      const created = paths.find((path) => !foldersBefore.has(path));
      if (created) {
        setFolder(created);
        setAwaitingFolder(false);
      }
      return;
    }
    // Se acabó la creación sin carpeta nueva. Solo se desarma si ya no queda
    // borrador: el controlador no limpia el suyo cuando la creación falla, así que
    // quedarse esperando aquí dejaría el filtro de la lista apuntando a lo que
    // apareciera después, y el botón flotante crearía las notas en esa carpeta.
    setAwaitingFolder(false);
  });

  function pushEditorHistory(): void {
    if (editorInHistory || typeof window === "undefined") return;
    if (typeof window.history?.pushState !== "function") return;
    window.history.pushState({ [EDITOR_HISTORY_STATE]: true }, "");
    editorInHistory = true;
  }

  function closeEditor(): void {
    setEditing(false);
    // La entrada que se empujó al abrir el editor se gasta aquí; si se dejara,
    // el botón atrás del WebView tendría que pulsarlo dos veces para salir.
    if (editorInHistory && typeof window !== "undefined") {
      editorInHistory = false;
      window.history.back();
    }
  }

  function openNote(path: string): void {
    setEditing(true);
    focusWhenReady = false;
    pushEditorHistory();
    void props.onSelect(path);
  }

  /**
   * Crea una nota en la carpeta seleccionada, o en la raíz si no hay ninguna.
   *
   * La pantalla no cambia de golpe: primero avisa que hay algo en marcha y solo
   * cuando llega el documento nuevo se entra al editor. Con un `setEditing(true)`
   * antes de tiempo, el editor se abría con la nota **anterior** puesta y el foco
   * en su título: escribir un nombre y dar a Enter renombraba el fichero viejo, que
   * desaparecía del árbol. Y como `createUntitledNote` aborta si ya hay una
   * creación en curso, la pulsación se perdía entera.
   */
  function createNote(): void {
    if (props.creating) return;
    setStartingNote(true);
    props.onStartCreation("note", folder() ?? "");
  }

  /**
   * Cuando la nota recién creada ya está cargada, se entra a escribir.
   *
   * Es el momento en que `selectedPath` y `document` apuntan a la misma nota
   * nueva, y en el que el campo de título ya está montado para recibir el foco.
   */
  createEffect(() => {
    const path = props.selectedPath;
    const current = props.document;
    if (!startingNote()) return;
    if (path && current?.path === path) {
      setStartingNote(false);
      focusWhenReady = true;
      setEditing(true);
      pushEditorHistory();
    }
    // Si la creación se cancela o falla, el editor se queda esperando y no hay
    // nota nueva que abrir.
    if (!props.creating && props.creation === null && !path) setStartingNote(false);
  });

  /**
   * Pasa el foco al editor de la nota recién creada.
   *
   * `EditorPane` no expone un ref para enfocarse, pero sí marca su campo de
   * título con el gancho público `[data-x="note-title"]`, así que se busca por
   * ahí en vez de tocar el componente. Espera a que el documento de la nota
   * exista, que es cuando el campo ya está montado.
   */
  createEffect(() => {
    const path = props.selectedPath;
    const current = props.document;
    if (!focusWhenReady || !path || current?.path !== path || !editing()) return;
    focusWhenReady = false;
    queueMicrotask(() => {
      editorPane?.querySelector<HTMLInputElement>('[data-x="note-title"]')?.focus();
    });
  });

  /**
   * Si la carpeta por la que se está filtrando deja de existir —borrada o
   * renombrada desde otro sitio—, el filtro se suelta. Sin esto la lista se
   * quedaba vacía con «Esta carpeta está vacía» y los chips ya no la ofrecen, así
   * que no había forma de quitarlo sin tocar otro.
   */
  createEffect(() => {
    const actual = folder();
    if (!actual) return;
    const existe = props.tree.some((node) => node.path === actual);
    const dentroHija = flattenTree(props.tree)
      .filter((node) => node.kind === "directory")
      .some((node) => node.path === actual);
    if (!existe && !dentroHija) setFolder(null);
  });

  function createFolder(): void {
    if (props.creating) return;
    props.onStartCreation("folder", folder() ?? "");
  }

  function submitCreation(name: string): void {
    foldersBefore = new Set(folders().map((item) => item.path));
    setAwaitingFolder(true);
    props.onSubmitCreation(name);
  }

  function toggleFolder(path: string): void {
    setFolder((current) => (current === path ? null : path));
    // Cambiar de carpeta con una fila de creación abierta la descuadra: el padre
    // ya está fijo en el borrador del controlador, y se crearía en la carpeta
    // anterior mientras la lista enseña la nueva. Se cierra para que coincidan.
    if (props.creation) props.onCancelCreation();
  }

  onMount(() => {
    if (typeof window === "undefined") return;
    /**
     * El botón atrás del WebView llega como `popstate`, y `history.back()` es
     * asíncrono. Si la persona cierra con la flecha y toca otra nota antes de que
     * llegue el `popstate` de la vuelta anterior, esa vuelta pendiente cerraba la
     * nota que acababa de abrir.
     *
     * Se distingue por `event.state`: la entrada del editor lleva la marca, así
     * que un `popstate` que llega **con** ella significa que aún estamos en el
     * editor (se está abriendo), no que haya que salir de él.
     */
    const onPopState = (event: PopStateEvent): void => {
      const estado = event.state as Record<string, unknown> | null;
      if (estado && estado[EDITOR_HISTORY_STATE] === true) {
        // Seguimos en el editor: la entrada es la de abrirlo.
        editorInHistory = true;
        return;
      }
      editorInHistory = false;
      setEditing(false);
    };
    window.addEventListener("popstate", onPopState);
    onCleanup(() => window.removeEventListener("popstate", onPopState));
  });

  return (
    <div class={styles.shell} data-x="mobile" data-x-mobile="shell">
      {/*
       * `data-x="sidebar"`: en el móvil esta pantalla es exactamente la misma
       * superficie que la columna de la lista del escritorio —el lugar donde vive
       * la lista de notas—, así que las skins y las reglas de selección de texto
       * de `global.css` la tratan igual sin duplicar las suyas. Los ganchos
       * `mobile-*` de dentro son los propios de esta vista.
       */}
      <Show when={!editing()}>
        <section
          class={styles.listScreen}
          data-x="sidebar"
          data-x-mobile="list"
          aria-label="Lista de notas"
        >
          <MobileTopBar
            title="Notas"
            subtitle={props.workspace?.info.root}
            busy={props.creating}
            onCreateFolder={createFolder}
            onOpenSettings={props.onOpenSettings}
          />

          <Show when={props.error}>
            {(error) => (
              <div class={styles.workspaceAlert} role="group" aria-label="Error de biblioteca">
                <div>
                  <strong>{error().code === "conflict" ? "Conflicto" : "Biblioteca"}</strong>
                  <span>{error().message}</span>
                </div>
                <button type="button" class={styles.textButton} onClick={props.onDismissError}>
                  Descartar
                </button>
              </div>
            )}
          </Show>

          <MobileSearchBar
            value={query()}
            resultCount={notes().length}
            onInput={setQuery}
            onClear={() => setQuery("")}
          />

          <Show when={folders().length > 0}>
            <MobileFolderStrip
              folders={folders()}
              selected={folder()}
              onSelect={toggleFolder}
            />
          </Show>

          <MobileNoteList
            notes={notes()}
            loading={props.loading}
            selectedPath={props.selectedPath}
            canPaste={props.canPaste}
            emptyMessage={emptyState().message}
            emptyHint={emptyState().hint}
            creation={props.creation}
            creating={props.creating}
            onSubmitCreation={submitCreation}
            onCancelCreation={props.onCancelCreation}
            onStartCreation={(kind, parent) => props.onStartCreation(kind, parent)}
            onSelect={openNote}
            onCopyMarkdown={props.onCopyMarkdown}
            onCut={props.onCut}
            onPaste={props.onPaste}
            onRename={props.onRename}
            onDelete={props.onDelete}
            onShowHistory={props.onShowHistory}
          />

          <button
            type="button"
            class={styles.fab}
            data-x="mobile-fab"
            data-x-mobile="fab"
            aria-label="Nueva nota"
            title="Nueva nota"
            disabled={props.creating || startingNote()}
            aria-busy={startingNote()}
            onClick={createNote}
          >
            <PlusIcon />
          </button>
        </section>
      </Show>

      <Show when={editing()}>
        <section
          class={styles.editorScreen}
          data-x="mobile-editor"
          data-x-mobile="editor"
          aria-label="Nota abierta"
        >
          <MobileEditorBar
            title={noteTitle()}
            subtitle={props.document?.path}
            onBack={closeEditor}
          />
          <div ref={(element) => (editorPane = element)} class={styles.editorPane}>
            <EditorPane
              document={props.document}
              status={props.status}
              initializing={props.loading}
              loading={props.documentLoading}
              reloadToken={props.documentReloadToken}
              error={props.error}
              onChange={props.onChange}
              onTitleChange={props.onTitleChange}
              onCreate={props.onCreate}
              onRetry={props.onRetry}
              onReload={props.onReload}
            />
          </div>
        </section>
      </Show>

      {props.overlays}
    </div>
  );
}