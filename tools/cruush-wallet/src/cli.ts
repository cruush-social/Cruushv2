#!/usr/bin/env node

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeSecretSession,
  readHiddenLine,
  readVisibleLine,
  showRecoveryWordsOnce
} from "./interactive.js";
import {
  readDefaultPublicDescriptor,
  preflightPublicDescriptorTarget,
  writePublicDescriptorFile
} from "./public-descriptor-file.js";
import {
  parseBaseSepoliaGasFundingPlan,
  parseBaseSepoliaUsdcSweepPlan,
  parseWalletGasFundingPlan,
  parseWalletTokenSweepPlan,
  signBaseSepoliaGasFundingPlan,
  signBaseSepoliaUsdcSweepPlan,
  signWalletGasFundingPlan,
  signWalletTokenSweepPlan,
  type BaseSepoliaGasFundingPlan,
  type BaseSepoliaUsdcSweepPlan,
  type WalletGasFundingPlan,
  type WalletTokenSweepPlan
} from "./signing.js";
import { getOperatorWalletNetwork, getOperatorWalletRail } from "./networks.js";
import {
  broadcastSignedWalletSweepBundle,
  createOperatorWalletRpc,
  parseSignedWalletSweepBundle,
  parseWalletSweepPlanBundle,
  prepareWalletSweepPlanBundle,
  type SignedWalletSweepBundle
} from "./wallet-rpc.js";
import {
  deriveWalletPublicDescriptor,
  deriveAddressFromReceiveChainXpub,
  generateWalletMnemonic,
  assertWalletDerivationIndex,
  walletRecoveryWordsMatch
} from "./wallet.js";

const HELP = `cruush local software wallet

Commands:
  wallet status
  wallet address <derivation-index>
  wallet configure-server-xpub <server-env-file>
  wallet init --acknowledge-software-wallet-risk
  wallet verify <expected-xpub-fingerprint>
  wallet plan-sweep <rail> <derivation-index> <unsigned-bundle.json>
  wallet sign-bundle <unsigned-bundle.json> <signed-bundle.json>
  wallet broadcast-bundle <signed-bundle.json>
  wallet sign-gas <unsigned-plan.json> <signed-output.json>
  wallet sign-sweep <unsigned-plan.json> <signed-output.json>

Secret-bearing commands require a normal interactive terminal and refuse known
agent, CI, remote-shell, and terminal-recording sessions, plus pipes and
redirection. Those checks are heuristics that stop accidents, not a boundary:
a process that deliberately wraps this tool in a pseudo-terminal defeats all of
them. Close agent apps, screen sharing, terminal recording, and remote control
before answering the live-presence challenge.
Only broadcast-bundle broadcasts. It requires a direct normal Terminal, prints
the exact hashes and maximum fees, and requires an exact live confirmation.`;

async function showWalletStatus(args: string[]) {
  if (args.length !== 0) {
    throw new Error("status does not accept arguments.");
  }
  const { filePath, descriptor } = await readDefaultPublicDescriptor();
  process.stdout.write(`${serializePublicJson({
    descriptorPath: filePath,
    walletXpubFingerprint: descriptor.xpubFingerprint,
    receiveChainPath: descriptor.receiveChainPath,
    treasuryAddress: descriptor.treasuryAddress,
    treasuryDerivationIndex: descriptor.treasuryDerivationIndex,
    sampleAddresses: descriptor.sampleAddresses
  })}\n`);
}

async function showWalletAddress(args: string[]) {
  if (args.length !== 1 || !/^(?:0|[1-9][0-9]*)$/.test(args[0] ?? "")) {
    throw new Error("address requires one canonical derivation index.");
  }
  const derivationIndex = assertWalletDerivationIndex(Number(args[0]));
  const { descriptor } = await readDefaultPublicDescriptor();
  process.stdout.write(`${serializePublicJson({
    walletXpubFingerprint: descriptor.xpubFingerprint,
    derivationIndex,
    address: deriveAddressFromReceiveChainXpub(
      descriptor.receiveChainXpub,
      derivationIndex
    )
  })}\n`);
}

