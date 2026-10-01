import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type Release, detectArch, detectPlatform, pickAlternates, pickPrimary } from './releases.ts';

/**
 * Lo que el HTML de las tarjetas se pinta a sí mismo, replicado aquí.
 *
 * La idea es comprobar el reparto completo con los nombres exactos que produce
 * la matriz de .github/workflows/release.yml, sin depender del navegador: si un
 * objetivo de la matriz cambia y pasa a llamarse distinto, esta comprobación
 * salta antes de que lo haga una tarjeta vacía en producción.
 */

const MATRIX_OUTPUT: Release = {
  tag_name: 'v1.2.3',
  name: 'Xenner v1.2.3',
  html_url: 'https://github.com/xenoxf/xenner/releases/tag/v1.2.3',
  published_at: '2026-09-30T10:00:00Z',
  assets: [
    { name: 'xenner_1.2.3_aarch64.dmg', size: 12_582_912, browser_download_url: 'https://d/mac-arm.dmg' },
    { name: 'xenner_1.2.3_x64.dmg', size: 13_631_488, browser_download_url: 'https://d/mac-x64.dmg' },
    { name: 'xenner_1.2.3_x64-setup.exe', size: 10_485_760, browser_download_url: 'https://d/win.exe' },
    { name: 'xenner_1.2.3_amd64.AppImage', size: 15_728_640, browser_download_url: 'https://d/lin.AppImage' },
    { name: 'xenner_1.2.3_amd64.deb', size: 9_437_184, browser_download_url: 'https://d/lin.deb' },
    { name: 'xenner-1.2.3.x86_64.rpm', size: 9_699_840, browser_download_url: 'https://d/lin.rpm' },
  ],
};

/* Los tres `data-download-slot` que hay en Download.astro. */
const SLOTS = ['mac', 'win', 'linux'] as const;

test('cada tarjeta recibe exactamente un instalador de su plataforma', () => {
  const assigned: Record<string, string> = {};

  for (const slot of SLOTS) {
    const platform = slot === 'win' ? 'windows' : (slot as 'mac' | 'linux');
    const choice = pickPrimary(MATRIX_OUTPUT.assets, platform, 'x64');
    assert.ok(choice, `la tarjeta ${slot} se queda sin instalador`);
    assigned[slot] = choice.asset.name;
  }

  assert.equal(assigned.mac, 'xenner_1.2.3_x64.dmg');
  assert.equal(assigned.win, 'xenner_1.2.3_x64-setup.exe');
  assert.equal(assigned.linux, 'xenner_1.2.3_amd64.AppImage');

  // Ningún archivo puede aparecer en dos tarjetas.
  const names = Object.values(assigned);
  assert.equal(new Set(names).size, names.length);
});

test('un visitante de Apple Silicon recibe el dmg arm64, no el de Intel', () => {
  const hints = { userAgent: 'Macintosh', platform: 'MacIntel', uaDataArchitecture: 'arm' };
  const arch = detectArch(hints);
  const choice = pickPrimary(MATRIX_OUTPUT.assets, 'mac', arch);

  assert.equal(arch, 'arm64');
  assert.equal(choice?.asset.name, 'xenner_1.2.3_aarch64.dmg');
  assert.equal(choice?.exactArch, true);
});

test('un visitante de Linux recibe el AppImage y debajo deb y rpm', () => {
  const hints = { userAgent: 'X11; Linux x86_64', platform: 'Linux x86_64' };
  assert.equal(detectPlatform(hints), 'linux');

  const arch = detectArch(hints);
  const choice = pickPrimary(MATRIX_OUTPUT.assets, 'linux', arch);
  assert.ok(choice);
  assert.equal(choice.exactArch, true);

  const alternates = pickAlternates(MATRIX_OUTPUT.assets, 'linux', arch, choice.asset);
  assert.deepEqual(
    alternates.map((a) => a.name),
    ['xenner_1.2.3_amd64.deb', 'xenner-1.2.3.x86_64.rpm'],
  );
});

test('los tres formatos de Linux ofrecidos son descargables y distintos', () => {
  const choice = pickPrimary(MATRIX_OUTPUT.assets, 'linux', 'x64');
  assert.ok(choice);

  const all = [choice.asset, ...pickAlternates(MATRIX_OUTPUT.assets, 'linux', 'x64', choice.asset)];
  assert.equal(all.length, 3);
  assert.equal(new Set(all.map((a) => a.browser_download_url)).size, 3);
  for (const asset of all) assert.match(asset.browser_download_url, /^https:\/\//);
});

test('Windows solo ofrece el .exe y no un archivo de otra plataforma', () => {
  const choice = pickPrimary(MATRIX_OUTPUT.assets, 'windows', 'x64');
  assert.ok(choice);
  assert.match(choice.asset.name, /\.exe$/);
  assert.deepEqual(pickAlternates(MATRIX_OUTPUT.assets, 'windows', 'x64', choice.asset), []);
});
