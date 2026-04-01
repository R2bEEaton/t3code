import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const command = isWindows ? path.join(serverDir, "node_modules", ".bin", "tsx.exe") : "bun";
const args = isWindows ? ["src/index.ts"] : ["run", "src/index.ts"];

const child = spawn(command, args, {
  cwd: serverDir,
  stdio: "inherit",
  shell: false,
});
let shuttingDown = false;

const killChildTree = (signal = "SIGTERM") => {
  if (shuttingDown || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  shuttingDown = true;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      return;
    }
    child.kill(signal);
  } catch {
    // Ignore shutdown races.
  }
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    killChildTree(signal);
    process.exit(0);
  });
}

process.on("exit", () => {
  killChildTree();
});

child.on("error", (error) => {
  console.error(
    `[apps/server] Failed to start dev server via ${command}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  shuttingDown = true;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
