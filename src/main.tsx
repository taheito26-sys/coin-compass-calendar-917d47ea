import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css';
import './responsive-overrides.css';

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

console.log("[main] Mounting App...");
createRoot(rootElement).render(<App />);
