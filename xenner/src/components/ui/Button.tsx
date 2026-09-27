import { splitProps, type JSX } from "solid-js";

import styles from "../../styles/components/Button.module.css";

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary";
}

export function Button(props: ButtonProps) {
  const [local, buttonProps] = splitProps(props, ["variant", "class"]);
  const className = () =>
    [styles.button, local.variant ? styles[local.variant] : "", local.class ?? ""]
      .filter(Boolean)
      .join(" ");

  // Ganchos de skin: `data-x` marca que es un botón y `data-x-role` cuál es,
  // para poder atacar «el botón principal» sin conocer las clases hasheadas.
  return (
    <button
      {...buttonProps}
      class={className()}
      data-x="button"
      data-x-role={local.variant ?? "default"}
    />
  );
}
