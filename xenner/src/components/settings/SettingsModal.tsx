import { createSignal, For, onMount, Show } from "solid-js";

import { DEFAULT_APPEARANCE, isDefaultAppearance } from "../../data/appearance";
import {
  searchSettings,
  SETTINGS_SECTIONS,
  sectionDe,
  THEME_MODES,
  type SettingsNavigationItem,
  type SettingsSection,
} from "../../data/settings";
import styles from "../../styles/components/SettingsModal.module.css";
import type { Appearance } from "../../types/appearance";
import type { SkinInfo } from "../../types/skin";
import {
  CheckIcon,
  CloseIcon,
  FolderPlusIcon,
  InfoIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  ShapesIcon,
} from "../ui/Icons";
import { ConfigFolder } from "./ConfigFolder";
import { FontSelect } from "./FontSelect";
import { IconButton } from "../ui/IconButton";
import { InfoHint } from "./InfoHint";
import { ModalBackdrop } from "../ui/ModalBackdrop";
import { SkinCreator } from "./SkinCreator";
import { exportSkin, importSkin } from "../../services/skinExport";

export interface SettingsModalProps {
  skins: SkinInfo[];
  activeSkin: string;
  loading: boolean;
  appearance: Appearance;
  onAppearanceChange(appearance: Appearance): void;
  onSkinChange(id: string): void;
  onSkinCreated(skin: SkinInfo): void;
  /** Un tema importado: hay que recargar la lista para que aparezca. */
  onSkinImported(skin: SkinInfo): void;
  /** El tema que se está editando, o `null` si se está creando uno nuevo. */
  editingSkin: SkinInfo | null;
  onSkinEdit(skin: SkinInfo): void;
  onSkinEditCancel(): void;
  onClose(): void;
}

interface AppearanceField {
  key: "editorSize" | "lineHeight" | "contentWidth";
  label: string;
  /** Explica para qué sirve, no repite la etiqueta. */
  hint: string;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
}

