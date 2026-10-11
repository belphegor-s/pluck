import { createRoot } from "react-dom/client";
import "../ui/app.css";
import { App } from "./App";

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
