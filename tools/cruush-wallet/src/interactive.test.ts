import { describe, expect, it } from "vitest";
import { generateLivePresenceChallenge, getSecretSessionSafetyError } from "./interactive.js";

const humanSession = {
  stdinIsTty: true,
  stdoutIsTty: true,
  environment: {} as NodeJS.ProcessEnv,
  parentProcessName: "/bin/zsh"
};

describe("secret session safety", () => {
  it("allows a plain interactive terminal", () => {
    expect(getSecretSessionSafetyError(humanSession)).toBeNull();
  });

  it("refuses pipes and redirection on either stream", () => {
    expect(getSecretSessionSafetyError({ ...humanSession, stdinIsTty: false }))
      .toMatch(/direct interactive terminal/);
    expect(getSecretSessionSafetyError({ ...humanSession, stdoutIsTty: false }))
      .toMatch(/direct interactive terminal/);
  });

  it("refuses every known agent and CI session marker", () => {
    const markers = [
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
    ];

    for (const marker of markers) {
      expect(
        getSecretSessionSafetyError({ ...humanSession, environment: { [marker]: "1" } }),
        `${marker} must be refused`
      ).toMatch(/agent or automation session/);
    }
  });

  it("treats an empty or falsey marker as absent so a cleared variable does not block a human", () => {
    for (const value of ["", "0", "false"]) {
      expect(getSecretSessionSafetyError({ ...humanSession, environment: { CI: value } })).toBeNull();
    }
  });

  it("refuses a remote shell, because recovery words must not cross a network link", () => {
    for (const key of ["SSH_TTY", "SSH_CONNECTION", "SSH_CLIENT"]) {
      expect(getSecretSessionSafetyError({ ...humanSession, environment: { [key]: "x" } }))
        .toMatch(/remote shell/);
    }
  });

  it("refuses parents that record the terminal stream, by basename and by full path", () => {
    for (const parent of ["script", "/usr/bin/script", "expect", "unbuffer", "socat", "screen", "tmux", "asciinema"]) {
      expect(
        getSecretSessionSafetyError({ ...humanSession, parentProcessName: parent }),
        `${parent} must be refused`
      ).toMatch(/records the terminal stream/);
    }
  });

  it("does not refuse an ordinary shell parent, or an unknown one", () => {
    for (const parent of ["/bin/bash", "zsh", "login", "", null]) {
      expect(getSecretSessionSafetyError({ ...humanSession, parentProcessName: parent })).toBeNull();
    }
  });
});

describe("live presence challenge", () => {
  it("asks for three words drawn from the word list", () => {
    const challenge = generateLivePresenceChallenge(() => 0);
    expect(challenge).toBe("anchor anchor anchor");
    expect(challenge.split(" ")).toHaveLength(3);
  });

  it("varies with the random source, so a recorded transcript cannot be replayed", () => {
    let call = 0;
    const challenge = generateLivePresenceChallenge(() => {
      call += 1;
      return call;
    });

    expect(challenge).toBe("basalt cedar dahlia");
  });

  it("stays inside the word list for every index the random source can return", () => {
    const indexes = Array.from({ length: 24 }, (_unused, index) => index);
    for (const index of indexes) {
      const challenge = generateLivePresenceChallenge(() => index);
      expect(challenge.split(" ").filter(Boolean)).toHaveLength(3);
      expect(challenge).not.toContain("undefined");
    }
  });
});
