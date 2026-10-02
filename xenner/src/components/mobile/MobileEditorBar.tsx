import { ArrowLeftIcon } from "../ui/Icons";
import { IconButton } from "../ui/IconButton";
import styles from "../../styles/components/MobileEditorBar.module.css";

export interface MobileEditorBarProps {
  /** Nombre de la nota, sin la extensión. */
  title: string;
  /** Ruta del archivo: va en el `title` para poder consultarlo sin cortar el nombre. */
  subtitle?: string;
  onBack(): void;
}

/**
 * Barra del editor a pantalla completa: la flecha de vuelta a la izquierda y el
 * nombre de la nota.
 *
 * Los insets seguros los trae la propia barra (`MobileEditorBar.module.css`):
 * es lo único que queda pegado al borde superior y a los laterales con el
 * modo edge-to-edge de Android, así que la flecha de vuelta ya sale dentro de la
 * zona segura sin medir nada.
 */
export function MobileEditorBar(props: MobileEditorBarProps) {
  return (
    <header class={styles.bar} data-x="mobile-editor-bar" data-x-mobile="editor-bar">
      <IconButton aria-label="Volver a las notas" title="Volver" onClick={props.onBack}>
        <ArrowLeftIcon />
      </IconButton>
      <h2 class={styles.title} title={props.subtitle ?? props.title} data-x-mobile="editor-bar-title">
        {props.title}
      </h2>
    </header>
  );
}