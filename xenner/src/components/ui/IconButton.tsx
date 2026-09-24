import { splitProps, type JSX } from "solid-js";

import styles from "../../styles/components/IconButton.module.css";

export interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "default" | "compact" | "small";
  tone?: "danger";
}

export function IconButton(props: IconButtonProps) {
  const [local, buttonProps] = splitProps(props, ["size", "tone", "class"]);
  const className = () =>
    [
      styles.iconButton,
      local.size ? styles[local.size] : "",
      local.tone ? styles[local.tone] : "",
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  return <button {...buttonProps} class={className()} />;
}