async function configureServerXpub(args: string[]) {
  if (args.length !== 1) {
    throw new Error("configure-server-xpub requires one server environment file path.");
  }
  const targetPath = path.resolve(args[0]!);
  const targetStat = await lstat(targetPath);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error("Server environment target must be an existing regular file, not a link.");
  }
  if (typeof process.getuid === "function" && targetStat.uid !== process.getuid()) {
    throw new Error("Server environment target must be owned by the current user.");
  }
  const current = await readFile(targetPath, "utf8");
  const key = "CRYPTO_PROCESSOR_WALLET_XPUB";
  const keyLine = new RegExp(`^${key}=.*$`, "gm");
  const matches = current.match(keyLine) ?? [];
  if (matches.length > 1) {
    throw new Error(`${key} appears more than once. Refusing an ambiguous update.`);
  }
  const { descriptor } = await readDefaultPublicDescriptor();
  const replacement = `${key}=${descriptor.receiveChainXpub}`;
  const updated = matches.length === 1
    ? current.replace(keyLine, replacement)
    : `${current}${current.endsWith("\n") ? "" : "\n"}${replacement}\n`;
  const temporaryPath = `${targetPath}.cruush-wallet-${process.pid}-${randomUUID()}`;
  let temporaryCreated = false;
  try {
    const file = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await file.writeFile(updated, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, targetPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
  process.stdout.write(
    `Configured ${key} in ${targetPath}. Processor flags were not changed.\n`
  );
}

function serializePublicJson(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => typeof item === "bigint" ? item.toString() : item,
    2
  );
}

async function readJsonFile(filePath: string) {
  let contents: string;
  try {
    contents = await readFile(path.resolve(filePath), "utf8");
  } catch {
    throw new Error("Unable to read the unsigned transaction plan.");
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error("Unsigned transaction plan must contain valid JSON.");
  }
}

function pathIsInsideGitCheckout(filePath: string) {
  let directory = path.dirname(path.resolve(filePath));
  while (true) {
    if (existsSync(path.join(directory, ".git"))) {
      return true;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return false;
    }
    directory = parent;
  }
}

async function writeSignedArtifact(
  outputPath: string,
  artifact: unknown
) {
  const resolved = path.resolve(outputPath);
  if (pathIsInsideGitCheckout(resolved)) {
    throw new Error("Signed transaction output must be outside every Git checkout.");
  }

  let file;
  try {
    file = await open(resolved, "wx", 0o600);
    await file.writeFile(`${serializePublicJson(artifact)}\n`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Signed transaction output already exists. Refusing to overwrite it.");
    }
    throw error;
  } finally {
    await file?.close();
  }
  return resolved;
}

function requireOperatorWalletRpcUrl() {
  const endpointUrl = process.env.CRUUSH_WALLET_RPC_URL?.trim() ?? "";
  if (!endpointUrl) {
    throw new Error("CRUUSH_WALLET_RPC_URL is required for this command.");
  }
  return endpointUrl;
}

function normalizeGasFundingPlan(plan: WalletGasFundingPlan) {
  return {
    ...plan,
    valueWei: plan.valueWei.toString(),
    nonce: plan.nonce.toString(),
    gasLimit: plan.gasLimit.toString(),
    maxFeePerGas: plan.maxFeePerGas.toString(),
    maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
  };
}

function normalizeTokenSweepPlan(plan: WalletTokenSweepPlan) {
  return {
    ...plan,
    amountAtomic: plan.amountAtomic.toString(),
    nonce: plan.nonce.toString(),
    gasLimit: plan.gasLimit.toString(),
    maxFeePerGas: plan.maxFeePerGas.toString(),
    maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
  };
}

