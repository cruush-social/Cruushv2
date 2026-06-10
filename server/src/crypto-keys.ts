import { createHash, hkdfSync } from "node:crypto";

function legacySha256Key(secret: string, purpose: string, keyVersion: string) {
  return createHash("sha256")
    .update(`${purpose}:${keyVersion}:${secret}`)
    .digest();
}

export function deriveKey(secret: string, purpose: string, keyVersion: string) {
  if (keyVersion === "v1") {
    return legacySha256Key(secret, purpose, keyVersion);
  }

  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    Buffer.from(`cruush:${purpose}:${keyVersion}:salt`, "utf8"),
    Buffer.from(`cruush:${purpose}:${keyVersion}`, "utf8"),
    32
  ));
}
