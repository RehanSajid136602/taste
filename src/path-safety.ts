import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path";

export interface SafePathResult {
  ok: boolean;
  absolutePath?: string;
  displayPath: string;
  warning?: string;
  error?: string;
}

function hasTraversalSegment(filePath: string): boolean {
  return filePath.split(/[\\/]+/).some((part) => part === "..");
}

export function resolveSafePath(filePath: string, cwd = process.cwd()): SafePathResult {
  if (!filePath || filePath.trim() === "") {
    return { ok: false, displayPath: filePath, error: "filePath is required" };
  }
  if (filePath.includes("\0")) {
    return { ok: false, displayPath: filePath, error: "filePath contains a null byte" };
  }
  if (hasTraversalSegment(filePath)) {
    return { ok: false, displayPath: filePath, error: "Path traversal is blocked" };
  }

  const absolutePath = isAbsolute(filePath) ? normalize(filePath) : resolve(cwd, filePath);
  return { ok: true, absolutePath, displayPath: filePath };
}

export function guardReadPath(filePath: string): SafePathResult {
  const safe = resolveSafePath(filePath);
  if (!safe.ok || !safe.absolutePath) return safe;
  if (!existsSync(safe.absolutePath)) {
    return { ...safe, ok: false, warning: `File does not exist: ${filePath}` };
  }
  if (!statSync(safe.absolutePath).isFile()) {
    return { ...safe, ok: false, error: `Not a file: ${filePath}` };
  }
  return safe;
}

export function guardWritePath(filePath: string): SafePathResult {
  const safe = resolveSafePath(filePath);
  if (!safe.ok || !safe.absolutePath) return safe;
  const parent = dirname(safe.absolutePath);
  if (!existsSync(parent)) {
    return { ...safe, ok: false, error: `Parent folder does not exist: ${parent}` };
  }
  if (existsSync(safe.absolutePath) && !statSync(safe.absolutePath).isFile()) {
    return { ...safe, ok: false, error: `Target exists but is not a file: ${filePath}` };
  }
  return safe;
}

export function guardPatchPath(filePath: string): SafePathResult {
  return guardReadPath(filePath);
}

export function relativeDisplayPath(absolutePath: string, cwd = process.cwd()): string {
  const normalizedCwd = normalize(cwd);
  const normalizedPath = normalize(absolutePath);
  if (normalizedPath === normalizedCwd) return ".";
  if (normalizedPath.startsWith(normalizedCwd + sep)) {
    return normalizedPath.slice(normalizedCwd.length + 1);
  }
  return normalizedPath;
}
