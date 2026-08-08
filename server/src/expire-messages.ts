import { loadConfig } from "./config.js";
import { buildServer } from "./app.js";
import { expireDisappearingMessages } from "./message-expiry.js";

const app = buildServer(loadConfig());

try {
  await app.ready();
  console.log(JSON.stringify(await expireDisappearingMessages(app)));
} finally {
  await app.close();
}

