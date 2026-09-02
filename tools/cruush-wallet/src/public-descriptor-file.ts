import { randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, link, mkdir, open, unlink } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import {
  deriveAddressFromReceiveChainXpub,
  fingerprintReceiveChainXpub,
  toChecksumEthereumAddress,
  type WalletPublicDescriptor
} from "./wallet.js";
import {
  PUBLIC_DESCRIPTOR_SAMPLE_INDICES,
  RECEIVE_CHAIN_PATH,
  TREASURY_DERIVATION_INDEX
} from "./constants.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MODE_BITS = 0o7777;
const GROUP_OR_OTHER_WRITE_BITS = 0o022;
const PUBLIC_DESCRIPTOR_DIRECTORY_SEGMENTS = [
  "Library",
  "Application Support",
  "cruush",
  "operator-wallet"
] as const;
const PUBLIC_DESCRIPTOR_FILE_NAME = "public-descriptor.json";
const PUBLIC_DESCRIPTOR_RELATIVE_PATH = [
  ...PUBLIC_DESCRIPTOR_DIRECTORY_SEGMENTS,
  PUBLIC_DESCRIPTOR_FILE_NAME
] as const;

type CurrentUser = {
  homedir: string;
  uid: number;
};

export type PreparedPublicDescriptorTarget = {
  ancestorDirectories: ReadonlyArray<{
    directoryPath: string;
    directoryDevice: number;
    directoryInode: number;
    requirePrivateMode: boolean;
  }>;
  directoryPath: string;
  directoryDevice: number;
  directoryInode: number;
  filePath: string;
  ownerUid: number;
};

function hasErrnoCode(error: unknown, code: string) {
  return (error as NodeJS.ErrnoException).code === code;
}

async function lstatIfPresent(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

function permissionBits(mode: number) {
  return mode & MODE_BITS;
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Public descriptor must contain a JSON object.");
  }
}

function assertExactPublicDescriptorKeys(record: Record<string, unknown>) {
  const expected = [
    "receiveChainPath",
    "receiveChainXpub",
    "sampleAddresses",
    "treasuryAddress",
    "treasuryDerivationIndex",
    "version",
    "xpubFingerprint"
  ].sort();
  const actual = Object.keys(record).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error("Public descriptor contains missing or unsupported fields.");
  }
}

export function parsePublicDescriptorFile(contents: string): WalletPublicDescriptor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new Error("Public descriptor must contain valid JSON.");
  }

  assertRecord(parsed);
  assertExactPublicDescriptorKeys(parsed);
  if (
    parsed.version !== 1
    || parsed.receiveChainPath !== RECEIVE_CHAIN_PATH
    || parsed.treasuryDerivationIndex !== TREASURY_DERIVATION_INDEX
    || typeof parsed.receiveChainXpub !== "string"
    || typeof parsed.xpubFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(parsed.xpubFingerprint)
    || typeof parsed.treasuryAddress !== "string"
    || !Array.isArray(parsed.sampleAddresses)
  ) {
    throw new Error("Public descriptor has invalid wallet metadata.");
  }

  const expectedFingerprint = fingerprintReceiveChainXpub(parsed.receiveChainXpub);
  if (parsed.xpubFingerprint !== expectedFingerprint) {
    throw new Error("Public descriptor xpub fingerprint does not match its public node.");
  }

  const expectedTreasury = deriveAddressFromReceiveChainXpub(
    parsed.receiveChainXpub,
    TREASURY_DERIVATION_INDEX
  );
  let treasuryAddress: string;
  try {
    treasuryAddress = toChecksumEthereumAddress(parsed.treasuryAddress);
  } catch {
    throw new Error("Public descriptor treasury address is invalid.");
  }
  if (treasuryAddress !== expectedTreasury) {
    throw new Error("Public descriptor treasury address does not match derivation index 0.");
  }

  if (parsed.sampleAddresses.length !== PUBLIC_DESCRIPTOR_SAMPLE_INDICES.length) {
    throw new Error("Public descriptor has the wrong sample-address count.");
  }
  const sampleAddresses = parsed.sampleAddresses.map((sample, index) => {
    assertRecord(sample);
    const actualKeys = Object.keys(sample).sort();
    if (actualKeys.length !== 2 || actualKeys[0] !== "address" || actualKeys[1] !== "derivationIndex") {
      throw new Error("Public descriptor sample contains unsupported fields.");
    }
    const derivationIndex = PUBLIC_DESCRIPTOR_SAMPLE_INDICES[index]!;
    if (sample.derivationIndex !== derivationIndex || typeof sample.address !== "string") {
      throw new Error("Public descriptor sample index is invalid.");
    }
    const expectedAddress = deriveAddressFromReceiveChainXpub(
      parsed.receiveChainXpub as string,
      derivationIndex
    );
    let address: string;
    try {
      address = toChecksumEthereumAddress(sample.address);
    } catch {
      throw new Error("Public descriptor sample address is invalid.");
    }
    if (address !== expectedAddress) {
      throw new Error("Public descriptor sample address does not match its derivation index.");
    }
    return { derivationIndex, address };
  });

  return {
    version: 1,
    receiveChainPath: RECEIVE_CHAIN_PATH,
    receiveChainXpub: parsed.receiveChainXpub,
    xpubFingerprint: parsed.xpubFingerprint,
    treasuryDerivationIndex: TREASURY_DERIVATION_INDEX,
    treasuryAddress,
    sampleAddresses
  };
}

