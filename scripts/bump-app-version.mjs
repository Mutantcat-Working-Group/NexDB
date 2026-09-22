#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const DEFAULT_REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const APP_VERSION_FILES = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "crates/dbx-web/Cargo.toml",
  "flake.nix",
  "Cargo.lock",
];

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseAppVersion(value) {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;
  return {
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease: match[4] ?? "",
  };
}

export function formatAppVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function isValidDatePatch(patch) {
  if (!/^\d{8}$/.test(patch)) return false;
  const year = Number(patch.slice(0, 4));
  const month = Number(patch.slice(4, 6));
  const day = Number(patch.slice(6, 8));
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateAppVersion(value) {
  const version = parseAppVersion(value);
  if (!version) {
    throw new Error(`Invalid app version '${value}'. Expected X.Y.Z (for example 1.0.20260922).`);
  }
  if (version.prerelease) {
    throw new Error(
      `App version '${value}' must not use a prerelease suffix like '-1' or '-2'. ` +
        "Bump the date forward instead (for example 1.0.20260923).",
    );
  }
  if (!isValidDatePatch(version.patch)) {
    throw new Error(
      `App version '${value}' must use a date-based patch in YYYYMMDD form (for example 1.0.20260922).`,
    );
  }
  return formatAppVersion(version);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function resolveNextAppVersion(currentVersion, today = new Date()) {
  const version = parseAppVersion(currentVersion);
  if (!version || version.prerelease) {
    throw new Error(
      `Cannot derive the next date version from '${currentVersion}'. ` +
        "Use a stable X.Y.Z version or pass the target version explicitly (for example 1.0.20260922).",
    );
  }

  const candidate = new Date(today);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const patch = formatDate(candidate);
    if (patch > version.patch) {
      return formatAppVersion({ major: version.major, minor: version.minor, patch });
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error(`Could not compute a date version newer than '${currentVersion}'.`);
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

function writeFile(path, content) {
  writeFileSync(path, content);
}

function jsonVersion(path) {
  const parsed = JSON.parse(readFile(path));
  if (typeof parsed.version !== "string" || !parsed.version) {
    throw new Error(`Missing "version" in ${path}`);
  }
  return parsed.version;
}

function cargoPackageVersion(path, expectedName) {
  const lines = readFile(path).split("\n");
  let inPackage = false;
  let name = "";
  for (const line of lines) {
    if (line.startsWith("[")) {
      if (inPackage) break;
      inPackage = line === "[package]";
      continue;
    }
    if (!inPackage) continue;
    const nameMatch = /^name = "([^"]+)"/.exec(line);
    if (nameMatch) {
      name = nameMatch[1];
      continue;
    }
    const versionMatch = /^version = "([^"]+)"/.exec(line);
    if (versionMatch) {
      if (name && name !== expectedName) {
        throw new Error(`${path} declares package '${name}', expected '${expectedName}'`);
      }
      return versionMatch[1];
    }
  }
  throw new Error(`Could not find [package] version in ${path}`);
}

function cargoLockVersion(path) {
  const lines = readFile(path).split("\n");
  const desktopVersions = [];
  let inPackage = false;
  let packageName = "";
  let packageVersion = null;
  for (const line of lines) {
    if (line.startsWith("[")) {
      if (inPackage && (packageName === "dbx" || packageName === "dbx-web")) {
        desktopVersions.push(packageVersion ?? null);
      }
      inPackage = line === "[[package]]";
      packageName = "";
      packageVersion = null;
      continue;
    }
    if (!inPackage) continue;
    const nameMatch = /^name = "([^"]+)"/.exec(line);
    if (nameMatch) {
      packageName = nameMatch[1];
      continue;
    }
    if (packageVersion === null) {
      const versionMatch = /^version = "([^"]+)"/.exec(line);
      if (versionMatch) packageVersion = versionMatch[1];
    }
  }
  if (inPackage && (packageName === "dbx" || packageName === "dbx-web")) {
    desktopVersions.push(packageVersion ?? null);
  }
  const unique = [...new Set(desktopVersions.filter(Boolean))];
  if (unique.length !== 1) {
    throw new Error(`Could not find matching dbx/dbx-web versions in ${path} (found ${desktopVersions.join(", ")})`);
  }
  return unique[0];
}

function nixVersion(path) {
  const match = /version = "([^"]+)"/.exec(readFile(path));
  if (!match) throw new Error(`Could not find version in ${path}`);
  return match[1];
}

export function collectAppVersions(repoRoot = DEFAULT_REPO_ROOT) {
  return {
    "package.json": jsonVersion(join(repoRoot, "package.json")),
    "src-tauri/tauri.conf.json": jsonVersion(join(repoRoot, "src-tauri/tauri.conf.json")),
    "src-tauri/Cargo.toml": cargoPackageVersion(join(repoRoot, "src-tauri/Cargo.toml"), "dbx"),
    "crates/dbx-web/Cargo.toml": cargoPackageVersion(join(repoRoot, "crates/dbx-web/Cargo.toml"), "dbx-web"),
    "flake.nix": nixVersion(join(repoRoot, "flake.nix")),
    "Cargo.lock": cargoLockVersion(join(repoRoot, "Cargo.lock")),
  };
}