async function planWalletSweep(args: string[]) {
  if (
    args.length !== 3
    || !/^(?:0|[1-9][0-9]*)$/.test(args[1] ?? "")
  ) {
    throw new Error("plan-sweep requires a rail, derivation index, and output path.");
  }
  const rail = getOperatorWalletRail(args[0]!);
  const derivationIndex = assertWalletDerivationIndex(Number(args[1]));
  const { descriptor } = await readDefaultPublicDescriptor();
  const bundle = await prepareWalletSweepPlanBundle({
    descriptor,
    rail: rail.id,
    derivationIndex,
    rpc: createOperatorWalletRpc({ endpointUrl: requireOperatorWalletRpcUrl() })
  });
  const outputPath = await writeSignedArtifact(args[2]!, bundle);
  process.stdout.write(`Unsigned ${rail.asset} sweep bundle written to ${outputPath}\n`);
}

async function signWalletSweepBundle(args: string[]) {
  if (args.length !== 2) {
    throw new Error("sign-bundle requires an unsigned bundle path and signed output path.");
  }
  assertSafeSecretSession();
  const plan = parseWalletSweepPlanBundle(await readJsonFile(args[0]!));
  const network = getOperatorWalletNetwork(plan.network);
  await confirmSigning({
    network: network.label,
    rail: plan.rail,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    derivationIndex: plan.derivationIndex,
    gasFunding: plan.gasFundingPlan ? gasPlanSummary(plan.gasFundingPlan) : null,
    tokenSweep: sweepPlanSummary(plan.tokenSweepPlan)
  }, `SIGN ${network.label.toUpperCase()}`);

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const gasFundingTransaction = plan.gasFundingPlan
      ? await signWalletGasFundingPlan(
          recoveryWords,
          normalizeGasFundingPlan(plan.gasFundingPlan)
        )
      : null;
    const tokenSweepTransaction = await signWalletTokenSweepPlan(
      recoveryWords,
      normalizeTokenSweepPlan(plan.tokenSweepPlan)
    );
    const bundle: SignedWalletSweepBundle = {
      version: 1,
      kind: "wallet-sweep-signed-bundle",
      network: plan.network,
      rail: plan.rail,
      walletXpubFingerprint: plan.walletXpubFingerprint,
      derivationIndex: plan.derivationIndex,
      gasFundingTransaction,
      tokenSweepTransaction
    };
    const outputPath = await writeSignedArtifact(args[1]!, bundle);
    process.stdout.write(`Signed ${network.label} sweep bundle written to ${outputPath}\n`);
    process.stdout.write("Reconnect only after closing this signing Terminal.\n");
  } finally {
    recoveryWords = "";
  }
}

async function broadcastWalletSweepBundle(args: string[]) {
  if (args.length !== 1) {
    throw new Error("broadcast-bundle requires one signed bundle path.");
  }
  assertSafeSecretSession();
  const { descriptor } = await readDefaultPublicDescriptor();
  const bundle = await parseSignedWalletSweepBundle(await readJsonFile(args[0]!), descriptor);
  const network = getOperatorWalletNetwork(bundle.network);
  process.stdout.write(`${serializePublicJson({
    network: network.label,
    rail: bundle.rail,
    walletXpubFingerprint: bundle.walletXpubFingerprint,
    derivationIndex: bundle.derivationIndex,
    gasFundingTransactionHash: bundle.gasFundingTransaction?.transactionHash ?? null,
    tokenSweepTransactionHash: bundle.tokenSweepTransaction.transactionHash,
    amountAtomic: bundle.tokenSweepTransaction.amountAtomic,
    maximumFeesWei: [
      bundle.gasFundingTransaction?.maximumFeeWei ?? "0",
      bundle.tokenSweepTransaction.maximumFeeWei
    ]
  })}\n\n`);
  const phrase = `BROADCAST ${network.label.toUpperCase()}`;
  const confirmation = await readVisibleLine(
    `This moves real funds. To continue, type "${phrase}": `
  );
  if (confirmation !== phrase) {
    throw new Error("Broadcast confirmation did not match. Nothing was broadcast.");
  }
  const hashes = await broadcastSignedWalletSweepBundle(
    createOperatorWalletRpc({ endpointUrl: requireOperatorWalletRpcUrl() }),
    bundle
  );
  process.stdout.write(`${serializePublicJson({ transactionHashes: hashes })}\n`);
}

