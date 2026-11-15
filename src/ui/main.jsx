import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (rootEl) {
  const initialSlide = rootEl.getAttribute("data-initial-slide") || "landing";
  createRoot(rootEl).render(
    <React.StrictMode>
      <App initialSlide={initialSlide} />
    </React.StrictMode>
  );
}
