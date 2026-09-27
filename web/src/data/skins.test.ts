import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { HOOKS, SHARED_KEYS, SKIN_COMPONENT_DOCS } from './skins.ts';

/**
 * La documentación y el parser tienen que decir lo mismo.
 *
 * La razón de ser de esta página es que nadie tenga que descubrir las claves
 * probando. Si el parser acepta una clave que aquí no está, la web miente; si la
 * web anuncia una clave que el parser rechaza, peor: alguien la escribe, no
 * pasa nada y no entiende por qué.
 *
 * La lista de verdad vive en la app, en `xenner/src/skin/keys.ts`. Si al
 * desplegar la web no está a mano (se despliega `web/` solo), la comprobación se
 * salta en vez de romper el build: es una red de seguridad, no un requisito de
 * compilación.
 */
const KEYS_SOURCE = fileURLToPath(
  new URL('../../../xenner/src/skin/keys.ts', import.meta.url),
);

const disponible = existsSync(KEYS_SOURCE);

test('las claves documentadas son las que acepta el parser', { skip: !disponible }, () => {
  const source = readFileSync(KEYS_SOURCE, 'utf-8');

  const shared = /SHARED_KEYS = \[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
  const sharedDelCodigo = [...shared.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();

  assert.deepEqual(
    SHARED_KEYS.map((key) => key.key).sort(),
    sharedDelCodigo,
    'las claves compartidas de la web y del parser no coinciden',
  );

  const porComponente = new Map<string, string[]>();
  for (const match of source.matchAll(/(\w+): \[\.\.\.SHARED_KEYS, ([^\]]*)\]/g)) {
    porComponente.set(
      match[1],
      [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort(),
    );
  }

  // En la web el componente se llama `note.txt` y en el parser `note`.
  assert.deepEqual(
    SKIN_COMPONENT_DOCS.map((doc) => doc.file.replace(/\.txt$/, '')).sort(),
    [...porComponente.keys()].sort(),
    'los componentes documentados y los del parser no coinciden',
  );

  for (const doc of SKIN_COMPONENT_DOCS) {
    const nombre = doc.file.replace(/\.txt$/, '');
    assert.deepEqual(
      doc.keys.map((key) => key.key).sort(),
      porComponente.get(nombre) ?? [],
      `las claves propias de ${doc.file} no coinciden`,
    );
  }
});

test('ninguna clave se documenta sin explicación', () => {
  const todas = [...SHARED_KEYS, ...SKIN_COMPONENT_DOCS.flatMap((doc) => doc.keys)];
  for (const key of todas) {
    assert.ok(key.sees.length > 20, `${key.key} no explica qué se ve`);
    assert.ok(key.example.length > 0, `${key.key} no tiene ejemplo`);
  }
});

test('las claves repetidas en un mismo archivo no existen', () => {
  for (const doc of SKIN_COMPONENT_DOCS) {
    const propias = doc.keys.map((key) => key.key);
    const repetidas = propias.filter((key, index) => propias.indexOf(key) !== index);
    assert.deepEqual(repetidas, [], `${doc.file} repite una clave en su propia lista`);

    // Una clave propia no puede ser una compartida: el parser no distingue
    // entre las dos y documentarlo dos veces sería confuso.
    const compartidas = SHARED_KEYS.map((key) => key.key);
    const solapadas = propias.filter((key) => compartidas.includes(key));
    assert.deepEqual(solapadas, [], `${doc.file} lista como propia una clave compartida`);
  }
});

test('todos los ganchos tienen nombre y descripción', () => {
  const ids = HOOKS.map((hook) => hook.hook);
  const repetidos = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(repetidos, [], 'un data-x aparece dos veces en la tabla');
  for (const hook of HOOKS) {
    assert.match(hook.hook, /^[a-z][a-z-]*$/, `${hook.hook} no parece un data-x`);
    assert.ok(hook.sees.length > 20, `${hook.hook} no explica qué es`);
  }
});