function gasPlanSummary(plan: BaseSepoliaGasFundingPlan | WalletGasFundingPlan) {
  return {
    network: "network" in plan ? plan.network : "base-sepolia",
    kind: plan.kind,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    source: `${plan.fromAddress} at index ${plan.fromDerivationIndex}`,
    recipient: `${plan.toAddress} at index ${plan.toDerivationIndex}`,
    valueWei: plan.valueWei,
    nonce: plan.nonce,
    maximumFeeWei: plan.gasLimit * plan.maxFeePerGas
  };
}

function sweepPlanSummary(plan: BaseSepoliaUsdcSweepPlan | WalletTokenSweepPlan) {
  return {
    network: "rail" in plan ? getOperatorWalletRail(plan.rail).network : "base-sepolia",
    kind: plan.kind,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    source: `${plan.fromAddress} at index ${plan.fromDerivationIndex}`,
    recipient: `${plan.treasuryAddress} at index ${plan.treasuryDerivationIndex}`,
    tokenContract: "tokenContract" in plan ? plan.tokenContract : plan.usdcContract,
    amountAtomic: plan.amountAtomic,
    nonce: plan.nonce,
    maximumFeeWei: plan.gasLimit * plan.maxFeePerGas
  };
}

async function confirmSigning(summary: unknown, confirmationText: string) {
  process.stdout.write(`${serializePublicJson(summary)}\n\n`);
  const confirmation = await readVisibleLine(
    `Verify every field above. To continue, type "${confirmationText}": `
  );
  if (confirmation !== confirmationText) {
    throw new Error("Signing confirmation did not match. No transaction was signed.");
  }
}

async function initializeWallet(args: string[]) {
  if (args.length !== 1 || args[0] !== "--acknowledge-software-wallet-risk") {
    throw new Error("Wallet initialization requires --acknowledge-software-wallet-risk.");
  }
  assertSafeSecretSession();

  const descriptorTarget = await preflightPublicDescriptorTarget();

  let recoveryWords = generateWalletMnemonic();
  let backupWords = "";
  try {
    await showRecoveryWordsOnce(recoveryWords);
    backupWords = await readHiddenLine(
      "Re-enter all 24 recovery words in order to verify the paper backup (hidden): "
    );
    if (!walletRecoveryWordsMatch(recoveryWords, backupWords)) {
      throw new Error(
        "Re-entered recovery words did not match. Wallet initialization cancelled."
      );
    }
    const descriptor = deriveWalletPublicDescriptor(recoveryWords);
    const descriptorPath = await writePublicDescriptorFile(descriptorTarget, descriptor);
    process.stdout.write(
      `Public descriptor path: ${descriptorPath}\n` +
      `Fingerprint: ${descriptor.xpubFingerprint}\n` +
      "Close Terminal now.\n"
    );
  } finally {
    backupWords = "";
    recoveryWords = "";
  }
}

async function verifyWallet(args: string[]) {
  if (args.length !== 1 || !/^[a-f0-9]{64}$/.test(args[0] ?? "")) {
    throw new Error("Wallet verification requires one lowercase xpub fingerprint.");
  }
  assertSafeSecretSession();

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const descriptor = deriveWalletPublicDescriptor(recoveryWords);
    if (descriptor.xpubFingerprint !== args[0]) {
      throw new Error("Recovery words do not match the expected wallet fingerprint.");
    }
    process.stdout.write(`${serializePublicJson(descriptor)}\n`);
  } finally {
    recoveryWords = "";
  }
}

