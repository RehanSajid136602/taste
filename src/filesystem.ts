import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

export function listRecursive(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? join(base, entry) : entry;
    try {
      if (statSync(full).isDirectory()) {
        results.push(rel + "/");
        results.push(...listRecursive(full, rel));
      } else {
        results.push(rel);
      }
    } catch { /* skip inaccessible */ }
  }
  return results;
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function readFile(filePath: string, encoding: BufferEncoding = "utf-8"): string {
  return readFileSync(filePath, encoding);
}

export function writeFile(filePath: string, content: string): void {
  const dir = resolve(filePath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

export function execShell(command: string, cwd?: string, timeout?: number): string {
  const opts: { cwd?: string; timeout?: number; encoding?: "utf-8" } = { encoding: "utf-8" };
  if (cwd) opts.cwd = cwd;
  if (timeout) opts.timeout = timeout;
  return execSync(command, opts).toString();
}

export function readFileLines(filePath: string, offset?: number, limit?: number): string {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const start = offset ? Math.max(0, offset - 1) : 0;
  const end = limit ? start + limit : lines.length;
  return lines.slice(start, end).join("\n");
}

export function applyPatch(filePath: string, oldValue: string, newValue: string, replaceAll?: boolean): { result: string; count: number } {
  const content = readFileSync(filePath, "utf-8");
  let result: string;
  let count = 0;
  if (replaceAll) {
    const parts = content.split(oldValue);
    count = parts.length - 1;
    result = parts.join(newValue);
  } else {
    const idx = content.indexOf(oldValue);
    if (idx === -1) {
      throw new Error(`oldValue not found in ${filePath}`);
    }
    count = 1;
    result = content.slice(0, idx) + newValue + content.slice(idx + oldValue.length);
  }
  writeFileSync(filePath, result, "utf-8");
  return { result, count };
}

export function ensureFile(path: string, defaultContent: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, defaultContent, "utf-8");
  }
}
