// @ts-nocheck
import { describe, expect, it } from "vitest";

import {
  API_BUILD,
  API_MIGRATION_BUILD_COMMAND,
  apiMigrationBuildCommand,
  assertBuildConfig,
  assertBuildIdentityConfig,
  assertBuildMetadataPayload,
  assertSourceConfig,
  releaseRuntimeEnvData,
  valueIsEnabled
} from "../../scripts/release-main-coolify.mjs";

const expectedSha = "39c42182ef4d77da6e1f0f428158a32d1f46200f";
const productionApiTarget = {
  label: "production api",
  uuid: "syntheticapi",
  expectedHost: "api.cruush.app",
  expectedStage: "production",
  build: API_BUILD
};

describe("release-main-coolify guardrails", () => {
  it("requires candidate migration wiring before an API release", () => {
    const app = {base_directory:"/server",ports_exposes:"3001",health_check_enabled:true,
      health_check_path:"/health",health_check_host:"127.0.0.1",health_check_retries:40,health_check_interval:15,
      build_pack:"dockercompose",docker_compose_location:"/compose.v2.yml",
      git_commit_sha:expectedSha,
      docker_compose_custom_build_command:apiMigrationBuildCommand(expectedSha, productionApiTarget.uuid),
      docker_compose_custom_start_command:null,pre_deployment_command:null};
    expect(()=>assertBuildConfig(app,productionApiTarget)).not.toThrow();
    expect(()=>assertBuildConfig({...app,docker_compose_custom_build_command:null},productionApiTarget)).toThrow(/candidate migrations/);
    expect(()=>assertBuildConfig({...app,pre_deployment_command:"npm run migrate"},productionApiTarget)).toThrow(/old API/);
    expect(()=>assertBuildConfig({...app,docker_compose_custom_start_command:"npm run migrate && npm run start"},productionApiTarget)).toThrow(/startup/);
  });

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

  it("checks build identity flags before push without rejecting an older running SHA", () => {
    const old = {git_commit_sha:"b".repeat(40),settings:{include_source_commit_in_build:true,inject_build_args_to_dockerfile:true}};
    expect(()=>assertBuildIdentityConfig(old,productionApiTarget)).not.toThrow();
    expect(()=>assertBuildIdentityConfig({...old,settings:{...old.settings,include_source_commit_in_build:false}},productionApiTarget)).toThrow(/include source commit/);
    expect(()=>assertBuildIdentityConfig({...old,settings:{...old.settings,inject_build_args_to_dockerfile:false}},productionApiTarget)).toThrow(/inject build args/);
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
