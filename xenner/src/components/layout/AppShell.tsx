import type { JSX } from "solid-js";

import styles from "../../styles/components/AppShell.module.css";

export interface AppShellProps {
  children: JSX.Element;
}

export function AppShell(props: AppShellProps) {
  // `data-x` es el vocabulario público de las skins: los nombres de clase de los
  // CSS Modules están hasheados y no sirven para escribir una skin a mano, así
  // que cada superficie tiene un gancho estable. La lista completa y qué es
  // cada cosa está en docs/SKIN_SPEC.md §5 y en la guía de la web.
  return (
    <div class={styles.appShell} data-x="app">
      {props.children}
    </div>
  );
}
