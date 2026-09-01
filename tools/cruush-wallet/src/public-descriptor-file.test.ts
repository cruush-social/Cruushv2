import { existsSync, renameSync, writeFileSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultPublicDescriptorPath,
  preflightPublicDescriptorTarget,
  publicDescriptorPathForHome,
  serializePublicDescriptorFile,
  writePublicDescriptorFile
} from "./public-descriptor-file.js";
import { deriveWalletPublicDescriptor } from "./wallet.js";

// Public development mnemonic used by local Ethereum test tools. Never use it for funds.
const PUBLIC_TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const CURRENT_UID = userInfo().uid;
const temporaryHomes: string[] = [];

async function makeTemporaryHome() {
  const homedir = await mkdtemp(path.join(tmpdir(), "cruush-wallet-public-descriptor-"));
  temporaryHomes.push(homedir);
  return homedir;
}

function currentUserAt(homedir: string, uid = CURRENT_UID) {
  return { homedir, uid };
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((homedir) =>
    rm(homedir, { recursive: true, force: true })
  ));
});

describe("public descriptor target preflight", () => {
  it("uses the fixed current-user path and creates its private parent before output", async () => {
    const homedir = await makeTemporaryHome();
    const target = await preflightPublicDescriptorTarget(currentUserAt(homedir));

    expect(target.filePath).toBe(path.join(
      homedir,
      "Library",
      "Application Support",
      "cruush",
      "operator-wallet",
      "public-descriptor.json"
    ));
    expect(publicDescriptorPathForHome(homedir)).toBe(target.filePath);
    expect(getDefaultPublicDescriptorPath()).toBe(publicDescriptorPathForHome(userInfo().homedir));

    const directoryStats = await lstat(target.directoryPath);
    expect(directoryStats.isDirectory()).toBe(true);
    expect(directoryStats.isSymbolicLink()).toBe(false);
    expect(directoryStats.uid).toBe(CURRENT_UID);
    expect(directoryStats.mode & 0o7777).toBe(0o700);
  });

  it("refuses a symlink, non-directory, wrong owner, or wrong mode as the parent", async () => {
    const symlinkHome = await makeTemporaryHome();
    const symlinkTarget = publicDescriptorPathForHome(symlinkHome);
    const symlinkParent = path.dirname(symlinkTarget);
    const symlinkDestination = path.join(symlinkHome, "outside");
    await mkdir(path.dirname(symlinkParent), { recursive: true, mode: 0o700 });
    await mkdir(symlinkDestination, { mode: 0o700 });
    await symlink(symlinkDestination, symlinkParent);
    await expect(preflightPublicDescriptorTarget(currentUserAt(symlinkHome)))
      .rejects.toThrow(/must not be a symbolic link/);

    const fileHome = await makeTemporaryHome();
    const fileParent = path.dirname(publicDescriptorPathForHome(fileHome));
    await mkdir(path.dirname(fileParent), { recursive: true, mode: 0o700 });
    await writeFile(fileParent, "not a directory", { mode: 0o600 });
    await expect(preflightPublicDescriptorTarget(currentUserAt(fileHome)))
      .rejects.toThrow(/regular directory/);

    const modeHome = await makeTemporaryHome();
    const modeParent = path.dirname(publicDescriptorPathForHome(modeHome));
    await mkdir(modeParent, { recursive: true, mode: 0o700 });
    await chmod(modeParent, 0o755);
    await expect(preflightPublicDescriptorTarget(currentUserAt(modeHome)))
      .rejects.toThrow(/mode 0700/);

    const ownerHome = await makeTemporaryHome();
    const ownerParent = path.dirname(publicDescriptorPathForHome(ownerHome));
    await mkdir(ownerParent, { recursive: true, mode: 0o700 });
    await expect(preflightPublicDescriptorTarget(currentUserAt(ownerHome, CURRENT_UID + 1)))
      .rejects.toThrow(/different user/);
  });

  it("refuses unsafe or symlinked existing ancestors below the real current-user home", async () => {
    const symlinkHome = await makeTemporaryHome();
    const symlinkDestination = path.join(symlinkHome, "outside-library");
    await mkdir(symlinkDestination, { mode: 0o700 });
    await symlink(symlinkDestination, path.join(symlinkHome, "Library"));
    await expect(preflightPublicDescriptorTarget(currentUserAt(symlinkHome)))
      .rejects.toThrow(/must not be a symbolic link/);

    const writableHome = await makeTemporaryHome();
    const libraryPath = path.join(writableHome, "Library");
    await mkdir(libraryPath, { mode: 0o700 });
    await chmod(libraryPath, 0o777);
    await expect(preflightPublicDescriptorTarget(currentUserAt(writableHome)))
      .rejects.toThrow(/mode 0700/);
  });

  it("detects an ancestor directory swap after preflight", async () => {
    const homedir = await makeTemporaryHome();
    const target = await preflightPublicDescriptorTarget(currentUserAt(homedir));
    const movedDirectory = `${target.directoryPath}.moved`;
    await rename(target.directoryPath, movedDirectory);
    await mkdir(target.directoryPath, { mode: 0o700 });

    await expect(writePublicDescriptorFile(
      target,
      deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC)
    )).rejects.toThrow(/path changed after preflight/);
    expect(await readdir(target.directoryPath)).toEqual([]);
    expect(await readdir(movedDirectory)).toEqual([]);
  });

  it("refuses every existing target shape instead of replacing it", async () => {
    const regularHome = await makeTemporaryHome();
    const regularTarget = publicDescriptorPathForHome(regularHome);
    await mkdir(path.dirname(regularTarget), { recursive: true, mode: 0o700 });
    await writeFile(regularTarget, "existing", { mode: 0o600 });
    await expect(preflightPublicDescriptorTarget(currentUserAt(regularHome)))
      .rejects.toThrow(/already exists/);

    const symlinkHome = await makeTemporaryHome();
    const symlinkTarget = publicDescriptorPathForHome(symlinkHome);
    await mkdir(path.dirname(symlinkTarget), { recursive: true, mode: 0o700 });
    await symlink(path.join(symlinkHome, "missing"), symlinkTarget);
    await expect(preflightPublicDescriptorTarget(currentUserAt(symlinkHome)))
      .rejects.toThrow(/must not be a symbolic link/);

    const directoryHome = await makeTemporaryHome();
    const directoryTarget = publicDescriptorPathForHome(directoryHome);
    await mkdir(directoryTarget, { recursive: true, mode: 0o700 });
    await expect(preflightPublicDescriptorTarget(currentUserAt(directoryHome)))
      .rejects.toThrow(/non-regular file/);

    const modeHome = await makeTemporaryHome();
    const modeTarget = publicDescriptorPathForHome(modeHome);
    await mkdir(path.dirname(modeTarget), { recursive: true, mode: 0o700 });
    await writeFile(modeTarget, "existing", { mode: 0o600 });
    await chmod(modeTarget, 0o644);
    await expect(preflightPublicDescriptorTarget(currentUserAt(modeHome)))
      .rejects.toThrow(/wrong mode/);
  });
});

