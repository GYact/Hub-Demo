import { fork } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanLlmResponse } from "./llmResponseCleaner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "run-claude.mjs");

const CLAUDE_BIN = process.env.CLAUDE_BIN_PATH ?? "claude";

/**
 * Whitelist of env var keys passed to the Claude subprocess.
 * Allowlist approach: only explicitly permitted vars are forwarded.
 * This prevents API keys, DB credentials, and other secrets from
 * leaking into the child process environment.
 */
const ALLOWED_ENV_KEYS: ReadonlySet<string> = new Set([
  // Binary resolution
  "PATH",
  "SHELL",
  "TERM",
  // User identity (config path resolution, e.g. ~/.claude/, ~/.config/)
  "HOME",
  "USER",
  "USERNAME",
  "LOGNAME",
  // Temp directories
  "TMPDIR",
  "TEMP",
  "TMP",
  // Locale
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  // XDG base dirs (Linux / macOS)
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  // Windows compatibility
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "COMSPEC",
]);

/** Build minimal safe env for Claude subprocess (whitelist approach) */
function buildSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }
  // Always suppress ANSI color codes in subprocess output
  env.NO_COLOR = "1";
  return env;
}

function shellEscape(s: string): string {
  const b64 = Buffer.from(s).toString("base64");
  return `"$(echo '${b64}' | base64 -d)"`;
}

export interface ClaudeOptions {
  allowedTools?: string[];
  cwd?: string;
  addDirs?: string[];
  timeout?: number;
}

export function runClaudeCode(
  systemPrompt: string,
  userPrompt: string,
  options?: ClaudeOptions,
): Promise<string> {
  return new Promise((resolve) => {
    const env = buildSafeEnv();
    const timeoutMs = options?.timeout ?? 600_000;

    const parts = [
      options?.cwd ? `cd ${shellEscape(options.cwd)} &&` : "",
      CLAUDE_BIN,
      "--dangerously-skip-permissions",
      "--output-format text",
      "--model sonnet",
      "--system-prompt",
      shellEscape(systemPrompt),
    ];

    if (options?.allowedTools && options.allowedTools.length > 0) {
      parts.push("--allowedTools", `"${options.allowedTools.join(",")}"`);
    }

    if (options?.addDirs && options.addDirs.length > 0) {
      for (const dir of options.addDirs) {
        parts.push("--add-dir", shellEscape(dir));
      }
    }

    // "--" separates options from the positional prompt (required for --add-dir variadic)
    parts.push("-p", "--", shellEscape(userPrompt));

    const cmd = parts.filter(Boolean).join(" ");
    const payload = JSON.stringify({ cmd, env, timeoutMs });

    const child = fork(SCRIPT_PATH, [payload], {
      silent: true,
      env: env as NodeJS.ProcessEnv,
    });

    let stdout = "";

    let settled = false;
    const settle = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      // Forcefully destroy stdio so 'close' event fires and handles are freed
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.kill("SIGKILL");
      settle("[TIMEOUT] 時間超過");
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout);
        const raw = parsed.result ?? "[ERROR] No result";
        settle(cleanLlmResponse(raw));
      } catch {
        settle(cleanLlmResponse(stdout) || "[ERROR] Empty response");
      }
    });

    child.on("error", (err) => {
      settle(`[ERROR] ${err.message.slice(0, 200)}`);
    });
  });
}
