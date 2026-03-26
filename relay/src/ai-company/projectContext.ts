import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Configurable via env var; defaults to relay's ALLOWED_DIR or cwd
const PROJECT_ROOT =
  process.env.AI_COMPANY_CWD || process.env.ALLOWED_DIR || process.cwd();

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "dist",
  "build",
  ".turbo",
  "relay",
]);

const IGNORE_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  ".DS_Store",
]);

function walkDir(dir: string, prefix = ""): string[] {
  const lines: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return lines;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        lines.push(`${prefix}${entry}/`);
        lines.push(...walkDir(fullPath, prefix + "  "));
      } else {
        lines.push(`${prefix}${entry}`);
      }
    } catch {
      // skip inaccessible files
    }
  }
  return lines;
}

function getFileOverview(filePath: string, maxLines = 5): string {
  try {
    const content = readFileSync(join(PROJECT_ROOT, filePath), "utf-8");
    const lines = content.split("\n").slice(0, maxLines);
    return lines.join("\n");
  } catch {
    return "";
  }
}

export function generateProjectContext(): string {
  const tree = walkDir(PROJECT_ROOT);

  const keyFiles = ["package.json", "src/main.tsx"];

  const fileOverviews = keyFiles
    .map((f) => {
      const overview = getFileOverview(f, 8);
      return overview ? `### ${f}\n\`\`\`\n${overview}\n\`\`\`` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return `## プロジェクト構成

### ディレクトリ構造
\`\`\`
${tree.join("\n")}
\`\`\`

${fileOverviews}
`;
}

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}
