import { splitProps, type JSX } from "solid-js";

import styles from "../../styles/components/ModalBackdrop.module.css";

export interface ModalBackdropProps {
  children: JSX.Element;
  class?: string;
  onBackdropPointerDown?(): void;
}

export function ModalBackdrop(props: ModalBackdropProps) {
  const [local, backdropProps] = splitProps(props, ["class", "onBackdropPointerDown"]);
  const className = () => [styles.backdrop, local.class ?? ""].filter(Boolean).join(" ");

  return (
    <div
      {...backdropProps}
      class={className()}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) local.onBackdropPointerDown?.();
      }}
    />
  );
}
