import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { OfflineProvider } from "./context/OfflineContext.jsx";
import { PrintSettingsProvider } from "./context/PrintSettingsContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { BranchProvider } from "./context/BranchContext.jsx";
import "./index.css";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <BranchProvider>
              <ToastProvider>
                <PrintSettingsProvider>
                  <OfflineProvider>
                    <App />
                  </OfflineProvider>
                </PrintSettingsProvider>
              </ToastProvider>
            </BranchProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);
