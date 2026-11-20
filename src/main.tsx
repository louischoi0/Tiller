import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/source-code-pro";
import App from "./App";

const render = () =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

// A terminal measures its character cell when it opens, so the bundled font has to be
// loaded before anything renders; if loading fails the fallback fonts are used.
Promise.all(["400", "600", "700"].map((w) => document.fonts.load(`${w} 14px "Source Code Pro Variable"`)))
  .catch(() => {})
  .then(render);
