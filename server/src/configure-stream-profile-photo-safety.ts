import { StreamClient } from "@stream-io/node-sdk";
import { configureStreamProfilePhotoPolicy } from "./stream-profile-photo-policy.js";

function requiredEnv(name: "STREAM_API_KEY" | "STREAM_API_SECRET" | "STREAM_MODERATION_CONFIG_KEY") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function main() {
  const apiKey = requiredEnv("STREAM_API_KEY");
  const apiSecret = requiredEnv("STREAM_API_SECRET");
  const configKey = requiredEnv("STREAM_MODERATION_CONFIG_KEY");
  const client = new StreamClient(apiKey, apiSecret);
  await configureStreamProfilePhotoPolicy(client, configKey);

  process.stdout.write(`Updated Stream image safety policy '${configKey}'.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
