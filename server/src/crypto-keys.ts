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

export type SecretForVersionOptions = {
  currentSecret: string;
  previousSecret?: string;
  currentVersion: string;
  storedVersion?: string;
};

/**
 * Picks which secret a value was sealed under.
 *
 * Every encrypted row and token stores the key version in force when it was
 * written. Before this existed the version only chose the derivation method, so
 * the secret itself could never change: replacing one made every value already
 * encrypted under it permanently unreadable. Retaining the outgoing secret as
 * the previous one, and selecting on the stored version, is what makes a
 * rotation survivable.
 *
 * Rotation is therefore: set the previous secret to the outgoing value, set the
 * current secret to the new value, and bump the version. New writes seal under
 * the new version, old rows keep resolving to the old secret, and nothing needs
 * a migration.
 *
 * With no previous secret configured this returns the current secret for every
 * version, which is exactly the behaviour that came before it.
 */
export function resolveSecretForVersion(options: SecretForVersionOptions) {
  const { currentSecret, previousSecret, currentVersion, storedVersion } = options;

  if (!storedVersion || storedVersion === currentVersion) {
    return currentSecret;
  }

  return previousSecret || currentSecret;
}
