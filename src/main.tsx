import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css';
import './responsive-overrides.css';
import { initPwa } from "./pwa";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

void initPwa(() => {
  console.log("[main] Mounting App...");
  createRoot(rootElement).render(<App />);
});
