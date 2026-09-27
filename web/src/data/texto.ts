/**
 * Poner en la página el texto que viene de los datos.
 *
 * Los datos de `data/skins.ts` están escritos para leerse en un archivo de
 * código, no en una página: llevan acentos graves alrededor de las claves
 * (`` `textDim` ``) porque en un `.txt` es la forma de decir «esto es un
 * nombre». Escapados y tal cual, en el navegador salían unos acentos graves
 * sueltos en mitad de una frase.
 *
 * Aquí se escapan primero —que es lo no negociable: nada de lo que venga de los
 * datos puede inyectar HTML— y después se cambian los acentos graves por
 * `<code>`. En ese orden, porque al revés el `&lt;` de un `<code>` inventado
 * acabaría dentro de la etiqueta.
 */

/**
 * Escapa lo que venga de los datos antes de ponerlo en la página.
 *
 * El `>` va en hexadecimal a propósito: un `>` suelto dentro de una expresión
 * regular hacía que `astro check` dejara de entender el archivo entero y
 * reportara cientos de errores falsos. Comprobado, no es teoría.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\x3E/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto de los datos, con los acentos graves convertidos en `<code>`. */
export function md(value: string): string {
  return esc(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}
