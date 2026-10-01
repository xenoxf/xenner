import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPONENT_KEYS,
  explainIgnoredLine,
  ignoredSkinLines,
  parseSkinComponent,
  parseSkinConfig,
  parseSkinManifest,
  parseSkinTxt,
  stringifySkinComponent,
} from "./parse.ts";

/** Los seis archivos de componente, en el mismo orden que el panel. */
const COMPONENTES = ["background", "button", "note", "sidebar", "input", "toolbar"] as const;

test("acepta comentarios, comillas opcionales y la última definición", () => {
  const parsed = parseSkinTxt(
    ['# comentario', 'accent="#111"', 'accent = #222', "text='blanco'"].join("\n"),
  );

  assert.deepEqual(parsed, { accent: "#222", text: "blanco" });
});

test("ignora claves desconocidas por componente", () => {
  const parsed = parseSkinComponent(
    "note",
    ["accent=#fff", "itemActive=red", "textDim=grey"].join("\n"),
  );

  assert.deepEqual(parsed, { accent: "#fff" });
});

test("rechaza valores que pueden romper CSS o cargar recursos", () => {
  const parsed = parseSkinComponent(
    "background",
    [
      "background=red; color: blue",
      "overlay=url(https://example.test/pixel.png)",
      "shadow=expression(alert(1))",
      "text=@import 'remote.css'",
      "accent=javascript:alert(1)",
      "radius=data:text/html,bad",
      "blur=ok",
    ].join("\n"),
  );

  assert.deepEqual(parsed, { blur: "ok" });
});

test("admite imágenes, SVG y datos incrustados", () => {
  // Antes estos cuatro se rechazaban. El bloqueo era una decisión heredada del
  // "un valor = un color", no una necesidad: un `data:` de imagen en un hueco CSS
  // se decodifica como píxeles, sin documento ni script.
  const parsed = parseSkinComponent(
    "background",
    [
      'background="url(assets/fondo.png)"',
      'overlay="url(assets/iconos/hoja.svg)"',
      'text="url(data:image/png;base64,iVBORw0KGgo=)"',
      'border="url(assets/borde.png) 8 24 8 24 / 8px round"',
      'shadow="0 0 20px url(assets/luz.png)"',
    ].join("\n"),
  );

  assert.deepEqual(parsed, {
    background: "url(assets/fondo.png)",
    overlay: "url(assets/iconos/hoja.svg)",
    text: "url(data:image/png;base64,iVBORw0KGgo=)",
    border: "url(assets/borde.png) 8 24 8 24 / 8px round",
    shadow: "0 0 20px url(assets/luz.png)",
  });
});

test("no deja que un url() escape de la carpeta de la skin", () => {
  const parsed = parseSkinComponent(
    "background",
    [
      'background="url(/etc/passwd)"',
      'overlay="url(//evil.test/x.png)"',
      'text="url(../../fuera.png)"',
      'border="url(C:\\\\Windows\\\\win.ini)"',
      'radius="url(data:text/html,<script>)"',
      'blur="ok"',
    ].join("\n"),
  );

  assert.deepEqual(parsed, { blur: "ok" });
});

test("el ; de un data: no rompe el valor", () => {
  // `data:image/png;base64,` lleva un punto y coma legítimo. Rechazarlo sin
  // mirar dónde estaba fue un bug real: ninguna imagen incrustada pasaba.
  const parsed = parseSkinComponent("note", 'background="url(data:image/svg+xml,%3Csvg%3E)"');
  assert.deepEqual(parsed, { background: "url(data:image/svg+xml,%3Csvg%3E)" });
});

test("limita la longitud de valores", () => {
  const parsed = parseSkinComponent("background", `text=${"a".repeat(1025)}`);
  assert.deepEqual(parsed, {});
});

test("usa allowlists separadas para manifiesto y config", () => {
  assert.deepEqual(parseSkinManifest('name="X"\naccent="red"'), { name: "X" });
  assert.deepEqual(parseSkinConfig('skinPath="webcore"\nname="X"'), {
    skinPath: "webcore",
  });
});

