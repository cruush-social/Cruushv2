// @ts-nocheck
import { describe, expect, it } from "vitest";

import {
  API_BUILD,
  assertBuildMetadataPayload,
  assertSourceConfig,
  releaseRuntimeEnvData,
  valueIsEnabled
} from "../../scripts/release-main-coolify.mjs";

const expectedSha = "39c42182ef4d77da6e1f0f428158a32d1f46200f";
const productionApiTarget = {
  label: "production api",
  expectedHost: "api.cruush.app",
  expectedStage: "production",
  build: API_BUILD
};

describe("release-main-coolify guardrails", () => {
  it("rejects a production API source that is still on a stale branch and pinned commit", () => {
    expect(() => assertSourceConfig({
      git_branch: "codex/urgent-bugfix-safety-release",
      git_commit_sha: "70039aa8922156ae0409edfe5ae8a7888eb4b519",
      includeSourceCommitInBuild: true,
      injectBuildArgsToDockerfile: true
    }, productionApiTarget, expectedSha)).toThrow(/git_branch.*urgent-bugfix-safety-release/);

    expect(() => assertSourceConfig({
      git_branch: "main",
      git_commit_sha: "70039aa8922156ae0409edfe5ae8a7888eb4b519",
      includeSourceCommitInBuild: true,
      injectBuildArgsToDockerfile: true
    }, productionApiTarget, expectedSha)).toThrow(/git_commit_sha.*70039aa/);
  });

  it("requires Coolify API builds to receive the source commit as a Docker build arg", () => {
    expect(() => assertSourceConfig({
      git_branch: "main",
      git_commit_sha: expectedSha,
      includeSourceCommitInBuild: false,
      injectBuildArgsToDockerfile: true
    }, productionApiTarget, expectedSha)).toThrow(/include source commit/);

    expect(() => assertSourceConfig({
      git_branch: "main",
      git_commit_sha: expectedSha,
      includeSourceCommitInBuild: true,
      injectBuildArgsToDockerfile: false
    }, productionApiTarget, expectedSha)).toThrow(/inject build args/);

    expect(() => assertSourceConfig({
      gitBranch: "main",
      commitSha: expectedSha,
      settings: {
        includeSourceCommitInBuild: true,
        injectBuildArgsToDockerfile: true
      }
    }, productionApiTarget, expectedSha)).not.toThrow();
  });

  it("adds the deployment stage to API release env updates", () => {
    expect(releaseRuntimeEnvData(productionApiTarget).data).toContainEqual({
      key: "APP_DEPLOYMENT_STAGE",
      value: "production",
      is_preview: false,
      is_buildtime: false,
      is_runtime: true
    });
  });

  it("accepts Coolify boolean variants used by the API response and form state", () => {
    expect(valueIsEnabled(true)).toBe(true);
    expect(valueIsEnabled(1)).toBe(true);
    expect(valueIsEnabled("true")).toBe(true);
    expect(valueIsEnabled("1")).toBe(true);
    expect(valueIsEnabled(false)).toBe(false);
    expect(valueIsEnabled("false")).toBe(false);
  });

  it("rejects missing, stale, or wrong-stage live build metadata", () => {
    expect(() => assertBuildMetadataPayload({
      message: "Route GET:/api/build not found",
      error: "Not Found",
      statusCode: 404
    }, productionApiTarget, expectedSha)).toThrow(/service/);

    expect(() => assertBuildMetadataPayload({
      service: "cruush-server",
      sha: "70039aa8922156ae0409edfe5ae8a7888eb4b519",
      shortSha: "70039aa89221",
      stage: "production"
    }, productionApiTarget, expectedSha)).toThrow(/sha/);

    expect(() => assertBuildMetadataPayload({
      service: "cruush-server",
      sha: expectedSha,
      shortSha: expectedSha.slice(0, 12),
      stage: "development"
    }, productionApiTarget, expectedSha)).toThrow(/stage/);

    expect(() => assertBuildMetadataPayload({
      service: "cruush-server",
      sha: expectedSha,
      shortSha: expectedSha.slice(0, 12),
      stage: "production"
    }, productionApiTarget, expectedSha)).not.toThrow();
  });
});
