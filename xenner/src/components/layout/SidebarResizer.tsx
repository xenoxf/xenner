import {
  clampSidebarWidth,
  maxSidebarWidthFor,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STEP,
} from "../../services/sidebarLayout";
import styles from "../../styles/components/SidebarResizer.module.css";

export interface SidebarResizerProps {
  /** El ancho que se está aplicando ahora, o `null` si manda la hoja CSS. */
  width: number | null;
  /** Avisa en cada movimiento del arrastre. `null` devuelve al ancho de la hoja. */
  onWidthChange(width: number | null): void;
}

/**
 * El tirador del borde derecho del panel de notas.
 *
 * Va pegado al borde, no como una columna aparte, porque su sitio es
 * exactamente ese borde: si se separa un píxel del panel o del editor deja de
 * leerse como lo que es. Se arrastra con el puntero y también con el teclado,
 * porque una franja de nueve píxeles es imposible de acertar sin puntero fino y
 * la aplicación tiene que poder usarse entera sin ratón.
 *
 * El ancho se mide sobre el propio panel —su elemento padre— en vez de llevar
 * la cuenta por dentro: así el punto de partida es el ancho real, sea el que se
 * haya elegido antes o el que le haya puesto la hoja CSS.
 */
export function SidebarResizer(props: SidebarResizerProps) {
  let handle: HTMLDivElement | undefined;

  const panelWidth = (): number => {
    const parent = handle?.parentElement;
    return parent ? parent.getBoundingClientRect().width : SIDEBAR_WIDTH_MIN;
  };

  const applied = (): number => props.width ?? panelWidth();

  /**
   * El tope de esta ventana, no el de siempre. Se lee al usar el tirador y no al
   * montar: la ventana se puede cambiar de tamaño con el panel abierto, y un
   * tope calculado una vez dejaría poder estirar el panel hasta comerse el
   * editor.
   */
  const ceiling = (): number =>
    typeof window === "undefined" ? SIDEBAR_WIDTH_MAX : maxSidebarWidthFor(window.innerWidth);

  function moveTo(width: number): void {
    props.onWidthChange(clampSidebarWidth(width, ceiling()));
  }

  function nudge(delta: number): void {
    moveTo(applied() + delta);
  }

  function onKeyDown(event: KeyboardEvent): void {
    const step = event.shiftKey ? SIDEBAR_WIDTH_STEP * 3 : SIDEBAR_WIDTH_STEP;
    if (event.key === "ArrowLeft") nudge(-step);
    else if (event.key === "ArrowRight") nudge(step);
    else if (event.key === "Home") moveTo(SIDEBAR_WIDTH_MIN);
    else if (event.key === "End") moveTo(SIDEBAR_WIDTH_MAX);
    else return;
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent): void {
    // Solo el botón principal: el derecho abre el menú contextual del árbol.
    if (event.button !== 0) return;
    const target = handle;
    if (!target) return;
    const startX = event.clientX;
    const startWidth = panelWidth();
    const top = ceiling();

    // Mientras se arrastra, el puntero se vuelve una flecha y no se selecciona
    // texto: sin esto, un arrastre rápido acaba pintando la lista de notas.
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent): void => {
      props.onWidthChange(clampSidebarWidth(startWidth + moveEvent.clientX - startX, top));
    };
    const stop = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };

    target.setPointerCapture(event.pointerId);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  return (
    <div
      ref={(element) => {
        handle = element;
      }}
      class={styles.resizer}
      data-x="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho de la lista de notas"
      /* Sin ancho elegido no se dice el valor: el que se está viendo lo pone la
         hoja CSS y aquí no se ha medido todavía. Antes callar que mentir. */
      aria-valuenow={props.width ?? undefined}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={ceiling()}
      tabindex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      /* Dos clics devuelven el panel al ancho que le pone la hoja CSS, que es el
         que se adapta a la ventana. */
      onDblClick={() => props.onWidthChange(null)}
    >
      <span class={styles.grip} aria-hidden="true" />
    </div>
  );
}