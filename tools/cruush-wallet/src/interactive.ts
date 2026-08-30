import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import type { ReadStream, WriteStream } from "node:tty";

// These checks are heuristics, not a security boundary. A process that wraps
// this tool in a pseudo-terminal (script(1), expect, node-pty) makes both TTY
// flags report exactly what a human at a real terminal reports, and it can
// clear any environment variable before spawning the child. They exist to stop
// an agent or CI job from reaching secret-bearing commands by accident. They
// cannot stop one that is deliberately trying to. The only real control is
// running these commands on a machine that has no agent tooling on it at all.
// See docs/plans/v2-crypto-processor.md, "Zero-cost software wallet contract".
const AGENT_ENVIRONMENT_KEYS = [
  "CODEX_SESSION_ID",
  "CODEX_THREAD_ID",
  "CLAUDECODE",
  "CLAUDE_SESSION_ID",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_ENTRYPOINT",
  "CURSOR_TRACE_ID",
  "CI",
  "CONTINUOUS_INTEGRATION",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "JENKINS_URL",
  "TEAMCITY_VERSION"
] as const;

// The recovery words must never cross a network link, so a remote shell is
// refused even though the operator on the far end may well be human.
const REMOTE_SESSION_ENVIRONMENT_KEYS = ["SSH_TTY", "SSH_CONNECTION", "SSH_CLIENT"] as const;

// Terminal multiplexers and pty recorders keep a transcript of the raw byte
// stream, which defeats the alternate-screen buffer the words are shown in.
const CAPTURING_PARENT_PROCESSES = [
  "script",
  "expect",
  "unbuffer",
  "socat",
  "screen",
  "tmux",
  "asciinema"
];

function environmentValueIsSet(value: string | undefined) {
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

export function getParentProcessName(pid = process.ppid): string | null {
  try {
    return execFileSync("ps", ["-o", "comm=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2000
    }).trim();
  } catch {
    return null;
  }
}

export function getSecretSessionSafetyError(input: {
  stdinIsTty: boolean;
  stdoutIsTty: boolean;
  environment: NodeJS.ProcessEnv;
  parentProcessName?: string | null;
}) {
  if (!input.stdinIsTty || !input.stdoutIsTty) {
    return "Secret-bearing commands require a direct interactive terminal. Pipes and redirection are refused.";
  }

  const activeAgentKey = AGENT_ENVIRONMENT_KEYS.find((key) =>
    environmentValueIsSet(input.environment[key])
  );
  if (activeAgentKey) {
    return `Secret-bearing commands are refused while ${activeAgentKey} indicates an agent or automation session.`;
  }

  const remoteKey = REMOTE_SESSION_ENVIRONMENT_KEYS.find((key) =>
    environmentValueIsSet(input.environment[key])
  );
  if (remoteKey) {
    return `Secret-bearing commands are refused over a remote shell (${remoteKey} is set). Run them at the machine itself.`;
  }

  const parentName = path_basename(input.parentProcessName ?? "");
  const capturingParent = CAPTURING_PARENT_PROCESSES.find((name) => parentName === name);
  if (capturingParent) {
    return `Secret-bearing commands are refused under ${capturingParent}, which records the terminal stream.`;
  }

  return null;
}

// Kept local so this module does not depend on node:path for one basename.
function path_basename(value: string) {
  const segments = value.split("/");
  return segments[segments.length - 1] ?? "";
}

export function assertSafeSecretSession(
  input = process.stdin as ReadStream,
  output = process.stdout as WriteStream,
  environment = process.env
) {
  const error = getSecretSessionSafetyError({
    stdinIsTty: input.isTTY === true,
    stdoutIsTty: output.isTTY === true,
    environment,
    parentProcessName: getParentProcessName()
  });
  if (error) {
    throw new Error(error);
  }
}

// A short unpredictable phrase the operator must type back before anything
// secret is written to the terminal. It does not stop a driver that reads the
// stream and answers, but it does mean recovery words are never emitted to a
// session nobody is actually sitting at.
export function generateLivePresenceChallenge(randomIndex = randomInt) {
  const words = [
    "anchor", "basalt", "cedar", "dahlia", "ember", "fathom", "granite", "harbor",
    "indigo", "juniper", "kelp", "lantern", "marble", "nectar", "opal", "pumice",
    "quarry", "ridge", "sable", "thistle", "umber", "vellum", "willow", "zephyr"
  ];

  return Array.from({ length: 3 }, () => words[randomIndex(words.length)]).join(" ");
}

export async function readVisibleLine(prompt: string) {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await reader.question(prompt)).trim();
  } finally {
    reader.close();
  }
}

export async function readHiddenLine(prompt: string) {
  const input = process.stdin as ReadStream;
  const output = process.stdout as WriteStream;
  assertSafeSecretSession(input, output);

  output.write(prompt);
  input.resume();
  input.setRawMode(true);

  return await new Promise<string>((resolve, reject) => {
    let value = "";
    let settled = false;

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      action();
    };

    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) {
          finish(() => reject(new Error("Secret entry cancelled.")));
          return;
        }
        if (byte === 4) {
          finish(() => reject(new Error("Secret entry ended before completion.")));
          return;
        }
        if (byte === 10 || byte === 13) {
          finish(() => resolve(value));
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32 && byte <= 126) {
          value += String.fromCharCode(byte);
        }
      }
    };

    input.on("data", onData);
  });
}

export async function showRecoveryWordsOnce(recoveryWords: string) {
  assertSafeSecretSession();
  const output = process.stdout as WriteStream;

  // Gate the display itself, before any secret reaches the terminal stream.
  const challenge = generateLivePresenceChallenge();
  output.write(
    "\nThe next screen shows recovery words that can spend everything this wallet\n" +
    "ever receives. Anything recording this terminal will capture them.\n\n" +
    `To confirm a person is here, type: ${challenge}\n`
  );
  if ((await readVisibleLine("> ")) !== challenge) {
    throw new Error("Live-presence confirmation did not match. No recovery words were displayed.");
  }
  output.write("\u001b[?1049h\u001b[2J\u001b[H");

  try {
    output.write(
      "cruush local software wallet\n\n" +
      "Write these recovery words on paper. Never photograph, copy, paste, upload, or share them.\n\n" +
      `${recoveryWords}\n\n`
    );
    const confirmation = await readVisibleLine(
      'After writing and checking every word, type "I WROTE THE RECOVERY WORDS": '
    );
    if (confirmation !== "I WROTE THE RECOVERY WORDS") {
      throw new Error("Recovery-word confirmation did not match. Wallet initialization cancelled.");
    }
  } finally {
    output.write("\u001b[2J\u001b[H\u001b[?1049l");
  }
}
