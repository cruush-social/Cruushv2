#!/usr/bin/env node

import { existsSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeSecretSession,
  readHiddenLine,
  readVisibleLine,
  showRecoveryWordsOnce
} from "./interactive.js";
import {
  preflightPublicDescriptorTarget,
  writePublicDescriptorFile
} from "./public-descriptor-file.js";
import {
  parseBaseSepoliaGasFundingPlan,
  parseBaseSepoliaUsdcSweepPlan,
  signBaseSepoliaGasFundingPlan,
  signBaseSepoliaUsdcSweepPlan,
  type BaseSepoliaGasFundingPlan,
  type BaseSepoliaUsdcSweepPlan,
  type SignedWalletTransaction
} from "./signing.js";
import {
  deriveWalletPublicDescriptor,
  generateWalletMnemonic,
  walletRecoveryWordsMatch
} from "./wallet.js";

const HELP = `cruush local software wallet (Base Sepolia signing only)

Commands:
  wallet init --acknowledge-software-wallet-risk
  wallet verify <expected-xpub-fingerprint>
  wallet sign-gas <unsigned-plan.json> <signed-output.json>
  wallet sign-sweep <unsigned-plan.json> <signed-output.json>

Secret-bearing commands require a normal interactive terminal and refuse known
agent, CI, remote-shell, and terminal-recording sessions, plus pipes and
redirection. Those checks are heuristics that stop accidents, not a boundary:
a process that deliberately wraps this tool in a pseudo-terminal defeats all of
them. Close agent apps, screen sharing, terminal recording, and remote control
before answering the live-presence challenge.
No command broadcasts a transaction.`;

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
  artifact: SignedWalletTransaction
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

function gasPlanSummary(plan: BaseSepoliaGasFundingPlan) {
  return {
    network: "Base Sepolia",
    kind: plan.kind,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    source: `${plan.fromAddress} at index ${plan.fromDerivationIndex}`,
    recipient: `${plan.toAddress} at index ${plan.toDerivationIndex}`,
    valueWei: plan.valueWei,
    nonce: plan.nonce,
    maximumFeeWei: plan.gasLimit * plan.maxFeePerGas
  };
}

function sweepPlanSummary(plan: BaseSepoliaUsdcSweepPlan) {
  return {
    network: "Base Sepolia",
    kind: plan.kind,
    walletXpubFingerprint: plan.walletXpubFingerprint,
    source: `${plan.fromAddress} at index ${plan.fromDerivationIndex}`,
    recipient: `${plan.treasuryAddress} at index ${plan.treasuryDerivationIndex}`,
    usdcContract: plan.usdcContract,
    amountAtomic: plan.amountAtomic,
    nonce: plan.nonce,
    maximumFeeWei: plan.gasLimit * plan.maxFeePerGas
  };
}

async function confirmSigning(summary: unknown) {
  process.stdout.write(`${serializePublicJson(summary)}\n\n`);
  const confirmation = await readVisibleLine(
    'Verify every field above. To continue, type "SIGN BASE SEPOLIA": '
  );
  if (confirmation !== "SIGN BASE SEPOLIA") {
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
  const plan = parseBaseSepoliaGasFundingPlan(await readJsonFile(args[0]!));
  await confirmSigning(gasPlanSummary(plan));

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const artifact = await signBaseSepoliaGasFundingPlan(recoveryWords, {
      ...plan,
      valueWei: plan.valueWei.toString(),
      nonce: plan.nonce.toString(),
      gasLimit: plan.gasLimit.toString(),
      maxFeePerGas: plan.maxFeePerGas.toString(),
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
    });
    const outputPath = await writeSignedArtifact(args[1]!, artifact);
    process.stdout.write(`Signed Base Sepolia transaction written to ${outputPath}\n`);
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
  const plan = parseBaseSepoliaUsdcSweepPlan(await readJsonFile(args[0]!));
  await confirmSigning(sweepPlanSummary(plan));

  let recoveryWords = await readHiddenLine("Recovery words (hidden): ");
  try {
    const artifact = await signBaseSepoliaUsdcSweepPlan(recoveryWords, {
      ...plan,
      amountAtomic: plan.amountAtomic.toString(),
      nonce: plan.nonce.toString(),
      gasLimit: plan.gasLimit.toString(),
      maxFeePerGas: plan.maxFeePerGas.toString(),
      maxPriorityFeePerGas: plan.maxPriorityFeePerGas.toString()
    });
    const outputPath = await writeSignedArtifact(args[1]!, artifact);
    process.stdout.write(`Signed Base Sepolia transaction written to ${outputPath}\n`);
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
