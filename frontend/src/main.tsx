import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import I18nProvider from "./i18n/I18nProvider";
import ThemeModeProvider from "./theme/ThemeModeProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Theme outermost so the MUI theme exists for everything, including the
        settings control. I18nProvider sits INSIDE the router: it remounts its
        subtree on a language change, and doing that below the router keeps the
        current route instead of restarting at "/". */}
    <ThemeModeProvider>
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </ThemeModeProvider>
  </React.StrictMode>
);
