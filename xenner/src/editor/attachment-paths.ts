/**
 * Cómo se llama un archivo adjunto dentro de `.assets`.
 *
 * Vive aquí, y no en el servicio que guarda, porque es la mitad de una regla que
 * existe en dos sitios: Rust decide el nombre real en `vault.rs`
 * (`attachment_extension`) y el editor necesita saberlo para escribir el enlace
 * antes de que el archivo llegue a existir. La vista previa del navegador
 * también lo necesita, y ahí no hay disco: solo tiene que poner el mismo nombre
 * en el enlace para que lo que se escribe en el navegador se parezca a lo que
 * se escribe de verdad.
 *
 * Son funciones puras a propósito: no dependen del DOM ni del puente de Tauri, y
 * se prueban con `node --test` como el resto de las reglas del editor.
 */

/**
 * La extensión del archivo, en minúsculas, o `bin` si no tiene una usable.
 *
 * A diferencia de las imágenes, aquí no hay lista cerrada: un adjunto es lo que
 * sea que alguien quiera guardar con la nota, y un PDF rechazado por no estar en
 * la lista es un adjuntar que no hace su trabajo. Solo se exige que sea un
 * nombre de archivo de verdad —letras, dígitos, guion o guion bajo, y hasta
 * dieciséis caracteres— porque acaba formando parte de la ruta dentro de
 * `.assets` y esa ruta se resuelve contra el disco.
 *
 * Los casos raros siguen a `Path::extension` de Rust, que es el que decide:
 * un nombre que empieza por punto (`.gitignore`) no tiene extensión, y uno que
 * termina en punto (`informe.`) tampoco. Por eso no vale con `split(".")`.
 */
export function attachmentExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const isBetweenDots = dot > 0 && dot < fileName.length - 1;
  const extension = isBetweenDots ? fileName.slice(dot + 1).trim().toLocaleLowerCase("es") : "";
  return /^[a-z0-9_-]{1,16}$/.test(extension) ? extension : "bin";
}

/**
 * Los bytes que ocupa un base64, sin decodificarlo entero.
 *
 * Sirve para el tamaño que se le enseña a quien adjunta. Calcularlo a ojo
 * obligaría a decodificar megabytes en memoria solo para poner un número junto al
 * nombre del archivo.
 */
export function base64ByteLength(dataBase64: string): number {
  const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((dataBase64.length * 3) / 4) - padding);
}