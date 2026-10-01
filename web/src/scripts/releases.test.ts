import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type Arch,
  type Platform,
  type ReleaseAsset,
  detectArch,
  detectPlatform,
  formatLabel,
  formatSize,
  isUsableRelease,
  normalizeVersion,
  pickAlternates,
  pickPrimary,
} from './releases.ts';

/**
 * Los nombres exactos que deja `tauri build` para los cuatro objetivos de
 * .github/workflows/release.yml. Si algún día el action o Tauri cambian el
 * formato, la tarjeta se vacía y falla este archivo antes que la web.
 */
const CI_ASSETS: ReleaseAsset[] = [
  { name: 'xenner_1.2.3_aarch64.dmg', size: 12_582_912, browser_download_url: 'https://d/mac-arm.dmg' },
  { name: 'xenner_1.2.3_x64.dmg', size: 13_631_488, browser_download_url: 'https://d/mac-x64.dmg' },
  { name: 'xenner_1.2.3_x64-setup.exe', size: 10_485_760, browser_download_url: 'https://d/win.exe' },
  { name: 'xenner_1.2.3_amd64.AppImage', size: 15_728_640, browser_download_url: 'https://d/lin.AppImage' },
  { name: 'xenner_1.2.3_amd64.deb', size: 9_437_184, browser_download_url: 'https://d/lin.deb' },
  { name: 'xenner-1.2.3.x86_64.rpm', size: 9_699_840, browser_download_url: 'https://d/lin.rpm' },
];

const url = (name: string): string => `https://d/${name}`;

function primaryName(assets: ReleaseAsset[], platform: Platform, arch: Arch): string | null {
  return pickPrimary(assets, platform, arch)?.asset.name ?? null;
}

/* ------------------------------------------------------------------ extensión */

test('formatLabel escribe cada formato como lo ve el visitante', () => {
  assert.equal(formatLabel('xenner_1.2.3_aarch64.dmg'), 'DMG');
  assert.equal(formatLabel('xenner_1.2.3_amd64.AppImage'), 'AppImage');
  assert.equal(formatLabel('xenner_1.2.3_amd64.deb'), 'deb');
  assert.equal(formatLabel('xenner-1.2.3.x86_64.rpm'), 'RPM');
  assert.equal(formatLabel('xenner_1.2.3_x64-setup.exe'), 'EXE');
  assert.equal(formatLabel('xenner_1.2.3_x64.msi'), 'MSI');
  // Un nombre sin punto no tiene formato conocido: la etiqueta sale vacía, para
  // que quien la pinte decida qué hacer en vez de pintar un «Descargar» vacío.
  assert.equal(formatLabel('sin_extension'), '');
  assert.equal(formatLabel('xenner_1.2.3.tar.gz'), 'gz');
});

test('formatSize redondea según el tamaño', () => {
  assert.equal(formatSize(0), '');
  assert.equal(formatSize(undefined), '');
  assert.equal(formatSize(12_582_912), '12 MB');
  assert.equal(formatSize(9_437_184), '9.0 MB');
});

test('normalizeVersion quita la v delante si está', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('V1.2.3'), '1.2.3');
  assert.equal(normalizeVersion(null), '');
});

/* ------------------------------------------------------- plataforma por ext */

test('la plataforma se decide por extensión, no por el nombre', () => {
  // Ninguno de estos nombres contiene macos, windows ni linux: si se buscara la
  // plataforma en el nombre, las tres tarjetas saldrían vacías.
  assert.equal(primaryName(CI_ASSETS, 'mac', 'arm64'), 'xenner_1.2.3_aarch64.dmg');
  assert.equal(primaryName(CI_ASSETS, 'windows', 'x64'), 'xenner_1.2.3_x64-setup.exe');
  assert.equal(primaryName(CI_ASSETS, 'linux', 'x64'), 'xenner_1.2.3_amd64.AppImage');
});

test('dentro de una plataforma se respeta la arquitectura', () => {
  assert.equal(primaryName(CI_ASSETS, 'mac', 'arm64'), 'xenner_1.2.3_aarch64.dmg');
  assert.equal(primaryName(CI_ASSETS, 'mac', 'x64'), 'xenner_1.2.3_x64.dmg');
  assert.equal(primaryName(CI_ASSETS, 'linux', 'x64'), 'xenner_1.2.3_amd64.AppImage');
});

