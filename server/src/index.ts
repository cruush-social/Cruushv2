import { loadConfig } from "./config.js";
import { buildServer } from "./app.js";

const config = loadConfig();
const app = buildServer(config);

const shutdown = async () => {
  await app.close();
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

await app.listen({
  host: config.HOST,
  port: config.PORT
});