export function checkAppVersions(repoRoot = DEFAULT_REPO_ROOT) {
  const versions = collectAppVersions(repoRoot);
  const unique = [...new Set(Object.values(versions))];
  if (unique.length !== 1) {
    const details = Object.entries(versions)
      .map(([file, version]) => `  ${file}: ${version}`)
      .join("\n");
    throw new Error(`App version files disagree:\n${details}`);
  }
  return validateAppVersion(unique[0]);
}

function replaceExact(content, from, to, file, description) {
  const next = content.split(from).join(to);
  if (next === content) throw new Error(`Could not update ${description} in ${file} (expected ${from})`);
  return next;
}

function updateJsonVersion(file, oldVersion, newVersion) {
  writeFile(
    file,
    replaceExact(readFile(file), `"version": "${oldVersion}"`, `"version": "${newVersion}"`, file, '"version"'),
  );
}

function updateCargoPackageVersion(file, oldVersion, newVersion) {
  const lines = readFile(file).split("\n");
  let inPackage = false;
  let changed = false;
  const next = lines.map((line) => {
    if (line.startsWith("[")) {
      inPackage = line === "[package]";
      return line;
    }
    if (inPackage && line === `version = "${oldVersion}"`) {
      changed = true;
      return `version = "${newVersion}"`;
    }
    return line;
  });
  if (!changed) throw new Error(`Could not update [package] version in ${file} (expected ${oldVersion})`);
  writeFile(file, next.join("\n"));
}

function updateNixVersion(file, oldVersion, newVersion) {
  writeFile(file, replaceExact(readFile(file), `version = "${oldVersion}"`, `version = "${newVersion}"`, file, "version"));
}

function updateCargoLockVersion(file, oldVersion, newVersion) {
  const lines = readFile(file).split("\n");
  let inPackage = false;
  let packageName = "";
  let updated = 0;
  const next = lines.map((line) => {
    if (line.startsWith("[")) {
      inPackage = line === "[[package]]";
      packageName = "";
      return line;
    }
    if (!inPackage) return line;
    const nameMatch = /^name = "([^"]+)"/.exec(line);
    if (nameMatch) {
      packageName = nameMatch[1];
      return line;
    }
    if ((packageName === "dbx" || packageName === "dbx-web") && line === `version = "${oldVersion}"`) {
      updated += 1;
      return `version = "${newVersion}"`;
    }
    return line;
  });
  if (updated !== 2) throw new Error(`Could not update dbx/dbx-web versions in ${file} (updated ${updated}/2)`);
  writeFile(file, next.join("\n"));
}

function compareAppVersions(a, b) {
  const left = parseAppVersion(a);
  const right = parseAppVersion(b);
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return Number(left[key]) - Number(right[key]);
  }
  return 0;
}

export function updateAppVersion(nextVersion, options = {}) {
  const { repoRoot = DEFAULT_REPO_ROOT, dryRun = false } = options;
  const currentVersion = checkAppVersions(repoRoot);
  const normalized = validateAppVersion(nextVersion);
  if (compareAppVersions(normalized, currentVersion) <= 0) {
    throw new Error(
      `New app version ${normalized} must be newer than current ${currentVersion}. ` +
        `Use a later date version (for example ${resolveNextAppVersion(currentVersion)}).`,
    );
  }
  if (dryRun) return { currentVersion, nextVersion: normalized, files: APP_VERSION_FILES };

  const updaters = {
    "package.json": updateJsonVersion,
    "src-tauri/tauri.conf.json": updateJsonVersion,
    "src-tauri/Cargo.toml": updateCargoPackageVersion,
    "crates/dbx-web/Cargo.toml": updateCargoPackageVersion,
    "flake.nix": updateNixVersion,
    "Cargo.lock": updateCargoLockVersion,
  };
  for (const file of APP_VERSION_FILES) {
    updaters[file](join(repoRoot, file), currentVersion, normalized);
  }
  const verified = checkAppVersions(repoRoot);
  if (verified !== normalized) {
    throw new Error(`Version update verification failed: expected ${normalized}, got ${verified}`);
  }
  return { currentVersion, nextVersion: normalized, files: APP_VERSION_FILES };
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: node scripts/bump-app-version.mjs [version] [--check] [--dry-run]

Bump the desktop app version across package.json, Tauri config, Cargo
manifests, flake.nix, and Cargo.lock. App versions use the date scheme
1.0.YYYYMMDD; CI iterations must bump the date forward instead of using
prerelease suffixes like -1 or -2.

Commands:
  (no version)  Bump to the next date-based version after today.
  X.Y.Z         Set an explicit stable date-based version (must be newer).
  --check       Validate that all app version files agree and follow the scheme.
  --dry-run     Print the planned version bump without writing files.
  --help        Show this help.`);
}

function main() {
  const args = process.argv.slice(2);
  let checkOnly = false;
  let dryRun = false;
  let explicit = null;
  for (const arg of args) {
    if (arg === "--check") checkOnly = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    } else if (explicit === null) explicit = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  if (checkOnly && explicit !== null) fail("--check does not accept a version argument.");

  try {
    if (checkOnly) {
      console.log(`App version check passed: ${checkAppVersions()}`);
      return;
    }
    const currentVersion = checkAppVersions();
    const nextVersion = explicit !== null ? validateAppVersion(explicit) : resolveNextAppVersion(currentVersion);
    const result = updateAppVersion(nextVersion, { dryRun });
    const suffix = dryRun ? " (dry run, no files written)" : ` across ${result.files.length} files`;
    console.log(`App version ${currentVersion} -> ${nextVersion}${suffix}`);
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
