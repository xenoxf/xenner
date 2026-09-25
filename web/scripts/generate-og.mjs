import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('../public/', import.meta.url);
const source = fileURLToPath(new URL('og-xenner.svg', root));
const destination = fileURLToPath(new URL('og-xenner.png', root));
const svg = await readFile(source, 'utf8');
const renderer = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
});

await writeFile(destination, renderer.render().asPng());
console.log('Generated public/og-xenner.png (1200×630)');
