import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

import styles from "../../styles/components/SettingsModal.module.css";
import { InfoIcon } from "../ui/Icons";

export interface InfoHintProps {
  /** Lo que explica. No se ve hasta que alguien apunta o pulsa el icono. */
  children: JSX.Element;
  /** Para el lector de pantalla: de qué ajuste es la explicación. */
  label: string;
}

const MARGEN = 8;

/**
 * La explicación de un ajuste, detrás de un icono.
 *
 * Es la regla que hace que un panel de ajustes se pueda leer de un vistazo: el texto
 * visible se reserva para lo que hay que leer **siempre** —una advertencia, un estado,
 * un error— y lo que solo explica para qué sirve una opción se esconde detrás de este
 * ⓘ. Con diez ajustes y cuatro frases de explicación debajo de cada uno, la página
 * es un muro de texto y no se ve dónde está nada.
 *
 * Se abre con el puntero **y con un clic**, no solo al pasar por encima. En un dedo no
 * hay `hover`, y un icono que solo se abre al apuntar deja de existir en el móvil;
 * además el clic es lo que hace quien va con el teclado.
 *
 * Se posiciona debajo del icono y nunca se sale de la ventana: una explicación que
 * aparece cortada no explica. Y si no cabe debajo —que es lo normal en el último
 * ajuste de una página— sale arriba, que es donde queda sitio.
 */
export function InfoHint(props: InfoHintProps) {
  const [abierto, setAbierto] = createSignal(false);
  const [posicion, setPosicion] = createSignal<{ left: number; top: number } | null>(null);
  let boton: HTMLButtonElement | undefined;
  let globo: HTMLDivElement | undefined;

  function abrir(): void {
    if (!boton || typeof window === "undefined") return;
    const rect = boton.getBoundingClientRect();
    const ancho = globo?.offsetWidth ?? 260;
    const alto = globo?.offsetHeight ?? 0;
    const abajo = rect.bottom + 8;
    const noCabeAbajo = abajo + alto > window.innerHeight - MARGEN;
    setPosicion({
      left: Math.max(MARGEN, Math.min(rect.left, window.innerWidth - ancho - MARGEN)),
      top: noCabeAbajo ? Math.max(MARGEN, rect.top - alto - 8) : abajo,
    });
    setAbierto(true);
  }

  function alternar(): void {
    if (abierto()) {
      setAbierto(false);
      return;
    }
    abrir();
  }

  createEffect(() => {
    if (!abierto()) return;
    const fuera = (event: PointerEvent): void => {
      const destino = event.target;
      // `closest` es de `Element`: un nodo que no lo es —un nodo de texto— no puede
      // ser ni el icono ni su explicación, así que se cierra.
      if (!(destino instanceof Element)) {
        setAbierto(false);
        return;
      }
      if (destino.closest("[data-x='info-hint']")) return;
      if (event.target instanceof Node && globo?.contains(event.target)) return;
      setAbierto(false);
    };
    const enEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", enEscape, true);
    // El globo se mide después de pintarse: sin su tamaño no se sabe dónde cabe.
    queueMicrotask(abrir);
    onCleanup(() => {
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("keydown", enEscape, true);
    });
  });

  return (
    <span class={styles.infoHint} data-x="info-hint">
      <button
        ref={(element) => (boton = element)}
        type="button"
        class={styles.infoHintButton}
        aria-label={props.label}
        aria-expanded={abierto()}
        // Sin esto el clic se comería el texto de alrededor al seleccionar, que es
        // justo lo que se hace cuando se lee un panel de ajustes.
        onPointerDown={(event) => event.preventDefault()}
        onClick={alternar}
        onMouseEnter={abrir}
        onMouseLeave={() => setAbierto(false)}
      >
        <InfoIcon />
      </button>
      <Show when={abierto()}>
        <Portal>
          <div
            ref={(element) => (globo = element)}
            class={styles.infoHintBox}
            role="tooltip"
            style={`left: ${posicion()?.left ?? 0}px; top: ${posicion()?.top ?? 0}px;`}
          >
            {props.children}
          </div>
        </Portal>
      </Show>
    </span>
  );
}