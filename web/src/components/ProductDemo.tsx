import { useMemo, useState } from 'react';
import './ProductDemo.css';

type SkinId = 'frosted' | 'webcore';

type Note = {
  id: number;
  title: string;
  preview: string;
  body: string[];
  date: string;
};

type Skin = {
  id: SkinId;
  name: string;
  file: string;
  code: string;
};

const SKINS: Record<SkinId, Skin> = {
  frosted: {
    id: 'frosted',
    name: 'Frosted Glass',
    file: 'background.txt',
    code: `# Fondo\nbackground="rgba(28,34,44,0.34)"\nblur="32px"\ntext="#f4f7fb"\naccent="#b7cee1"`,
  },
  webcore: {
    id: 'webcore',
    name: 'WebCore',
    file: 'background.txt',
    code: `# Fondo\nbackground="#14161c"\nblur="0px"\ntext="#e8eaf0"\naccent="#4ade80"`,
  },
};

const INITIAL_NOTES: Note[] = [
  {
    id: 1,
    title: 'La idea no necesita ruido',
    preview: 'Una interfaz puede ser decoración…',
    body: [
      'Una herramienta no debería competir con las ideas que ayudas a ordenar.',
      'Por eso xenner empieza por lo esencial: escribir, guardar y volver.',
      'La identidad visual vive en archivos simples. Tú decides cómo se siente tu espacio.',
    ],
    date: 'Hoy · 09:41',
  },
  {
    id: 2,
    title: 'Personalización sin ceremonia',
    preview: 'Un TXT, una clave, un valor.',
    body: [
      'La skin más compleja sigue siendo texto legible.',
      'Sin credenciales, sin constructor de temas y sin capas que oculten lo que ocurre.',
    ],
    date: 'Ayer · 18:12',
  },
  {
    id: 3,
    title: 'Ideas para después',
    preview: 'Revisar el prototipo del panel…',
    body: [
      'Convertir esta lista en tareas sencillas.',
      'Probar la nueva jerarquía en una pantalla estrecha.',
    ],
    date: 'Lun · 07:30',
  },
];

export default function ProductDemo() {
  const [skinId, setSkinId] = useState<SkinId>('frosted');
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [selectedId, setSelectedId] = useState<number>(INITIAL_NOTES[0].id);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? notes[0],
    [notes, selectedId],
  );
  const activeSkin = SKINS[skinId];

  const addNote = () => {
    const id = Math.max(...notes.map((note) => note.id), 0) + 1;
    const note: Note = {
      id,
      title: 'Nota sin título',
      preview: 'Empieza a escribir…',
      body: ['Una página limpia para la siguiente idea.'],
      date: 'Ahora',
    };

    setNotes((current) => [note, ...current]);
    setSelectedId(id);
  };

  return (
    <div className="product-demo" data-skin={skinId}>
      <div className="demo-stage">
        <div className="demo-stage__glow demo-stage__glow--one" aria-hidden="true"></div>
        <div className="demo-stage__glow demo-stage__glow--two" aria-hidden="true"></div>

        <div className="demo-window">
          <header className="demo-toolbar">
            <div className="demo-toolbar__identity">
              <span className="demo-toolbar__mark">×</span>
              <span>xenner</span>
            </div>

            <div className="demo-toolbar__status" aria-label="Estado de la nota">
              <span></span> Guardado
            </div>

            <button className="demo-add" type="button" onClick={addNote}>
              <span aria-hidden="true">+</span> Nueva
            </button>
          </header>

          <div className="demo-layout">
            <aside className="demo-sidebar" aria-label="Notas de ejemplo">
              <div className="demo-sidebar__heading">
                <span>Notas</span>
                <span>{String(notes.length).padStart(2, '0')}</span>
              </div>

              <div className="demo-note-list">
                {notes.map((note) => {
                  const isActive = note.id === selectedId;

                  return (
                    <button
                      className="demo-note-item"
                      data-active={isActive}
                      type="button"
                      key={note.id}
                      onClick={() => setSelectedId(note.id)}
                      aria-pressed={isActive}
                    >
                      <strong>{note.title}</strong>
                      <span>{note.preview}</span>
                      <time>{note.date}</time>
                    </button>
                  );
                })}
              </div>
            </aside>

            <article className="demo-editor" aria-live="polite">
              <div className="demo-editor__meta">
                <span>{activeNote.date}</span>
                <span>{notes.length} notas</span>
              </div>
              <h2>{activeNote.title}</h2>
              <div className="demo-editor__body">
                {activeNote.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="demo-editor__footer">
                <span>Skin · {activeSkin.name}</span>
                <span>0 palabras</span>
              </div>
            </article>
          </div>

          <footer className="demo-statusbar">
            <span>Local</span>
            <span>TXT skin</span>
            <span>0.1</span>
          </footer>
        </div>

        <div className="skin-switcher" role="group" aria-label="Vista previa de skins">
          {(Object.keys(SKINS) as SkinId[]).map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => setSkinId(id)}
              aria-pressed={skinId === id}
              data-skin-option={id}
            >
              <span aria-hidden="true"></span>
              {SKINS[id].name}
            </button>
          ))}
        </div>
      </div>

      <div className="demo-console">
        <div className="demo-console__bar">
          <span>{activeSkin.file}</span>
          <span>sin build</span>
        </div>
        <pre><code>{activeSkin.code}</code></pre>
      </div>
    </div>
  );
}