const APPEARANCE_FIELDS: readonly AppearanceField[] = [
  {
    key: "editorSize",
    label: "Tamaño del texto",
    hint: "El cuerpo de tus notas",
    min: 12,
    max: 24,
    step: 1,
    format: (value) => `${value} px`,
  },
  {
    key: "lineHeight",
    label: "Interlineado",
    hint: "Cuánto aire hay entre líneas",
    min: 1.2,
    max: 2.2,
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
  {
    key: "contentWidth",
    label: "Ancho de lectura",
    hint: "Cuántas letras caben en cada línea",
    min: 560,
    max: 1200,
    step: 20,
    format: (value) => `${value} px`,
  },
];

export function SettingsModal(props: SettingsModalProps) {
  const [section, setSection] = createSignal<SettingsSection>("appearance");
  /**
   * Lo que se está buscando.
   *
   * Vacío significa «enseñar las secciones», no «no hay resultados»: con la
   * búsqueda vacía la navegación es exactamente la de siempre, porque un buscador
   * que cambia el panel de lado al borrarse obliga a reconstruir la lista mental cada
   * vez que se equivoca una tecla.
   */
  const [consulta, setConsulta] = createSignal("");
  /** El ajuste que se acaba de elegir en el buscador, para resaltarlo un momento. */
  const [resaltado, setResaltado] = createSignal<string | null>(null);
  let dialog: HTMLDivElement | undefined;

  onMount(() => queueMicrotask(() => dialog?.focus()));

  const current = (): SettingsNavigationItem => sectionDe(section());

  const resultados = () => searchSettings(consulta());

  function buscar(texto: string): void {
    setConsulta(texto);
  }

  /**
   * Ir al ajuste que se ha elegido en el buscador.
   *
   * La búsqueda **no** se borra al elegir: quien escribe «oscuro» y ve tres
   * resultados quiere poder seguir escribiendo para afinar, no que la lista se
   * desvanezca bajo el dedo. El ajuste elegido se resalta un momento, que es lo que
   * dice dónde ha caído: sin eso, elegir un resultado y no ver nada moverse es
   * indistinguible de que no haya pasado.
   */
  function irA(id: SettingsSection, etiqueta: string): void {
    setSection(id);
    setResaltado(etiqueta);
    window.setTimeout(() => setResaltado(null), 1600);
  }

  const fieldValue = (field: AppearanceField): number => props.appearance[field.key];

  const setField = (field: AppearanceField, value: number): void => {
    props.onAppearanceChange({ ...props.appearance, [field.key]: value });
  };

  // Nombre del tema activo, para poder nombrarlo en vez de decir "una skin".
  const activeSkinName = (): string | null => {
    if (props.activeSkin === "") return null;
    return props.skins.find((skin) => skin.id === props.activeSkin)?.name ?? null;
  };

  // Un tema propio trae su propia paleta, así que el modo claro/oscuro solo
  // tiene sentido con el tema de Xenner.
  const themeModeLocked = (): boolean => props.activeSkin !== "";

  const themeModeHint = (): string => {
    if (!themeModeLocked()) return "Sigue a tu sistema o fija uno";
    const name = activeSkinName();
    return name ? `Cambia con el tema «${name}»` : "Cambia con el tema elegido";
  };

  /** El modo de color está bloqueado, y el aviso de por qué se ve abajo. */
  const themeModeLockedHint = (): string => themeModeHint();

  const canReset = (): boolean =>
    section() === "appearance" && !isDefaultAppearance(props.appearance);

  const [aviso, setAviso] = createSignal<string | null>(null);

  async function compartirSkin(id: string): Promise<void> {
    setAviso(null);
    try {
      const destino = await exportSkin(id);
      if (destino) setAviso(`Tema guardado en: ${destino}`);
    } catch (cause) {
      setAviso(cause instanceof Error ? cause.message : "No se pudo exportar el tema");
    }
  }

  /**
   * Importar un tema con un clic.
   *
   * El diálogo del sistema hace el trabajo de "ve a la carpeta, copia, pega":
   * elegir la carpeta es toda la operación. Si viene uno que ya existe, se dice
   * cuál y por qué, en vez de dejar a medias la lista.
   */
  async function importarTema(): Promise<void> {
    setAviso(null);
    try {
      const skin = await importSkin();
      if (!skin) return;
      props.onSkinImported(skin);
      setAviso(`«${skin.name}» ya está en tu lista de temas.`);
    } catch (cause) {
      setAviso(cause instanceof Error ? cause.message : "No se pudo importar el tema");
    }
  }

  function elegirSection(id: SettingsSection): void {
    setSection(id);
    setConsulta("");
  }

  // Con un tema abierto, «restablecer» no puede ser «volver a los valores de
  // fábrica» sin más: sería mentir, porque no es el tema de fábrica. Se dice lo
  // que va a pasar en su lugar.
  const resetLabel = (): string => (props.editingSkin ? "Cerrar sin guardar" : "Restablecer");

  return (
    <ModalBackdrop onBackdropPointerDown={props.onClose}>
      <div
        ref={(element) => {
          dialog = element;
        }}
        class={styles.modal}
        data-x="modal"
        data-x-modal="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
      >
        <nav class={styles.nav} aria-label="Secciones de configuración">
          {/*
            El buscador va **encima** de la lista y no la sustituye: con la búsqueda
            vacía se ve la navegación de siempre. Es lo que hace que probar no cueste
            nada —si al borrar lo escrito volvieran las secciones, habría que aprender
            a volver atrás sin querer—.
          */}
          <div class={styles.searchWrap}>
            <SearchIcon />
            <input
              class={styles.search}
              type="search"
              value={consulta()}
              placeholder="Buscar un ajuste"
              aria-label="Buscar un ajuste"
              // Enter elige el primer resultado, que es lo que quien busca «oscuro»
              // espera: escribe, le da a Intro y ya está en el sitio.
              onInput={(event) => buscar(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const primero = resultados()[0];
                if (primero) irA(primero.section, primero.label);
              }}
            />
            <Show when={consulta()}>
              <button
                type="button"
                class={styles.searchClear}
                aria-label="Borrar la búsqueda"
                onClick={() => buscar("")}
              >
                <CloseIcon />
              </button>
            </Show>
          </div>

          <div class={styles.sections}>
            <Show
              when={consulta()}
              fallback={
                <For each={SETTINGS_SECTIONS}>
                  {(item) => (
                    <button
                      type="button"
                      class={`${styles.section} ${section() === item.id ? styles.sectionActive : ""}`}
                      aria-current={section() === item.id ? "page" : undefined}
                      onClick={() => elegirSection(item.id)}
                    >
                      <span class={styles.sectionIcon} aria-hidden="true">
                        <Show when={item.id === "appearance"}><MoonIcon /></Show>
                        <Show when={item.id === "skins"}><ShapesIcon /></Show>
                        <Show when={item.id === "create"}><PlusIcon /></Show>
                      </span>
                      <span class={styles.sectionText}>
                        <strong>{item.label}</strong>
                        <small>{item.hint}</small>
                      </span>
                    </button>
                  )}
                </For>
              }
            >
              {/*
                Los resultados se muestran en el **mismo** panel, no en otro sitio: el
                buscador no cambia la forma del modal, solo lo que hay pintado en la
                columna de la izquierda.
              */}
              <Show
                when={resultados().length > 0}
                fallback={<p class={styles.searchEmpty}>Nada con esa palabra.</p>}
              >
                <p class={styles.searchGroup}>Ajustes</p>
                <For each={resultados()}>
                  {(item) => (
                    <button
                      type="button"
                      class={styles.searchResult}
                      onClick={() => irA(item.section, item.label)}
                    >
                      <span class={styles.searchResultLabel}>{item.label}</span>
                      <span class={styles.searchResultMeta}>
                        {sectionDe(item.section).label} · {item.description}
                      </span>
                    </button>
                  )}
                </For>
              </Show>
            </Show>
          </div>

          {/* Sin pie de nada: «los cambios se aplican al instante» es una promesa que
              el modal cumple, no una instrucción que haya que leer. */}
        </nav>

        <section class={styles.content}>
          {/*
            El título va dentro de lo que se desplaza, no en una cabecera fija. Con la
            cabecera fija el nombre de la sección ocupa siempre 72 px y el contenido
            útil no; sin ella, el nombre se va con el texto, que es lo que se lee de un
            editor. Y la «X» flota encima de todo, en su esquina.
          */}
          <div class={styles.scroll}>
            <div class={styles.body}>
              <header class={styles.pageHeader}>
                <div>
                  <h1 id="settings-title" class={styles.pageTitle}>
                    {current().label}
                  </h1>
                  <p class={styles.pageDescription}>{current().description}</p>
                </div>
                <Show when={canReset() || props.editingSkin}>
                  <button
                    type="button"
                    class={styles.reset}
                    onClick={() => {
                      if (props.editingSkin) props.onSkinEditCancel();
                      else props.onAppearanceChange({ ...DEFAULT_APPEARANCE });
                    }}
                  >
                    {resetLabel()}
                  </button>
                </Show>
              </header>
              <Show when={section() === "appearance"}>
                {/*
                  Sin cajas. Las secciones se separan con una raya fina y aire, y las
                  filas no llevan fondo ni borde propio: el cromo de cada fila convierte
                  la página en un tablero, y lo que se busca es el texto de un ajuste,
                  no una tabla. Solo las rejillas de «elige un tema» —que son objetos
                  que se pinchan— llevan tarjeta, porque ahí sí es una ficha.
                */}
                <div class={styles.group}>
                  <h2 class={styles.groupTitle}>Modo de color</h2>
                  <div class={styles.row}>
                    <div class={styles.rowLabel}>
                      <span class={styles.rowLabelText}>Tema</span>
                      <InfoHint label="Qué hace el modo de color">
                        {themeModeLockedHint()}. Elige si Xenner se ve claro, oscuro o como
                        el sistema que uses.
                      </InfoHint>
                    </div>
                    <div class={styles.rowControl}>
                      <div
                        class={styles.segmented}
                        role="radiogroup"
                        aria-label="Modo de color"
                        aria-disabled={themeModeLocked() ? "true" : undefined}
                      >
                        <For each={THEME_MODES}>
                          {(mode) => (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={props.appearance.mode === mode.id}
                              disabled={themeModeLocked()}
                              onClick={() =>
                                props.onAppearanceChange({ ...props.appearance, mode: mode.id })
                              }
                            >
                              {mode.label}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                  <Show when={themeModeLocked()}>
                    <div class={styles.notice}>
                      <InfoIcon />
                      <span>
                        Para poder alternar entre claro y oscuro, vuelve al tema{" "}
                        <strong>Xenner</strong> en la sección Temas.
                      </span>
                    </div>
                  </Show>
                </div>

                <div class={styles.group}>
                  <h2 class={styles.groupTitle}>Tipografías</h2>
                  <div class={styles.row}>
                    <label class={styles.rowLabel} for="ui-font">
                      <span class={styles.rowLabelText}>Interfaz</span>
                    </label>
                    <div class={styles.rowControl}>
                      <FontSelect
                        id="ui-font"
                        value={props.appearance.uiFont}
                        onChange={(uiFont) =>
                          props.onAppearanceChange({ ...props.appearance, uiFont })
                        }
                      />
                    </div>
                    <InfoHint label="Qué tipografía es la de la interfaz">
                      La de la interfaz afecta a botones y menús; la del editor, al texto
                      de tus notas. Xenner no descarga tipografías: se aplican las que ya
                      tengas instaladas en este equipo, y cada opción indica de qué se
                      sustituye si falta.
                    </InfoHint>
                  </div>
                  <div class={styles.row}>
                    <label class={styles.rowLabel} for="editor-font">
                      <span class={styles.rowLabelText}>Editor</span>
                    </label>
                    <div class={styles.rowControl}>
                      <FontSelect
                        id="editor-font"
                        value={props.appearance.editorFont}
                        onChange={(editorFont) =>
                          props.onAppearanceChange({ ...props.appearance, editorFont })
                        }
                      />
                    </div>
                    <InfoHint label="Qué tipografía es la del editor">
                      El texto de tus notas. Es la que se lee durante horas, así que
                      conviene una que se lea bien en un texto largo.
                    </InfoHint>
                  </div>
                </div>

                <div class={styles.group}>
                  <h2 class={styles.groupTitle}>Lectura</h2>
                  <For each={APPEARANCE_FIELDS}>
                    {(field) => (
                      <div
                        class={`${styles.row}${
                          resaltado() === field.label ? ` ${styles.resaltado}` : ""
                        }`}
                      >
                        <label class={styles.rowLabel} for={`appearance-${field.key}`}>
                          <span class={styles.rowLabelText}>{field.label}</span>
                          <InfoHint label={`Qué es ${field.label.toLowerCase()}`}>
                            {field.hint}.
                          </InfoHint>
                        </label>
                        <div class={styles.rowControl}>
                          <input
                            id={`appearance-${field.key}`}
                            class={styles.range}
                            type="range"
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            value={fieldValue(field)}
                            onInput={(event) =>
                              setField(field, Number(event.currentTarget.value))
                            }
                          />
                          <output>{field.format(fieldValue(field))}</output>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={section() === "skins"}>
                <div class={styles.group}>
                  <div class={styles.groupHeader}>
                    <h2 class={styles.groupTitle}>Elige un tema</h2>
                    <button
                      type="button"
                      class={styles.groupAction}
                      onClick={() => void importarTema()}
                    >
                      <FolderPlusIcon />
                      <span>Traer un tema</span>
                    </button>
                  </div>
                  {/*
                    El aviso se queda **visible**: es lo único de esta página que hay
                    que leer después de actuar, porque dice dónde ha acabado el archivo.
                    Es la clase de texto que no va detrás de un ⓘ.
                  */}
                  <Show when={aviso()}>
                    <p class={styles.status} role="status">
                      {aviso()}
                    </p>
                  </Show>
                  <ul class={styles.skinList}>
                    <li>
                      <button
                        type="button"
                        class={`${styles.skinCard} ${props.activeSkin === "" ? styles.skinCardActive : ""}`}
                        disabled={props.loading}
                        onClick={() => props.onSkinChange("")}
                      >
                        <span class={styles.skinCardCopy}>
                          <strong>Xenner</strong>
                          <small>El original · claro y oscuro</small>
                        </span>
                        <span class={styles.skinUse}>
                          {props.activeSkin === "" ? <CheckIcon /> : "Usar"}
                        </span>
                      </button>
                    </li>
                    <For each={props.skins}>
                      {(skin) => (
                        <li class={styles.skinItem}>
                          <button
                            type="button"
                            class={`${styles.skinCard} ${props.activeSkin === skin.id ? styles.skinCardActive : ""}`}
                            disabled={props.loading}
                            onClick={() => props.onSkinChange(skin.id)}
                          >
                            <span class={styles.skinCardCopy}>
                              <strong>{skin.name}</strong>
                              <small>
                                {skin.origin === "user"
                                  ? "Creado por ti"
                                  : skin.author
                                    ? `Incluido · ${skin.author}`
                                    : "Incluido"}
                              </small>
                            </span>
                            <span class={styles.skinUse}>
                              {props.activeSkin === skin.id ? <CheckIcon /> : "Usar"}
                            </span>
                          </button>
                          {/*
                            «Editar» es hermano de la tarjeta, no un hijo suyo:
                            un botón dentro de otro botón es HTML que no vale, y
                            los navegadores lo sacan fuera por su cuenta, con lo
                            que la tarjeta deja de funcionar al pulsarla.
                          */}
                          <Show when={skin.origin === "user"}>
                            <span class={styles.skinActions}>
                              <button
                                type="button"
                                class={styles.skinEdit}
                                onClick={() => {
                                  props.onSkinEdit(skin);
                                  setSection("create");
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                class={styles.skinEdit}
                                onClick={() => void compartirSkin(skin.id)}
                              >
                                Exportar
                              </button>
                            </span>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                  <ConfigFolder variant="skins" />
                </div>
              </Show>

              <Show when={section() === "create"}>
                <div class={styles.group}>
                  <h2 class={styles.groupTitle}>
                    {props.editingSkin ? "Edita tu tema" : "Crea un tema"}
                  </h2>
                  <p class={styles.groupHint}>
                    {props.editingSkin
                      ? "Estás editando un tema que ya habías creado. Los cambios se guardan en los mismos archivos de antes."
                      : "Empieza de una paleta, ajusta lo que quieras y guárdalo con un nombre. Se añade a la lista de temas para que puedas usarlo cuando quieras."}
                  </p>
                  <Show when={props.editingSkin}>
                    <button type="button" class={styles.linkish} onClick={props.onSkinEditCancel}>
                      Volver a crear uno nuevo desde cero
                    </button>
                  </Show>
                  <div class={styles.embed}>
                    <SkinCreator
                      editing={props.editingSkin ?? null}
                      onCreated={props.onSkinCreated}
                      onSaved={props.onSkinChange}
                    />
                  </div>
                  <ConfigFolder variant="create" />
                </div>
              </Show>
            </div>
          </div>

          {/*
            La «X» flota en su esquina en vez de vivir en una cabecera. Sin cabecera
            fija, la única cosa que hay en ese rincón es cerrar, y ponerle una fila
            entera de 72 px para un botón sería gastar la parte más ancha de la
            pantalla en no mostrar nada.
          */}
          <div class={styles.corner}>
            <IconButton aria-label="Cerrar configuración" onClick={props.onClose}>
              <CloseIcon />
            </IconButton>
          </div>
        </section>
      </div>
    </ModalBackdrop>
  );
}