test('un .rpm con nomenclatura de RPM se reconoce como x64', () => {
  // El .rpm no lleva amd64 sino x86_64, que es el convenio de RPM.
  const rpm = CI_ASSETS.find((a) => a.name.endsWith('.rpm'))!;
  const choice = pickPrimary([rpm], 'linux', 'x64');
  assert.equal(choice?.asset.name, rpm.name);
  assert.equal(choice?.exactArch, true);
});

test('sin binario para la plataforma devuelve null y no inventa nada', () => {
  const soloMac: ReleaseAsset[] = [{ name: 'xenner_1.2.3_aarch64.dmg', size: 1, browser_download_url: url('a.dmg') }];
  assert.equal(pickPrimary(soloMac, 'windows', 'x64'), null);
  assert.equal(pickPrimary(soloMac, 'linux', 'x64'), null);
  assert.equal(pickPrimary([], 'mac', 'arm64'), null);
});

test('si no hay binario para la arquitectura se ofrece el que hay, marcado', () => {
  const soloIntel: ReleaseAsset[] = [{ name: 'xenner_1.2.3_x64.dmg', size: 1, browser_download_url: url('m.dmg') }];
  const choice = pickPrimary(soloIntel, 'mac', 'arm64');
  assert.equal(choice?.asset.name, 'xenner_1.2.3_x64.dmg');
  assert.equal(choice?.exactArch, false);
});

test('con la arquitectura desconocida se toma el primero sin quejarse', () => {
  const choice = pickPrimary(CI_ASSETS, 'mac', 'unknown');
  assert.equal(choice?.asset.name, 'xenner_1.2.3_aarch64.dmg');
  assert.equal(choice?.exactArch, false);
});

test('el .zip sustituye al .dmg cuando la release solo trae .zip', () => {
  const soloZip: ReleaseAsset[] = [{ name: 'xenner_1.2.3_aarch64.zip', size: 1, browser_download_url: url('m.zip') }];
  const choice = pickPrimary(soloZip, 'mac', 'arm64');
  assert.equal(choice?.asset.name, 'xenner_1.2.3_aarch64.zip');
  assert.equal(choice?.exactArch, true);
});

test('un .tar.gz de mac no se cuela como descarga para Linux', () => {
  // .tar.gz no es un formato de instalación y no está en ninguna lista.
  const conTar: ReleaseAsset[] = [...CI_ASSETS, { name: 'xenner_1.2.3_aarch64.app.tar.gz', size: 1, browser_download_url: url('m.tar.gz') }];
  assert.equal(primaryName(conTar, 'linux', 'x64'), 'xenner_1.2.3_amd64.AppImage');
});

/* -------------------------------------------------------------- alternativas */

test('los formatos alternativos van uno por formato y sin repetir el principal', () => {
  const primary = pickPrimary(CI_ASSETS, 'linux', 'x64')!.asset;
  const alternates = pickAlternates(CI_ASSETS, 'linux', 'x64', primary);
  assert.deepEqual(
    alternates.map((a) => formatLabel(a.name)),
    ['deb', 'RPM'],
  );
});

test('macOS no repite el .dmg de la otra arquitectura como alternativa', () => {
  const primary = pickPrimary(CI_ASSETS, 'mac', 'arm64')!.asset;
  const alternates = pickAlternates(CI_ASSETS, 'mac', 'arm64', primary);
  assert.deepEqual(alternates, []);
});

test('Windows no ofrece alternativas cuando solo hay .exe', () => {
  const primary = pickPrimary(CI_ASSETS, 'windows', 'x64')!.asset;
  assert.deepEqual(pickAlternates(CI_ASSETS, 'windows', 'x64', primary), []);
});

test('sin principal, las alternativas son todos los formatos disponibles', () => {
  // Sin descarga principal ya repartida, `pickAlternates` devuelve el primer
  // archivo de cada formato. El que se acabó pintando como principal se le
  // pasa en la llamada, para que no se repita en la lista de alternativas.
  const alternates = pickAlternates(CI_ASSETS, 'windows', 'x64', null);
  assert.deepEqual(alternates.map((a) => a.name), ['xenner_1.2.3_x64-setup.exe']);
});

