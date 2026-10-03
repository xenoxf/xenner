/* @refresh reload */
import { render } from "solid-js/web";
import "katex/dist/katex.min.css";
import "./styles/global.css";
// La vista de nodo de la imagen es DOM plano, no Solid, así que su hoja no puede
// ser un módulo CSS: es global. Ver el comentario de la propia hoja.
import "./styles/editor-image.css";

import App from "./app/App";

render(() => <App />, document.getElementById("root") as HTMLElement);