async function assertOwnedSafeDirectory(
  directoryPath: string,
  ownerUid: number,
  requirePrivateMode: boolean
) {
  const stats = await lstatIfPresent(directoryPath);
  if (!stats) {
    throw new Error("Public descriptor path directory does not exist.");
  }
  if (stats.isSymbolicLink()) {
    throw new Error("Public descriptor path directory must not be a symbolic link.");
  }
  if (!stats.isDirectory()) {
    throw new Error("Public descriptor path directory must be a regular directory.");
  }
  if (stats.uid !== ownerUid) {
    throw new Error("Public descriptor path directory is owned by a different user.");
  }
  if (requirePrivateMode && permissionBits(stats.mode) !== PRIVATE_DIRECTORY_MODE) {
    throw new Error("Public descriptor directory must have mode 0700.");
  }
  if (!requirePrivateMode && (permissionBits(stats.mode) & GROUP_OR_OTHER_WRITE_BITS) !== 0) {
    throw new Error("Public descriptor path directory must not be group- or world-writable.");
  }
  return stats;
}

async function createPrivateDirectoryIfMissing(directoryPath: string) {
  if (await lstatIfPresent(directoryPath)) {
    return;
  }

  try {
    await mkdir(directoryPath, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    // Another process may have created the component after the lstat. Its
    // ownership, type, and permissions are checked immediately below.
    if (!hasErrnoCode(error, "EEXIST")) {
      throw error;
    }
  }
}

async function assertTargetDoesNotExist(filePath: string, ownerUid: number) {
  const stats = await lstatIfPresent(filePath);
  if (!stats) {
    return;
  }
  if (stats.isSymbolicLink()) {
    throw new Error("Public descriptor target must not be a symbolic link.");
  }
  if (!stats.isFile()) {
    throw new Error("Public descriptor target must not be a non-regular file.");
  }
  if (stats.uid !== ownerUid) {
    throw new Error("Public descriptor target is owned by a different user.");
  }
  if (permissionBits(stats.mode) !== PRIVATE_FILE_MODE) {
    throw new Error("Public descriptor target has the wrong mode; expected 0600.");
  }
  throw new Error("Public descriptor target already exists. Refusing to overwrite it.");
}

async function assertPreparedDirectories(target: PreparedPublicDescriptorTarget) {
  if (
    target.ancestorDirectories.length !== PUBLIC_DESCRIPTOR_DIRECTORY_SEGMENTS.length + 1 ||
    target.ancestorDirectories.at(-1)?.directoryPath !== target.directoryPath ||
    target.filePath !== path.join(target.directoryPath, PUBLIC_DESCRIPTOR_FILE_NAME)
  ) {
    throw new Error("Public descriptor prepared path is invalid.");
  }

  for (const prepared of target.ancestorDirectories) {
    const stats = await assertOwnedSafeDirectory(
      prepared.directoryPath,
      target.ownerUid,
      prepared.requirePrivateMode
    );
    if (
      stats.dev !== prepared.directoryDevice ||
      stats.ino !== prepared.directoryInode
    ) {
      throw new Error("Public descriptor path changed after preflight.");
    }
  }
}

function assertPrivateRegularFile(
  stats: Stats,
  ownerUid: number
) {
  if (!stats.isFile()) {
    throw new Error("Public descriptor temporary output is not a regular file.");
  }
  if (stats.uid !== ownerUid) {
    throw new Error("Public descriptor temporary output is owned by a different user.");
  }
  if (permissionBits(stats.mode) !== PRIVATE_FILE_MODE) {
    throw new Error("Public descriptor temporary output does not have mode 0600.");
  }
}

function isSameFile(stats: Stats, expected: Pick<Stats, "dev" | "ino">) {
  return stats.dev === expected.dev && stats.ino === expected.ino;
}

async function openPathIfSameFile(
  filePath: string,
  expected: Pick<Stats, "dev" | "ino">
) {
  let file: Awaited<ReturnType<typeof open>>;
  try {
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT") || hasErrnoCode(error, "ELOOP")) {
      return null;
    }
    throw error;
  }

  try {
    const stats = await file.stat();
    if (!stats.isFile() || !isSameFile(stats, expected)) {
      await file.close();
      return null;
    }
    return file;
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Best-effort cleanup for the unpredictable temporary name. Node core has no
 * fd-relative or inode-conditional unlink, so a same-UID process can still race
 * the last check. Final published paths are never passed here.
 */
async function unlinkTemporaryFileIfSameInode(
  filePath: string,
  expected: Pick<Stats, "dev" | "ino">
) {
  const file = await openPathIfSameFile(filePath, expected);
  if (!file) {
    return false;
  }

  try {
    const currentStats = await lstatIfPresent(filePath);
    if (!currentStats || !currentStats.isFile() || !isSameFile(currentStats, expected)) {
      return false;
    }
    await unlink(filePath);
    return true;
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  } finally {
    await file.close();
  }
}

export function publicDescriptorPathForHome(homedir: string) {
  if (!path.isAbsolute(homedir)) {
    throw new Error("Current user home directory must be an absolute path.");
  }
  return path.join(homedir, ...PUBLIC_DESCRIPTOR_RELATIVE_PATH);
}

export function getDefaultPublicDescriptorPath() {
  return publicDescriptorPathForHome(userInfo().homedir);
}

export async function readDefaultPublicDescriptor(
  currentUser: CurrentUser = userInfo()
) {
  if (!Number.isSafeInteger(currentUser.uid) || currentUser.uid < 0) {
    throw new Error("Current user ID is invalid.");
  }

  const homedir = path.resolve(currentUser.homedir);
  await assertOwnedSafeDirectory(homedir, currentUser.uid, false);
  let directoryPath = homedir;
  for (const segment of PUBLIC_DESCRIPTOR_DIRECTORY_SEGMENTS) {
    directoryPath = path.join(directoryPath, segment);
    await assertOwnedSafeDirectory(directoryPath, currentUser.uid, true);
  }

  const filePath = path.join(directoryPath, PUBLIC_DESCRIPTOR_FILE_NAME);
  const pathStats = await lstat(filePath);
  if (pathStats.isSymbolicLink()) {
    throw new Error("Public descriptor must not be a symbolic link.");
  }
  assertPrivateRegularFile(pathStats, currentUser.uid);
  if (pathStats.nlink !== 1) {
    throw new Error("Public descriptor has an unexpected link count.");
  }

  const file = await openPathIfSameFile(filePath, pathStats);
  if (!file) {
    throw new Error("Public descriptor changed while it was opened.");
  }
  try {
    const contents = await file.readFile("utf8");
    const finalStats = await lstat(filePath);
    if (!isSameFile(finalStats, pathStats)) {
      throw new Error("Public descriptor changed while it was read.");
    }
    return { filePath, descriptor: parsePublicDescriptorFile(contents) };
  } finally {
    await file.close();
  }
}

export async function preflightPublicDescriptorTarget(
  currentUser: CurrentUser = userInfo()
): Promise<PreparedPublicDescriptorTarget> {
  if (!Number.isSafeInteger(currentUser.uid) || currentUser.uid < 0) {
    throw new Error("Current user ID is invalid.");
  }

  const homedir = path.resolve(currentUser.homedir);
  const homeStats = await assertOwnedSafeDirectory(homedir, currentUser.uid, false);
  const ancestorDirectories: Array<PreparedPublicDescriptorTarget["ancestorDirectories"][number]> = [{
    directoryPath: homedir,
    directoryDevice: homeStats.dev,
    directoryInode: homeStats.ino,
    requirePrivateMode: false
  }];

  let directoryPath = homedir;
  for (const segment of PUBLIC_DESCRIPTOR_DIRECTORY_SEGMENTS) {
    directoryPath = path.join(directoryPath, segment);
    await createPrivateDirectoryIfMissing(directoryPath);
    const stats = await assertOwnedSafeDirectory(directoryPath, currentUser.uid, true);
    ancestorDirectories.push({
      directoryPath,
      directoryDevice: stats.dev,
      directoryInode: stats.ino,
      requirePrivateMode: true
    });
  }

  const directoryStats = ancestorDirectories.at(-1)!;
  const filePath = path.join(directoryPath, PUBLIC_DESCRIPTOR_FILE_NAME);
  await assertTargetDoesNotExist(filePath, currentUser.uid);

  const target = {
    ancestorDirectories,
    directoryPath,
    directoryDevice: directoryStats.directoryDevice,
    directoryInode: directoryStats.directoryInode,
    filePath,
    ownerUid: currentUser.uid
  };
  await assertPreparedDirectories(target);
  return target;
}

export function serializePublicDescriptorFile(descriptor: WalletPublicDescriptor) {
  const publicFields = {
    version: descriptor.version,
    receiveChainPath: descriptor.receiveChainPath,
    receiveChainXpub: descriptor.receiveChainXpub,
    xpubFingerprint: descriptor.xpubFingerprint,
    treasuryDerivationIndex: descriptor.treasuryDerivationIndex,
    treasuryAddress: descriptor.treasuryAddress,
    sampleAddresses: descriptor.sampleAddresses.map((sample) => ({
      derivationIndex: sample.derivationIndex,
      address: sample.address
    }))
  };

  return `${JSON.stringify(publicFields, null, 2)}\n`;
}

export async function writePublicDescriptorFile(
  target: PreparedPublicDescriptorTarget,
  descriptor: WalletPublicDescriptor
) {
  await assertPreparedDirectories(target);
  await assertTargetDoesNotExist(target.filePath, target.ownerUid);

  const temporaryPath = path.join(
    target.directoryPath,
    `.public-descriptor.${process.pid}.${randomBytes(16).toString("hex")}.tmp`
  );
  const contents = serializePublicDescriptorFile(descriptor);
  let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;
  let temporaryStats: Stats | undefined;
  let operationError: unknown;

  try {
    temporaryFile = await open(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE
    );
    temporaryStats = await temporaryFile.stat();
    await temporaryFile.chmod(PRIVATE_FILE_MODE);
    temporaryStats = await temporaryFile.stat();
    assertPrivateRegularFile(temporaryStats, target.ownerUid);
    if (temporaryStats.nlink !== 1) {
      throw new Error("Public descriptor temporary output has an unexpected link count.");
    }

    const temporaryPathStats = await lstat(temporaryPath);
    if (!isSameFile(temporaryPathStats, temporaryStats)) {
      throw new Error("Public descriptor temporary path changed during creation.");
    }
    await assertPreparedDirectories(target);

    await temporaryFile.writeFile(contents, "utf8");
    await temporaryFile.sync();

    await assertPreparedDirectories(target);
    await assertTargetDoesNotExist(target.filePath, target.ownerUid);

    try {
      await link(temporaryPath, target.filePath);
    } catch (error) {
      if (hasErrnoCode(error, "EEXIST")) {
        throw new Error(
          "Public descriptor target appeared after preflight. Refusing to overwrite it."
        );
      }
      throw error;
    }

    const finalFile = await openPathIfSameFile(target.filePath, temporaryStats);
    if (!finalFile) {
      throw new Error("Public descriptor target is not the prepared temporary output.");
    }
    try {
      const finalStats = await finalFile.stat();
      assertPrivateRegularFile(finalStats, target.ownerUid);
      if (finalStats.nlink !== 2) {
        throw new Error("Public descriptor output has an unexpected link count.");
      }
      await assertPreparedDirectories(target);
    } finally {
      await finalFile.close();
    }
  } catch (error) {
    operationError = error;
  }

  const cleanupErrors: unknown[] = [];
  if (temporaryFile) {
    if (!temporaryStats) {
      try {
        temporaryStats = await temporaryFile.stat();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await temporaryFile.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (temporaryStats) {
    try {
      await unlinkTemporaryFileIfSameInode(temporaryPath, temporaryStats);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (operationError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      "Public descriptor write and temporary-file cleanup both failed."
    );
  }
  if (operationError) {
    throw operationError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Public descriptor temporary-file cleanup failed.");
  }
  return target.filePath;
}
