import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { redact, redactDeep } from "./security.js";

const REPAIR_DIR = ".repair-mcp";
const EDIT_RECEIPTS_FILE = join(REPAIR_DIR, "edit-receipts.jsonl");
const SHELL_RECEIPTS_FILE = join(REPAIR_DIR, "shell-receipts.jsonl");

export interface EditReceipt {
  timestamp: string;
  tool: string;
  filePath: string;
  operation: "write" | "patch";
  changed: boolean;
  beforeHash: string | null;
  afterHash: string | null;
  summary: string;
  sanitizedArgs: Record<string, unknown>;
}

export interface ShellReceipt {
  timestamp: string;
  command: string;
  exitCode: number | null;
  success: boolean;
  durationMs: number;
  outputSummary: string;
  blocked: boolean;
}

function ensureRepairDir(): void {
  if (!existsSync(REPAIR_DIR)) mkdirSync(REPAIR_DIR, { recursive: true });
}

export function hashContent(content: string | null): string | null {
  if (content === null) return null;
  return createHash("sha256").update(content).digest("hex");
}

export function hashFileIfExists(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return hashContent(readFileSync(filePath, "utf-8"));
}

export function summarizeText(text: string, maxLength = 500): string {
  const compact = redact(text).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

export function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized = redactDeep(args) as Record<string, unknown>;
  if (typeof sanitized.content === "string") {
    sanitized.content = `[content ${sanitized.content.length} chars]`;
  }
  if (typeof sanitized.newValue === "string") {
    sanitized.newValue = `[newValue ${sanitized.newValue.length} chars]`;
  }
  if (typeof sanitized.oldValue === "string") {
    sanitized.oldValue = `[oldValue ${sanitized.oldValue.length} chars]`;
  }
  return sanitized;
}

export function appendEditReceipt(receipt: EditReceipt): void {
  ensureRepairDir();
  appendFileSync(EDIT_RECEIPTS_FILE, JSON.stringify(receipt) + "\n", "utf-8");
}

export function appendShellReceipt(receipt: ShellReceipt): void {
  ensureRepairDir();
  appendFileSync(SHELL_RECEIPTS_FILE, JSON.stringify(receipt) + "\n", "utf-8");
}

export function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const entries: T[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as T);
    } catch {
      // Skip malformed receipt lines instead of failing consistency checks.
    }
  }
  return entries;
}

export function readEditReceipts(): EditReceipt[] {
  return readJsonl<EditReceipt>(EDIT_RECEIPTS_FILE);
}

export function readShellReceipts(): ShellReceipt[] {
  return readJsonl<ShellReceipt>(SHELL_RECEIPTS_FILE);
}

export function resetReceiptFilesForTests(): void {
  ensureRepairDir();
  writeFileSync(EDIT_RECEIPTS_FILE, "", "utf-8");
  writeFileSync(SHELL_RECEIPTS_FILE, "", "utf-8");
}
