/*
 * Detección de la plataforma donde corre Xenner.
 *
 * El criterio es el user agent y no el ancho de la ventana: la versión móvil es
 * otra vista, no la de escritorio en una ventana estrecha. Mirar el ancho
 * cambiaría el dibujo cada vez que se encoge la ventana, y en un portátil con la
 * ventana pequeña no es una tablet. Con el user agent, además, la vista previa
 * del navegador en el móvil (o la de un emulador) enseña la interfaz correcta.
 *
 * El valor se calcula una vez y se cachea: `navigator` no cambia durante la
 * sesión y estas funciones se llaman desde el render, donde repetir una
 * expresión regular en cada nodo es trabajo tirado.
 */

/** Cacheado en `null` hasta la primera consulta; después, el valor fijo. */
let mobile: boolean | null = null;

/** ¿Estamos en Android, iPhone, iPad o iPod? */
export function isMobilePlatform(): boolean {
  if (mobile !== null) return mobile;
  const userAgent = typeof navigator !== "undefined" ? (navigator.userAgent ?? "") : "";
  mobile = /Android|iPhone|iPad|iPod/i.test(userAgent);
  return mobile;
}

/**
 * ¿Se puede elegir una carpeta con el diálogo del sistema?
 *
 * En móvil no: el plugin de diálogo de Android no tiene selector de carpetas, así
 * que la biblioteca se fija al arrancar y no se puede cambiar desde la interfaz.
 */
export function platformSupportsFolderPicker(): boolean {
  return !isMobilePlatform();
}

/**
 * ¿Se puede abrir la biblioteca en el explorador de archivos del sistema?
 *
 * En móvil no hay explorador de archivos al que abrirla, así que el botón se
 * esconde en lugar de fallar al pulsarlo.
 */
export function platformSupportsFileReveal(): boolean {
  return !isMobilePlatform();
}