import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { PerchProvider } from "./context/PerchContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <PerchProvider>
        <App />
      </PerchProvider>
    </BrowserRouter>
  </React.StrictMode>
);
