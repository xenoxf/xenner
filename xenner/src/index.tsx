/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import "./skin/skin.css";
import { loadSkin } from "./skin/loader";

void loadSkin();

render(() => <App />, document.getElementById("root") as HTMLElement);