async function signGasFunding(args: string[]) {
  if (args.length !== 2) {
    throw new Error("sign-gas requires an unsigned plan path and a signed output path.");
  }
  assertSafeSecretSession();
  const input = await readJsonFile(args[0]!);
  const isMainnetPlan = (input as Record<string, unknown> | null)?.kind === "wallet-gas-funding";
  const plan = isMainnetPlan
    ? parseWalletGasFundingPlan(input)
    : parseBaseSepoliaGasFundingPlan(input);
  const network = isMainnetPlan
    ? getOperatorWalletNetwork((plan as WalletGasFundingPlan).network)
    : getOperatorWalletNetwork("base-sepolia");
  await confirmSigning(gasPlanSummary(plan), `SIGN ${network.label.toUpperCase()}`);

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const normalizedPlan = {
      ...plan,
      valueWei: plan.valueWei.toString(),
      nonce: plan.nonce.toString(),
      gasLimit: plan.gasLimit.toString(),
      maxFeePerGas: plan.maxFeePerGas.toString(),
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
    };
    const artifact = isMainnetPlan
      ? await signWalletGasFundingPlan(recoveryWords, normalizedPlan)
      : await signBaseSepoliaGasFundingPlan(recoveryWords, normalizedPlan);
    const outputPath = await writeSignedArtifact(args[1]!, artifact);
    process.stdout.write(`Signed ${network.label} transaction written to ${outputPath}\n`);
    process.stdout.write(`Transaction hash: ${artifact.transactionHash}\n`);
  } finally {
    recoveryWords = "";
  }
}

async function signUsdcSweep(args: string[]) {
  if (args.length !== 2) {
    throw new Error("sign-sweep requires an unsigned plan path and a signed output path.");
  }
  assertSafeSecretSession();
  const input = await readJsonFile(args[0]!);
  const isMainnetPlan = (input as Record<string, unknown> | null)?.kind === "wallet-token-sweep";
  const plan = isMainnetPlan
    ? parseWalletTokenSweepPlan(input)
    : parseBaseSepoliaUsdcSweepPlan(input);
  const network = isMainnetPlan
      ? getOperatorWalletNetwork(getOperatorWalletRail(
        (plan as WalletTokenSweepPlan).rail
      ).network)
    : getOperatorWalletNetwork("base-sepolia");
  await confirmSigning(sweepPlanSummary(plan), `SIGN ${network.label.toUpperCase()}`);

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const normalizedPlan = {
      ...plan,
      amountAtomic: plan.amountAtomic.toString(),
      nonce: plan.nonce.toString(),
      gasLimit: plan.gasLimit.toString(),
      maxFeePerGas: plan.maxFeePerGas.toString(),
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
    };
    const artifact = isMainnetPlan
      ? await signWalletTokenSweepPlan(recoveryWords, normalizedPlan)
      : await signBaseSepoliaUsdcSweepPlan(recoveryWords, normalizedPlan);
    const outputPath = await writeSignedArtifact(args[1]!, artifact);
    process.stdout.write(`Signed ${network.label} transaction written to ${outputPath}\n`);
    process.stdout.write(`Transaction hash: ${artifact.transactionHash}\n`);
  } finally {
    recoveryWords = "";
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (command === "init") {
    await initializeWallet(args);
    return;
  }
  if (command === "status") {
    await showWalletStatus(args);
    return;
  }
  if (command === "address") {
    await showWalletAddress(args);
    return;
  }
  if (command === "configure-server-xpub") {
    await configureServerXpub(args);
    return;
  }
  if (command === "plan-sweep") {
    await planWalletSweep(args);
    return;
  }
  if (command === "sign-bundle") {
    await signWalletSweepBundle(args);
    return;
  }
  if (command === "broadcast-bundle") {
    await broadcastWalletSweepBundle(args);
    return;
  }
  if (command === "verify") {
    await verifyWallet(args);
    return;
  }
  if (command === "sign-gas") {
    await signGasFunding(args);
    return;
  }
  if (command === "sign-sweep") {
    await signUsdcSweep(args);
    return;
  }

  throw new Error("Unknown command. Run wallet --help.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Wallet command failed.";
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
