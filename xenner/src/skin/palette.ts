import type { ColorScheme } from "../types/appearance";
import type { SkinPalette } from "../types/skin";

/**
 * Una sola decisión de color para todo el tema.
 *
 * El panel rápido enseña los nueve colores de la paleta, pero quien empieza de
 * cero no quiere pensar en nueve cosas: quiere elegir «morado», que es una.
 * Este módulo deduce el resto desde esa única decisión y el modo claro/oscuro.
 * Si luego quiere afinar, los nueve colores siguen ahí: el atajo no esconde la
 * puerta de atrás, la pone primero.
 */

function parseHex(color: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * Un color a sus tres canales, venga como venga.
 *
 * Los `#rgb` y los `#rrggbbaa` salen en los temas escritos a mano, y los
 * `rgba(…)` son lo habitual en los que llevan una imagen de fondo: sin esto,
 * «¿es claro este tema?» solo entendería una de las tres formas y Contestaría
 * que sí a un `#00000080`, que es transparente.
 */
export function aRgb(color: string): [number, number, number] | null {
  const hex = parseHex(color);
  if (hex) return hex;

  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/i.exec(color.trim());
  if (corto) {
    return [corto[1], corto[2], corto[3]].map((d) => parseInt(`${d}${d}`, 16)) as [
      number,
      number,
      number,
    ];
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color.trim());
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

function toHex([r, g, b]: [number, number, number]): string {
  const parte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${parte(r)}${parte(g)}${parte(b)}`;
}

/** Mezcla dos colores: `t` es cuánto pesa el segundo. */
export function mezclar(a: string, b: string, t: number): string {
  const ca = aRgb(a);
  const cb = aRgb(b);
  if (!ca || !cb) return a;
  return toHex([
    ca[0] + (cb[0] - ca[0]) * t,
    ca[1] + (cb[1] - ca[1]) * t,
    ca[2] + (cb[2] - ca[2]) * t,
  ]);
}

/** Brillo relativo, más o menos: lo bastante para distinguir claro de oscuro. */
export function esClaro(color: string): boolean {
  const rgb = aRgb(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/**
 * Si un color es de tema claro u oscuro, o si no lo dice.
 *
 * Lo usa el cargador para decidir el `color-scheme`, que es lo que le dice al
 * motor qué colores son los de fábrica —barras de desplazamiento, controles y
 * el texto de la selección que pinta el navegador—. Devuelve `null` en vez de
 * adivinar cuando el color no se entiende: un degradado, un `var()`, o un
 * `rgba()` tan transparente que deja ver el fondo que tiene debajo y su color
 * no dice nada. Adivinar ahí es peor que no decidir.
 */
export function esquemaDe(color: string): "light" | "dark" | null {
  const bruto = color.trim();
  if (!bruto) return null;
  if (!aRgb(bruto)) return null;

  const alfa = /rgba?\([^)]*?[,/]\s*([\d.]+)\s*\)/i.exec(bruto);
  if (alfa && Number(alfa[1]) < 0.5) return null;

  return esClaro(bruto) ? "light" : "dark";
}

/**
 * La paleta completa a partir del color principal.
 *
 * Los fondos se tiñen un poco con el color principal en vez de ir a un gris
 * neutro: es lo que hace que un tema «morado» parezca morado incluso donde no
 * hay un botón. Los estados de hover y selección se apoyan en ese mismo color,
 * así el ojo ve una sola familia.
 */
export function paletaDesdeColor(mode: ColorScheme, principal: string): SkinPalette {
  const seguro = aRgb(principal) ? principal.trim() : "#5b9bd5";
  if (mode === "light") {
    return {
      background: mezclar("#ffffff", seguro, 0.06),
      surface: mezclar("#ffffff", seguro, 0.03),
      panel: mezclar("#f5f5f4", seguro, 0.08),
      text: "#2b2b28",
      textDim: "#767670",
      border: mezclar("#e2e2de", seguro, 0.15),
      accent: esClaro(seguro) ? mezclar(seguro, "#000000", 0.25) : seguro,
      hover: mezclar("#efefec", seguro, 0.14),
      active: mezclar("#e6e6e2", seguro, 0.22),
    };
  }
  return {
    background: mezclar("#151515", seguro, 0.08),
    surface: mezclar("#1e1e1e", seguro, 0.1),
    panel: mezclar("#232323", seguro, 0.12),
    text: "#e8e8e4",
    textDim: "#9a9a94",
    border: mezclar("#3a3a38", seguro, 0.22),
    accent: esClaro(seguro) ? seguro : mezclar(seguro, "#ffffff", 0.18),
    hover: mezclar("#2a2a2a", seguro, 0.18),
    active: mezclar("#333333", seguro, 0.3),
  };
}
