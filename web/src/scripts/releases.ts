/**
 * Lectura de la release de GitHub para los botones de descarga.
 *
 * Todo lo que hay aquí son funciones puras sobre datos: reciben el JSON que
 * devuelve la API de GitHub y devuelven qué instalador le toca a cada sistema.
 * La parte que habla con la red y la que pinta los botones viven en otro sitio,
 * que es lo que permite probar estas reglas con `node --test`.
 *
 * ---------------------------------------------------------------------------
 * Por qué se decide por extensión y no por el nombre
 *
 * La regla obvious sería buscar «macos», «windows» o «linux» dentro del nombre
 * del archivo, como hace Glenker. Con los nombres que genera Tauri eso no
 * encuentra nada, porque no los lleva:
 *
 *   xenner_<version>_aarch64.dmg     <- macOS, sin la palabra macos
 *   xenner_<version>_x64-setup.exe   <- Windows, sin la palabra windows
 *   xenner_<version>_amd64.deb       <- Linux, sin la palabra linux
 *
 * La extensión, en cambio, no miente: un .dmg solo se abre en macOS y un .exe
 * o un .msi solo en Windows. Por eso la plataforma se decide por extensión y
 * el nombre solo se usa, dentro de la plataforma ya decidida, para distinguir
 * arquitecturas.
 */

/** Un archivo adjunto de la release. */
export interface ReleaseAsset {
  name: string;
  /** Tamaño en bytes. La API puede devolverlo a 0 si aún se está subiendo. */
  size: number;
  browser_download_url: string;
}

/** La release, tal y como la devuelve `releases/latest`. */
export interface Release {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  assets: readonly ReleaseAsset[];
}

export type Platform = 'mac' | 'windows' | 'linux';
export type Arch = 'arm64' | 'x64' | 'unknown';

export const PLATFORMS: readonly Platform[] = ['mac', 'windows', 'linux'];

/**
 * Extensiones por plataforma, en el orden en que se prefieren. La primera que
 * exista en la release es la descarga principal y las demás salen debajo como
 * formatos alternativos.
 *
 * En macOS el .dmg va primero porque es lo que se espera al hacer doble clic;
 * el .zip queda para quien lo quiera montar a mano.
 *
 * Van todas en minúsculas porque es contra minúsculas como se comparan: el
 * .AppImage viene escrito con mayúsculas y el resto no.
 */
const PLATFORM_EXTENSIONS: Record<Platform, readonly string[]> = {
  mac: ['.dmg', '.zip', '.pkg'],
  windows: ['.exe', '.msi'],
  linux: ['.appimage', '.deb', '.rpm'],
};

/**
 * Palabras con las que cada arquitectura aparece en el nombre del archivo.
 *
 * Tauri nombra cada formato con el convenio que le toca, y no son los mismos:
 * macOS usa el target de Rust (aarch64, x86_64), el .deb y el .AppImage usan el
 * de dpkg (arm64, amd64) y el .rpm usa el de RPM (aarch64, x86_64). Se aceptan
 * los tres para no depender de con cuál se compiló.
 */
const ARCH_TOKENS: Record<Exclude<Arch, 'unknown'>, readonly string[]> = {
  arm64: ['arm64', 'aarch64'],
  x64: ['x64', 'x86_64', 'amd64', 'x86-64'],
};

/** Cómo se escribe cada formato en la etiqueta que ve el visitante. */
const FORMAT_LABELS: readonly { ext: string; label: string }[] = [
  { ext: '.appimage', label: 'AppImage' },
  { ext: '.dmg', label: 'DMG' },
  { ext: '.deb', label: 'deb' },
  { ext: '.rpm', label: 'RPM' },
  { ext: '.msi', label: 'MSI' },
  { ext: '.exe', label: 'EXE' },
  { ext: '.pkg', label: 'PKG' },
  { ext: '.zip', label: 'ZIP' },
];

/** Lo que se ofrece en la tarjeta de cada sistema. */
export interface DownloadChoice {
  asset: ReleaseAsset;
  /**
   * `false` cuando no había binario para la arquitectura del visitante y se
   * ofrece el que sí había. En macOS un .dmg de Intel funciona en Apple Silicon
   * con Rosetta, al revés no, así que la tarjeta avisa en vez de callarse.
   */
  exactArch: boolean;
}

/** Extensión en minúsculas de un nombre de archivo. */
function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
}

/** Nombre legible del formato: `AppImage`, `deb`, `EXE`… */
export function formatLabel(name: string): string {
  const ext = extOf(name);
  if (ext === '') return '';
  return FORMAT_LABELS.find((entry) => entry.ext === ext)?.label ?? ext.replace('.', '');
}

/** Tamaño en bytes escrito como `12,4 MB`. */
export function formatSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  // Por debajo de 10 MB una cifra decimal hace ruido; por encima se pierde.
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

/** `v1.2.3` → `1.2.3`. Lo que la v delante no siempre está. */
export function normalizeVersion(tag: string | null | undefined): string {
  if (!tag) return '';
  return tag.trim().replace(/^v/i, '');
}

/**
 * El candidato que mejor encaja con la arquitectura pedida.
 *
 * Si ninguno la menciona, se devuelve el primero que haya: una tarjeta con un
 * binario que funciona (aunque sea con Rosetta) es mejor que una tarjeta vacía.
 */
