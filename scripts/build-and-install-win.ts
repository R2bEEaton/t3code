#!/usr/bin/env bun
/**
 * Build and install the Windows desktop app locally.
 *
 * Usage:
 *   bun run build:win          # build + install
 *   bun run build:win --skip-build   # reuse existing dist artifacts
 *
 * What it does:
 *  1. Ensures winCodeSign cache is pre-extracted (works around a symlink
 *     privilege issue on Windows without Developer Mode enabled).
 *  2. Runs the desktop artifact build script for Windows x64.
 *  3. Launches the resulting NSIS installer silently (/S flag).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, win32 } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELEASE_DIR = join(import.meta.dirname, "..", "release");
const ELECTRON_BUILDER_CACHE = join(
  process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "C:\\Users\\Default", "AppData", "Local"),
  "electron-builder",
  "Cache",
);
const WIN_CODE_SIGN_CACHE = join(ELECTRON_BUILDER_CACHE, "winCodeSign");
const WIN_CODE_SIGN_VERSION = "winCodeSign-2.6.0";
const WIN_CODE_SIGN_URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${WIN_CODE_SIGN_VERSION}/${WIN_CODE_SIGN_VERSION}.7z`;

// Bun resolves to the current executable path.
const BUN_EXE = process.execPath;
const BUN_DIR = win32.dirname(BUN_EXE);

// Ensure cmd.exe and bun.exe are always on PATH for sub-processes.
process.env.PATH = `${BUN_DIR};C:\\Windows\\System32;C:\\Windows;${process.env.PATH ?? ""}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): boolean {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    cwd: opts.cwd,
    env: process.env,
  });
  return result.status === 0;
}

function findSevenZip(): string | null {
  // Check common bunx temp dir locations first.
  const tempDir = process.env.TEMP ?? process.env.TMP ?? "C:\\Windows\\Temp";
  try {
    const entries = readdirSync(tempDir);
    for (const entry of entries) {
      if (!entry.startsWith("bunx-")) continue;
      const candidate = join(tempDir, entry, "node_modules", "7zip-bin", "win", "x64", "7za.exe");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  return null;
}

function ensureWinCodeSignCache(): void {
  const extractedDir = join(WIN_CODE_SIGN_CACHE, WIN_CODE_SIGN_VERSION);
  const signtoolCandidate = join(extractedDir, "windows-10", "x64", "signtool.exe");

  if (existsSync(signtoolCandidate)) {
    console.log("[build-win] winCodeSign cache already valid, skipping pre-extraction.");
    return;
  }

  console.log("[build-win] Pre-extracting winCodeSign cache (works around symlink privilege issue)...");

  // Download the archive using curl (available in Windows 10+).
  mkdirSync(WIN_CODE_SIGN_CACHE, { recursive: true });
  const archivePath = join(WIN_CODE_SIGN_CACHE, `${WIN_CODE_SIGN_VERSION}.7z`);

  if (!existsSync(archivePath)) {
    console.log(`[build-win] Downloading ${WIN_CODE_SIGN_URL}...`);
    const ok = run("curl", ["-L", "-o", archivePath, WIN_CODE_SIGN_URL]);
    if (!ok || !existsSync(archivePath)) {
      console.error("[build-win] Failed to download winCodeSign archive.");
      process.exit(1);
    }
  }

  // Find 7za.exe — it is bundled by electron-builder after a partial run, or
  // we can use the one bun downloads during the build step itself.
  // Trigger electron-builder once to unpack its own 7za, then extract.
  // Simplest approach: use PowerShell's Expand-Archive as a fallback, but
  // 7z is more reliable for this archive format.
  const sevenZip = findSevenZip();
  if (!sevenZip) {
    console.log("[build-win] 7za.exe not yet cached — running a dry-pass of the build to unpack it...");
    // A quick bun x electron-builder invocation will download 7za.exe to the bunx temp dir.
    run("bun", ["x", "electron-builder", "--version"]);
  }

  const sevenZipPath = findSevenZip();
  if (!sevenZipPath) {
    console.error("[build-win] Could not locate 7za.exe to pre-extract winCodeSign. Continuing anyway (may fail on symlinks).");
    return;
  }

  mkdirSync(extractedDir, { recursive: true });
  console.log(`[build-win] Extracting to ${extractedDir}...`);
  // Extract ignoring symlink errors (-y = assume yes, exit 2 = warnings-only).
  const result = spawnSync(sevenZipPath, ["x", "-y", "-bd", archivePath, `-o${extractedDir}`], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0 && result.status !== 2) {
    console.error(`[build-win] 7za extraction exited with code ${result.status} — may be OK if only symlink warnings.`);
  } else {
    console.log("[build-win] winCodeSign extracted successfully (symlink warnings ignored).");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const skipBuild = process.argv.includes("--skip-build");

console.log("\n=== T3 Code — Windows Build & Install ===\n");

// Step 1: pre-extract winCodeSign to avoid the symlink privilege error.
ensureWinCodeSignCache();

// Step 2: run the desktop artifact build script.
const buildArgs = [
  "run",
  "scripts/build-desktop-artifact.ts",
  "--platform", "win",
  "--verbose",
];
if (skipBuild) {
  buildArgs.push("--skip-build");
}

const repoRoot = join(import.meta.dirname, "..");
console.log("\n[build-win] Building Windows installer...\n");
const buildOk = run(BUN_EXE, buildArgs, { cwd: repoRoot });
if (!buildOk) {
  console.error("\n[build-win] Build failed. See output above.");
  process.exit(1);
}

// Step 3: find the .exe installer and launch it.
console.log("\n[build-win] Build complete. Looking for installer...");
let installerPath: string | null = null;
try {
  const files = readdirSync(RELEASE_DIR);
  const exe = files.find((f) => f.endsWith(".exe") && !f.endsWith(".blockmap"));
  if (exe) installerPath = join(RELEASE_DIR, exe);
} catch {
  // ignore
}

if (!installerPath || !existsSync(installerPath)) {
  console.error(`[build-win] Could not find installer .exe in ${RELEASE_DIR}`);
  process.exit(1);
}

console.log(`[build-win] Launching installer: ${installerPath}`);
// /S = silent install (NSIS silent mode — installs without UI prompts)
const installResult = spawnSync("cmd.exe", ["/c", `"${installerPath}" /S`], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

if (installResult.status !== 0) {
  console.error(`\n[build-win] Installer exited with code ${installResult.status}.`);
  process.exit(1);
}

console.log("\n[build-win] Done! T3 Code has been installed.\n");