test("no se rompe con valores que llevan letras acentuadas", () => {
  // El recorrido del `;` salta de golpe dentro y fuera de un `url(...)`, así que
  // un valor con `á` o con un emoji lo recorría a medias. En el backend esto era
  // un `panic` de verdad; aquí partía el texto en unidades sueltas.
  assert.deepEqual(parseSkinComponent("note", 'font="Mañana, serif"'), {
    font: "Mañana, serif",
  });
  assert.deepEqual(parseSkinComponent("note", 'font="日本語, serif"'), {
    font: "日本語, serif",
  });
  assert.deepEqual(parseSkinComponent("note", 'font="🌙, serif"'), {
    font: "🌙, serif",
  });
  assert.deepEqual(parseSkinComponent("note", 'background="url(assets/ñ.png)"'), {
    background: "url(assets/ñ.png)",
  });
  // Y lo prohibido sigue prohibido con una tilde en medio.
  assert.deepEqual(parseSkinComponent("note", 'text="más; rojo"'), {});
});

test("señala las líneas que no van a aplicarse, y solo esas", () => {
  const texto = [
    "# un comentario",
    "",
    'text="#fff"',
    'overlay="none"',
    'font="Comic; negra"',
    "sin_igual_signo",
    'text="#000"',
  ].join("\n");

  const lineas = ignoredSkinLines("note", texto);
  assert.deepEqual(
    lineas.map((linea) => [linea.line, linea.why]),
    [
      [4, "clave-ajena"],
      [5, "valor-invalido"],
      [6, "sin-igual"],
    ],
    "ni el comentario, ni la línea vacía, ni las dos buenas",
  );
  assert.equal(lineas[0].key, "overlay");
  assert.match(explainIgnoredLine(lineas[0]), /línea 4/);
  assert.match(explainIgnoredLine(lineas[0]), /«overlay»/);
});

test("no señala una línea que sí va a funcionar", () => {
  // Si esto se equivoca, alguien deja de usar la función y se queda sin aviso,
  // que es justo lo que pasa si el aviso y el comportamiento se desincronizan.
  // Se le da a cada componente exactamente las claves suyas, con valores de
  // todas las formas: color, `url()`, sombra, tipografía y borde.
  const VALORES: Record<string, string> = {
    background: "url(assets/fondo.svg)",
    text: "#fff",
    radius: "8px",
    blur: "4px",
    shadow: "0 4px 12px rgba(0,0,0,0.3)",
    accent: "#5b9bd5",
    font: 'Georgia, "Noto Serif", serif',
    border: "1px solid #333",
    textDim: "#999",
    overlay: "radial-gradient(circle, #fff0, transparent)",
    backgroundHover: "#2a2a2a",
    textHover: "#fff",
    borderHover: "1px solid #5b9bd5",
    placeholder: "#888",
    focus: "#5b9bd5",
    itemHover: "#222",
    itemActive: "#333",
  };

  for (const componente of COMPONENTES) {
    const lineas = COMPONENT_KEYS[componente].map((clave) => `${clave}="${VALORES[clave]}"`);
    assert.deepEqual(
      ignoredSkinLines(componente, lineas.join("\n")),
      [],
      `${componente} señaló claves suyas como si fueran ajenas`,
    );
  }
});

test("señala como ajena una clave que es de otro archivo", () => {
  // `placeholder` vale en `input.txt` y en ningún otro. Quien copia una línea de
  // un archivo a otro tiene que enterarse, no creer que funciona.
  const lineas = ignoredSkinLines("note", 'text="#fff"\nplaceholder="#888"');
  assert.deepEqual(lineas, [{ line: 2, key: "placeholder", why: "clave-ajena" }]);
  assert.deepEqual(ignoredSkinLines("input", 'placeholder="#888"'), []);
  assert.deepEqual(ignoredSkinLines("note", 'backgroundHover="#2a2a2a"'), [], "esta sí es de note");
});

test("vuelve a escribir un componente en el mismo formato que el disco", () => {
  // El orden es el de las claves, que es el mismo en que las enseña el panel: un
  // archivo con las claves agrupadas como en la interfaz se lee mejor que uno
  // alfabético, y quien compara el panel con el archivo los reconoce igual.
  assert.equal(
    stringifySkinComponent({ text: "#fff", background: "#000" }),
    'text="#fff"\nbackground="#000"',
  );
  assert.equal(stringifySkinComponent({}), "");

  // Y lo que escribe vuelve a leerse igual: el ciclo de ida y vuelta no pierde
  // nada, que es lo que hace que «ver el archivo» y «mover los campos» puedan ser
  // la misma cosa.
  const escrito = stringifySkinComponent({ text: "#fff", radius: "4px" });
  assert.deepEqual(parseSkinComponent("note", escrito), { text: "#fff", radius: "4px" });
});
