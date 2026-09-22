import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkAppVersions,
  collectAppVersions,
  resolveNextAppVersion,
  updateAppVersion,
  validateAppVersion,
} from "./bump-app-version.mjs";

function fixtureRoot(version) {
  const root = mkdtempSync(join(tmpdir(), "nexdb-version-"));
  mkdirSync(join(root, "src-tauri"), { recursive: true });
  mkdirSync(join(root, "crates/dbx-web"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "nexdb", version }, null, 2) + "\n");
  writeFileSync(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ productName: "NexDB", version }, null, 2) + "\n");
  writeFileSync(
    join(root, "src-tauri/Cargo.toml"),
    `[package]\nname = "dbx"\nversion = "${version}"\nlicense = "Apache-2.0"\n\n[lib]\nname = "dbx_lib"\n`,
  );
  writeFileSync(
    join(root, "crates/dbx-web/Cargo.toml"),
    `[package]\nname = "dbx-web"\nversion = "${version}"\n\n[dependencies]\ndbx = { path = "../dbx" }\n`,
  );
  writeFileSync(join(root, "flake.nix"), `{ pkgs, ... }:\n{\n  version = "${version}";\n}\n`);
  writeFileSync(
    join(root, "Cargo.lock"),
    `[[package]]\nname = "dbx"\nversion = "${version}"\ndependencies = [\n "dbx-core",\n]\n\n` +
      `[[package]]\nname = "dbx-web"\nversion = "${version}"\ndependencies = [\n "dbx",\n "serde",\n]\n\n` +
      `[[package]]\nname = "serde"\nversion = "1.0.0"\n`,
  );
  return root;
}

test("next date version advances day by day", () => {
  assert.equal(resolveNextAppVersion("1.0.20260921", new Date("2026-09-22T08:00:00")), "1.0.20260922");
  assert.equal(resolveNextAppVersion("1.0.20260922", new Date("2026-09-22T23:59:59")), "1.0.20260923");
  assert.equal(resolveNextAppVersion("1.0.20260925", new Date("2026-09-22T00:00:00")), "1.0.20260926");
});

test("next date version rejects prerelease baselines", () => {
  assert.throws(() => resolveNextAppVersion("1.0.20260922-1"), /explicit/);
  assert.throws(() => resolveNextAppVersion("1.0.20260922-2"), /explicit/);
});

test("explicit versions must be stable, date-based, and valid calendar dates", () => {
  assert.equal(validateAppVersion("1.0.20260922"), "1.0.20260922");
  assert.equal(validateAppVersion("1.1.20260922"), "1.1.20260922");
  assert.throws(() => validateAppVersion("1.0.20260922-1"), /prerelease/);
  assert.throws(() => validateAppVersion("1.0.20260922-2"), /prerelease/);
  assert.throws(() => validateAppVersion("1.0.1"), /date-based/);
  assert.throws(() => validateAppVersion("1.0.20261301"), /date-based/);
  assert.throws(() => validateAppVersion("1.0.20260229"), /date-based/);
  assert.equal(validateAppVersion("1.0.20240229"), "1.0.20240229");
});

test("update keeps every version file in sync", () => {
  const root = fixtureRoot("1.0.20260921");
  assert.deepEqual(
    collectAppVersions(root),
    Object.fromEntries(
      ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "crates/dbx-web/Cargo.toml", "flake.nix", "Cargo.lock"].map(
        (file) => [file, "1.0.20260921"],
      ),
    ),
  );

  const dryRun = updateAppVersion("1.0.20260922", { repoRoot: root, dryRun: true });
  assert.equal(dryRun.nextVersion, "1.0.20260922");
  assert.equal(checkAppVersions(root), "1.0.20260921");

  const result = updateAppVersion("1.0.20260922", { repoRoot: root });
  assert.equal(result.nextVersion, "1.0.20260922");
  assert.equal(checkAppVersions(root), "1.0.20260922");
  assert.deepEqual(Object.values(collectAppVersions(root)), new Array(6).fill("1.0.20260922"));
});

test("update rejects prerelease and non-forward versions", () => {
  const root = fixtureRoot("1.0.20260921");
  assert.throws(() => updateAppVersion("1.0.20260922-1", { repoRoot: root }), /prerelease/);
  assert.throws(() => updateAppVersion("1.0.20260922-1", { repoRoot: root, dryRun: true }), /prerelease/);
  assert.throws(() => updateAppVersion("1.0.20260921", { repoRoot: root }), /newer/);
  assert.throws(() => updateAppVersion("1.0.20260920", { repoRoot: root }), /newer/);
});

test("check passes on the repository's current version files", () => {
  assert.match(checkAppVersions(), /^\d+\.\d+\.\d{8}$/);
});