describe("public descriptor atomic handoff", () => {
  it("writes only allowlisted public fields as a regular 0600 no-clobber file", async () => {
    const homedir = await makeTemporaryHome();
    const target = await preflightPublicDescriptorTarget(currentUserAt(homedir));
    const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);
    const descriptorWithExtraFields = {
      ...descriptor,
      privateKey: "agent-visible-private-field-marker",
      recoveryWords: "agent-visible-recovery-field-marker",
      sampleAddresses: descriptor.sampleAddresses.map((sample) => ({
        ...sample,
        privateKey: "agent-visible-nested-private-field-marker"
      }))
    };

    expect(serializePublicDescriptorFile(descriptorWithExtraFields)).not.toMatch(
      /private|recovery|agent-visible/u
    );
    const outputPath = await writePublicDescriptorFile(target, descriptorWithExtraFields);

    expect(outputPath).toBe(target.filePath);
    const outputStats = await lstat(outputPath);
    expect(outputStats.isFile()).toBe(true);
    expect(outputStats.isSymbolicLink()).toBe(false);
    expect(outputStats.uid).toBe(CURRENT_UID);
    expect(outputStats.mode & 0o7777).toBe(0o600);

    const output = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    expect(Object.keys(output)).toEqual([
      "version",
      "receiveChainPath",
      "receiveChainXpub",
      "xpubFingerprint",
      "treasuryDerivationIndex",
      "treasuryAddress",
      "sampleAddresses"
    ]);
    expect(output).toMatchObject({
      version: descriptor.version,
      receiveChainPath: descriptor.receiveChainPath,
      receiveChainXpub: descriptor.receiveChainXpub,
      xpubFingerprint: descriptor.xpubFingerprint,
      treasuryDerivationIndex: descriptor.treasuryDerivationIndex,
      treasuryAddress: descriptor.treasuryAddress,
      sampleAddresses: descriptor.sampleAddresses
    });
    expect(await readdir(target.directoryPath)).toEqual(["public-descriptor.json"]);
  });

  it("does not overwrite a target created after preflight and leaves no temp file", async () => {
    const homedir = await makeTemporaryHome();
    const target = await preflightPublicDescriptorTarget(currentUserAt(homedir));
    const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);
    await writeFile(target.filePath, "competitor\n", { mode: 0o600 });

    await expect(writePublicDescriptorFile(target, descriptor)).rejects.toThrow(/already exists/);
    expect(await readFile(target.filePath, "utf8")).toBe("competitor\n");
    expect(await readdir(target.directoryPath)).toEqual(["public-descriptor.json"]);
  });

  it("preserves a competing final path after a post-link validation race", async () => {
    const homedir = await makeTemporaryHome();
    const target = await preflightPublicDescriptorTarget(currentUserAt(homedir));
    const descriptor = deriveWalletPublicDescriptor(PUBLIC_TEST_MNEMONIC);
    const displacedPath = `${target.filePath}.displaced`;
    let replacedAfterPublication = false;
    const racedTarget = new Proxy(target, {
      get(currentTarget, property, receiver) {
        const value = Reflect.get(currentTarget, property, receiver);
        if (
          property === "filePath" &&
          typeof value === "string" &&
          !replacedAfterPublication &&
          existsSync(value)
        ) {
          renameSync(value, displacedPath);
          writeFileSync(value, "competitor\n", { mode: 0o600 });
          replacedAfterPublication = true;
        }
        return value;
      }
    });

    await expect(writePublicDescriptorFile(racedTarget, descriptor))
      .rejects.toThrow(/not the prepared temporary output/);
    expect(replacedAfterPublication).toBe(true);
    expect(await readFile(target.filePath, "utf8")).toBe("competitor\n");
    expect(JSON.parse(await readFile(displacedPath, "utf8"))).toMatchObject({
      receiveChainXpub: descriptor.receiveChainXpub,
      xpubFingerprint: descriptor.xpubFingerprint
    });
    expect((await readdir(target.directoryPath)).sort()).toEqual([
      "public-descriptor.json",
      "public-descriptor.json.displaced"
    ]);
  });

});
