
  import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { captureInstallPrompt } from "./app/lib/installPrompt";
import {
  applyAccessibilityPreferences,
  installAccessibilityPreferencesStorageSync,
} from "./app/lib/accessibilityPreferences";
import { installHaptics } from "./app/lib/haptics";
import "./styles/index.css";

applyAccessibilityPreferences();
installAccessibilityPreferencesStorageSync();
installHaptics();

  window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

// Capture this before authentication and lazy routes load. Browsers can emit
// beforeinstallprompt while the login shell is still on screen.
window.addEventListener("beforeinstallprompt", captureInstallPrompt);

createRoot(document.getElementById("root")!).render(<App />);


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const APP_SHELL_REFRESH_ID = "v115";
    const SERVICE_WORKER_SCRIPT_URL = `/sw.js?release=${APP_SHELL_REFRESH_ID}`;
    let hasController = Boolean(navigator.serviceWorker.controller);
    let reloadStarted = false;

    const requestWorkerRefresh = (registration?: ServiceWorkerRegistration) => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      registration?.active?.postMessage({ type: "CLIENT_REFRESH_REQUESTED", refreshId: APP_SHELL_REFRESH_ID });
      void registration?.update().catch(() => {});
    };

    const refreshAllWorkers = () => {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          registrations.forEach(requestWorkerRefresh);
        })
        .catch(() => {});
    };

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

    void navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT_URL, { updateViaCache: "none" })
      .then((registration) => {
        requestWorkerRefresh(registration);

        registration.addEventListener("updatefound", () => {
          const nextWorker = registration.installing;

            nextWorker?.addEventListener("statechange", () => {
              if (nextWorker.state === "installed" && navigator.serviceWorker.controller) {
                nextWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        const refreshOnVisible = () => {
          if (document.visibilityState === "visible") {
            requestWorkerRefresh(registration);
            refreshAllWorkers();
          }
        };

        window.addEventListener("focus", refreshOnVisible);
        window.addEventListener("online", refreshOnVisible);
        document.addEventListener("visibilitychange", refreshOnVisible);
        window.setTimeout(refreshOnVisible, 2500);

        let refreshAttempts = 0;
        const refreshInterval = window.setInterval(() => {
          refreshAttempts += 1;
          refreshOnVisible();

          if (refreshAttempts >= 8) {
            window.clearInterval(refreshInterval);
          }
        }, 30000);
      })
      .catch(() => {});
  });
}
