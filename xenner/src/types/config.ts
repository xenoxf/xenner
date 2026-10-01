/**
 * La carpeta de Xenner y lo que hay dentro.
 *
 * La resuelve el backend, que es el único que sabe qué ruta usa este sistema
 * operativo: `~/.config/xenner` en Linux, `~/Library/Application Support/xenner`
 * en macOS y `%APPDATA%\xenner` en Windows. El frontend no la adivina, porque
 * adivinarla es justo el problema que esto viene a resolver.
 */
export interface ConfigInfo {
  /** La carpeta de Xenner, sin barra final. */
  root: string;
  /** La carpeta de temas, con barra final para poder concatenar. */
  skins: string;
  /**
   * Dónde estaban los temas en versiones anteriores, si queda algo ahí. La app
   * los copia a la carpeta nueva al arrancar, así que esto solo sirve para
   * explicar de dónde salieron.
   */
  previous?: string;
}
