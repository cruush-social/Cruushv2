
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  window.addEventListener("vite:preloadError", () => {
    window.location.reload();
  });

  createRoot(document.getElementById("root")!).render(<App />);


  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      let hasController = Boolean(navigator.serviceWorker.controller);
      let reloadStarted = false;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hasController) {
          hasController = true;
          return;
        }

        if (reloadStarted) {
          return;
        }

        reloadStarted = true;
        window.location.reload();
      });

      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          void registration.update();

          registration.addEventListener("updatefound", () => {
            const nextWorker = registration.installing;

            nextWorker?.addEventListener("statechange", () => {
              if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
                nextWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {});
    });
  }
