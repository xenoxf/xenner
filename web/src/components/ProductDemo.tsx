import { useMemo, useState } from 'react';
import './ProductDemo.css';

type SkinId = 'webcore' | 'frosted';

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
  webcore: {
    id: 'webcore',
    name: 'WebCore',
    file: 'background.txt',
    code: `# interfaz principal\nbackground="#111018"\nblur="0px"\ntext="#fff8dc"\naccent="#d9ff39"`,
  },
  frosted: {
    id: 'frosted',
    name: 'Frosted Glass',
    file: 'background.txt',
    code: `# escritorio semitransparente\nbackground="rgba(28,34,44,0.34)"\nblur="32px"\ntext="#f4f7fb"\naccent="#b7cee1"`,
  },
};

const INITIAL_NOTES: Note[] = [
  {
    id: 1,
    title: 'UNA PIEL ES UN ARCHIVO',
    preview: 'Toolbar, fondo, botones…',
    body: [
      'Cada superficie de xenner tiene su propio archivo. Fondo, toolbar, sidebar, botones y campos no se esconden detrás de un constructor.',
      'Abre un TXT, cambia una clave y deja que la ventana se rehaga a tu ritmo.',
    ],
    date: '24.09.2026 / 09:41',
  },
  {
    id: 2,
    title: 'CYBER MEMORY / 98',
    preview: 'La idea sobrevive al reload.',
    body: [
      'Las skins se recargan sin mezclar su experimento con el contenido de tus notas.',
      'El archivo se lee como configuración y vuelve como interfaz.',
    ],
    date: '23.09.2026 / 18:12',
  },
  {
    id: 3,
    title: 'PARA DESPUÉS',
    preview: 'Notas, tareas, grandes ideas sueltas.',
    body: [
      'Crear, editar, seleccionar y borrar. La app actual guarda el contenido en localStorage, dentro de tu escritorio.',
      'Nada de cuentas, nube obligatoria ni un roadmap disfrazado de producto.',
    ],
    date: '21.09.2026 / 07:30',
  },
];

export default function ProductDemo() {
  const [skinId, setSkinId] = useState<SkinId>('webcore');
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [selectedId, setSelectedId] = useState<number>(INITIAL_NOTES[0].id);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? notes[0],
    [notes, selectedId],
  );
  const activeSkin = SKINS[skinId];
  const wordCount = activeNote.body.join(' ').split(/\s+/).filter(Boolean).length;

  const addNote = () => {
    const id = Math.max(...notes.map((note) => note.id), 0) + 1;
    const note: Note = {
      id,
      title: 'NOTA NUEVA_001',
      preview: 'Escribe aquí antes de que huya…',
      body: ['Una página en blanco para la siguiente idea.'],
      date: 'AHORA / MEMORY RAM',
    };

    setNotes((current) => [note, ...current]);
    setSelectedId(id);
  };

  return (
    <div className="product-demo" data-skin={skinId}>
      <div className="demo-stage">
        <div className="demo-stage__sun" aria-hidden="true"></div>
        <div className="demo-stage__stars" aria-hidden="true"></div>
        <div className="demo-stage__grid" aria-hidden="true"></div>

        <div className="demo-window">
          <header className="demo-toolbar">
            <div className="demo-window__controls" aria-hidden="true">
              <i></i><i></i><i></i>
            </div>

            <div className="demo-toolbar__identity">
              <strong>xenner.exe</strong>
              <span>— {activeNote.title.toLowerCase()}</span>
            </div>

            <div className="demo-toolbar__status">
              <span aria-hidden="true"></span> LOCAL_SAVE
            </div>
          </header>

          <div className="demo-menu" aria-hidden="true">
            <span>archivo</span><span>edición</span><span>ver</span><span>skin</span>
          </div>

          <div className="demo-layout">
            <aside className="demo-sidebar" aria-label="Notas de ejemplo">
              <div className="demo-sidebar__heading">
                <span>▰ NOTAS</span>
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
                      <span className="demo-note-item__icon" aria-hidden="true"></span>
                      <span className="demo-note-item__copy">
                        <strong>{note.title}</strong>
                        <span>{note.preview}</span>
                        <time>{note.date}</time>
                      </span>
                    </button>
                  );
                })}
              </div>

              <button className="demo-add" type="button" onClick={addNote}>
                <b aria-hidden="true">+</b> CREAR NOTA
              </button>
            </aside>

            <article className="demo-editor" aria-live="polite">
              <div className="demo-editor__meta">
                <span>{activeNote.date}</span>
                <span>TEXT MODE / UTF-8</span>
              </div>
              <h3>{activeNote.title}</h3>
              <div className="demo-editor__body">
                {activeNote.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="demo-editor__footer">
                <span>SKIN: {activeSkin.name}</span>
                <span>{wordCount} WORDS</span>
              </div>
            </article>
          </div>

          <footer className="demo-statusbar">
            <span><i aria-hidden="true"></i> READY</span>
            <span>TXT ENGINE</span>
            <span>{notes.length} FILES</span>
            <span>XENNER 0.1</span>
          </footer>
        </div>

        <div className="skin-switcher" role="group" aria-label="Vista previa de skins">
          <span>PALETA:</span>
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
          <span><i aria-hidden="true"></i> {activeSkin.file}</span>
          <span>live_text.exe</span>
        </div>
        <pre><code>{activeSkin.code}</code></pre>
      </div>
    </div>
  );
}