function bestArchMatch(
  candidates: readonly ReleaseAsset[],
  arch: Arch,
): { asset: ReleaseAsset; exactArch: boolean } | null {
  if (candidates.length === 0) return null;
  if (arch !== 'unknown') {
    const tokens = ARCH_TOKENS[arch];
    const hit = candidates.find((asset) => {
      const lower = asset.name.toLowerCase();
      return tokens.some((token) => lower.includes(token));
    });
    if (hit) return { asset: hit, exactArch: true };
  }
  return { asset: candidates[0], exactArch: false };
}

/** Los instaladores de una plataforma que tienen una extensión concreta. */
function candidatesFor(assets: readonly ReleaseAsset[], ext: string): ReleaseAsset[] {
  return assets.filter((asset) => extOf(asset.name) === ext);
}

/**
 * El instalador principal para una plataforma: el primer formato de la lista de
 * preferencias que exista en la release. `null` si la release no trae nada para
 * ese sistema.
 */
export function pickPrimary(
  assets: readonly ReleaseAsset[],
  platform: Platform,
  arch: Arch,
): DownloadChoice | null {
  for (const ext of PLATFORM_EXTENSIONS[platform]) {
    const candidates = candidatesFor(assets, ext);
    const match = bestArchMatch(candidates, arch);
    if (match) return match;
  }
  return null;
}

/**
 * Los demás formatos de la misma plataforma, uno por formato y en el mismo
 * orden de preferencia, sin repetir el que ya es la descarga principal.
 */
export function pickAlternates(
  assets: readonly ReleaseAsset[],
  platform: Platform,
  arch: Arch,
  primary: ReleaseAsset | null,
): ReleaseAsset[] {
  const used = new Set(primary ? [extOf(primary.name)] : []);
  const out: ReleaseAsset[] = [];

  for (const ext of PLATFORM_EXTENSIONS[platform]) {
    if (used.has(ext)) continue;
    const candidates = candidatesFor(assets, ext);
    const match = bestArchMatch(candidates, arch);
    if (match) {
      out.push(match.asset);
      used.add(ext);
    }
  }

  return out;
}

/** Lo mínimo que hay que mirar de una release para poder pintar algo. */
export function isUsableRelease(release: unknown): release is Release {
  if (!release || typeof release !== 'object') return false;
  const candidate = release as Partial<Release>;
  return typeof candidate.tag_name === 'string' && Array.isArray(candidate.assets);
}

/** Datos sueltos que necesita el navegador para decidir. */
export interface PlatformHints {
  userAgent: string;
  /** `navigator.platform`. Obsoleto, pero sigue llegando en todos los navegadores. */
  platform?: string;
  /** `navigator.userAgentData.architecture`, solo en Chromium. */
  uaDataArchitecture?: string;
}

/** La arquitectura del visitante. `unknown` cuando no se sabe. */
export function detectArch(hints: PlatformHints): Arch {
  // Hay que mirar solo el UA y `userAgentData`, nunca `navigator.platform`: en
  // los Mac de Apple Silicon esa propiedad sigue diciendo "MacIntel", y
  // mezclarla daba por x64 a un M1.
  const haystack = `${hints.userAgent} ${hints.uaDataArchitecture ?? ''}`.toLowerCase();

  if (/\barm64\b|\baarch64\b|armv8|\barm\b/.test(haystack)) return 'arm64';
  if (/x86_64|x86-64|\bamd64\b|\bwin64\b|\bx64\b/.test(haystack)) return 'x64';
  // Sin pistas de 64 bits, un x86 de 32 bits sigue siendo x64 para lo que
  // importa aquí: los instaladores publicados son de 64 bits y un i686 no
  // puede ejecutarlos igual.
  if (/i[3-6]86|x86/.test(haystack)) return 'x64';
  return 'unknown';
}

/**
 * El sistema operativo del visitante, o `null` si no se reconoce.
 *
 * Android queda fuera a propósito: su user agent dice "Linux", así que sin
 * mirarlo más una visiting con el móvil en Android caería en la tarjeta de
 * Linux y le ofreceríamos un AppImage que no puede instalar. Tampoco se
 * recognise como macOS un iPhone o un iPad, que comparten casi todo el UA con
 * el Mac salvo en el servicio `CPU OS`.
 */
export function detectPlatform(hints: PlatformHints): Platform | null {
  const haystack = `${hints.userAgent} ${hints.platform ?? ''}`.toLowerCase();

  if (/\bandroid\b|\bmobile\b/.test(haystack)) return null;

  // `iphone` y `ipad` son dispositivos móviles de Apple: encajan con la tarjeta
  // de macOS solo por el motor del navegador, no por el sistema. Se miran antes
  // que 'mac' para que ganen.
  if (/\b(iphone|ipad|ipod)\b/.test(haystack)) return null;

  if (haystack.includes('mac') || haystack.includes('darwin')) return 'mac';
  if (haystack.includes('win')) return 'windows';
  if (haystack.includes('linux') || haystack.includes('x11')) return 'linux';
  return null;
}

/** Cómo se llama cada sistema en la web. */
export const PLATFORM_NAMES: Record<Platform, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

/** Cómo se nombra la arquitectura en la web. */
export const ARCH_NAMES: Record<Arch, string> = {
  arm64: 'ARM',
  x64: 'x86_64',
  unknown: '',
};

/** Qué se dice de cada plataforma en la tarjeta, más allá del formato. */
export const PLATFORM_NOTES: Record<Platform, string> = {
  mac: 'Apple Silicon e Intel',
  windows: 'Windows 10 y 11 (64 bits)',
  linux: 'AppImage, deb y rpm',
};
