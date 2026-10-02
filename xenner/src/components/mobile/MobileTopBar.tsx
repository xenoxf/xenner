import { FolderPlusIcon, GearIcon } from "../ui/Icons";
import { IconButton } from "../ui/IconButton";
import styles from "../../styles/components/MobileTopBar.module.css";

export interface MobileTopBarProps {
  /** Título de la pantalla. */
  title: string;
  /** Ruta de la biblioteca: va en el `title` del título, no escrito en pantalla. */
  subtitle?: string;
  /** No deja empezar dos creaciones seguidas. */
  busy?: boolean;
  onCreateFolder(): void;
  onOpenSettings(): void;
}

/**
 * Barra superior de la lista: el título a la izquierda y los dos iconos a la
 * derecha, como en el dibujo. El borde de los gestos táctiles lo pone el
 * inset seguro del sistema, no un margen fijo.
 */
export function MobileTopBar(props: MobileTopBarProps) {
  return (
    <header class={styles.topBar} data-x="mobile-topbar" data-x-mobile="topbar">
      <strong class={styles.title} title={props.subtitle ?? props.title}>
        {props.title}
      </strong>
      <div class={styles.actions} data-x-mobile="topbar-actions">
        <IconButton
          disabled={props.busy}
          aria-label="Nueva carpeta"
          title="Nueva carpeta"
          onClick={props.onCreateFolder}
        >
          <FolderPlusIcon />
        </IconButton>
        <IconButton aria-label="Configuración" title="Configuración" onClick={props.onOpenSettings}>
          <GearIcon />
        </IconButton>
      </div>
    </header>
  );
}