/* ------------------------------------------------------------- detección SO */

const MAC_ARM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const WIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const LINUX_X64_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

test('detectPlatform reconoce los tres sistemas', () => {
  assert.equal(detectPlatform({ userAgent: MAC_ARM_UA, platform: 'MacIntel' }), 'mac');
  assert.equal(detectPlatform({ userAgent: WIN_UA, platform: 'Win32' }), 'windows');
  assert.equal(detectPlatform({ userAgent: LINUX_X64_UA, platform: 'Linux x86_64' }), 'linux');
});

test('detectPlatform devuelve null en lo que no se reconoce', () => {
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (PlayStation 5)', platform: '' }), null);
});

test('detectPlatform deja fuera a Android, iPhone e iPad', () => {
  // El UA de Android contiene "Linux": sin esta regla, quien visita desde el
  // móvil vería la tarjeta de Linux con un AppImage que no puede instalar.
  const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  assert.equal(detectPlatform({ userAgent: ANDROID_UA, platform: 'Linux armv8l' }), null);

  // iPhone e iPad comparten casi todo el UA con el Mac; sin distinguirlos
  // aparecerían en la tarjeta de macOS.
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
  const IPAD_UA =
    'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
  assert.equal(detectPlatform({ userAgent: IPHONE_UA, platform: 'iPhone' }), null);
  assert.equal(detectPlatform({ userAgent: IPAD_UA, platform: 'iPad' }), null);
});

test('detectPlatform sigue reconociendo un Mac de verdad', () => {
  assert.equal(detectPlatform({ userAgent: MAC_ARM_UA, platform: 'MacIntel' }), 'mac');
});

test('detectArch distingue Apple Silicon, Intel y Linux de 64 bits', () => {
  // El Mac de Apple Silicon se anuncia como MacIntel en navigator.platform, así
  // que la arquitectura se lee de userAgentData y, sin eso, se renuncia a
  // inventarla. Mezclar navigator.platform hacía que un M1 saliera x64.
  assert.equal(detectArch({ userAgent: MAC_ARM_UA, platform: 'MacIntel' }), 'unknown');
  assert.equal(detectArch({ userAgent: MAC_ARM_UA, platform: 'MacIntel', uaDataArchitecture: 'arm' }), 'arm64');
  assert.equal(detectArch({ userAgent: WIN_UA, platform: 'Win32' }), 'x64');
  assert.equal(detectArch({ userAgent: LINUX_X64_UA, platform: 'Linux x86_64' }), 'x64');
  assert.equal(detectArch({ userAgent: 'Mozilla/5.0 (Linux armv8l)', platform: '' }), 'arm64');
});

test('detectArch reconoce un Windows en ARM sin userAgentData', () => {
  const WIN_ARM_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; ARM64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
  assert.equal(detectArch({ userAgent: WIN_ARM_UA, platform: 'Win32' }), 'arm64');
});

test('detectArch no se inventa una arquitectura', () => {
  assert.equal(detectArch({ userAgent: 'Mozilla/5.0', platform: '' }), 'unknown');
});

/* ------------------------------------------------------------------ release */

test('isUsableRelease acepta una release y rechaza basura', () => {
  const good = { tag_name: 'v1.2.3', name: null, html_url: 'u', published_at: null, assets: [] };
  assert.equal(isUsableRelease(good), true);
  // El 404 de la API viene con un mensaje, no con una release.
  assert.equal(isUsableRelease({ message: 'Not Found' }), false);
  assert.equal(isUsableRelease(null), false);
  assert.equal(isUsableRelease(undefined), false);
  assert.equal(isUsableRelease({ tag_name: 'v1', assets: 'nope' }), false);
});

test('una release sin assets es válida pero no ofrece nada que descargar', () => {
  const vacia = { tag_name: 'v1.2.3', name: null, html_url: 'u', published_at: null, assets: [] };
  assert.equal(isUsableRelease(vacia), true);
  assert.equal(pickPrimary(vacia.assets, 'mac', 'arm64'), null);
});
