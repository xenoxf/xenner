import type { JSX } from "solid-js";

import styles from "../../styles/components/AppShell.module.css";

export interface AppShellProps {
  children: JSX.Element;
}

export function AppShell(props: AppShellProps) {
  return <div class={styles.appShell}>{props.children}</div>;
}
