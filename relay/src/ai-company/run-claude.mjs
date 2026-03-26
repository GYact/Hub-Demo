// Standalone script executed via child_process.fork()
// Runs Claude Code CLI and returns the result to parent process.
//
// Security note: execSync is intentionally used because Claude Code CLI
// requires shell execution context. All user input is base64-encoded
// in the parent process (shellEscape) before being passed here,
// preventing command injection.

import { execSync } from "child_process";

const { cmd, env, timeoutMs } = JSON.parse(process.argv[2]);

try {
  const result = execSync(cmd, {
    env,
    timeout: timeoutMs || 600_000,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(JSON.stringify({ ok: true, result: result.trim() }));
} catch (error) {
  const msg = error instanceof Error ? error.message : "Unknown error";
  process.stdout.write(
    JSON.stringify({ ok: false, result: `[ERROR] ${msg.slice(0, 200)}` }),
  );
}
