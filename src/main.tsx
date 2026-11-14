import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { reloadForNewBuild } from "@/lib/app/staleBuild";
import "./index.css";

// Vite reports a chunk that failed to preload (a tab left open across a deploy); reload once to pick up the new build.
window.addEventListener("vite:preloadError", event => {
  if (reloadForNewBuild()) event.preventDefault();
});

// The outer boundary covers the providers above the router; App has a per-route one inside it.
createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary resetKey="root">
    <App />
  </AppErrorBoundary>,
);
