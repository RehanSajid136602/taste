import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { redactDeep } from "./security.js";

const LOG_DIR = ".repair-mcp";
const LOG_FILE = join(LOG_DIR, "logs.jsonl");
const SUGGESTIONS_FILE = join(LOG_DIR, "taste-suggestions.json");

const LOG_MAX_BYTES = (parseInt(process.env.REPAIR_MCP_MAX_LOG_MB ?? "5", 10) || 5) * 1024 * 1024;
const MAX_ROTATED = 10;

export interface LogEntry {
  timestamp: string;
  model: string;
  tool: string;
  repairApplied: boolean;
  repairTypes: string[];
  beforeSanitized: Record<string, unknown>;
  afterSanitized: Record<string, unknown>;
  notice: string;
}

export interface SuggestionEntry {
  suggestedAliases: Record<string, Record<string, string>>;
}

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded(): void {
  ensureDir();
  if (!existsSync(LOG_FILE)) return;
  try {
    const size = statSync(LOG_FILE).size;
    if (size < LOG_MAX_BYTES) return;

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
    const rotatedName = `logs-${ts}.jsonl`;
    renameSync(LOG_FILE, join(LOG_DIR, rotatedName));

    const logs: { name: string; ctime: Date }[] = [];
    for (const f of readdirSync(LOG_DIR)) {
      if (f.startsWith("logs-") && f.endsWith(".jsonl") && f !== `logs-${ts}.jsonl`) {
        try {
          const st = statSync(join(LOG_DIR, f));
          logs.push({ name: f, ctime: st.birthtime || st.mtime });
        } catch { /* skip */ }
      }
    }
    logs.sort((a, b) => b.ctime.getTime() - a.ctime.getTime());
    for (const old of logs.slice(MAX_ROTATED - 1)) {
      try { unlinkSync(join(LOG_DIR, old.name)); } catch { /* ignore */ }
    }
  } catch { /* ignore rotation errors */ }
}

export function logRepair(
  toolName: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  repairs: string[],
  repairTypes: string[],
  notice: string,
): void {
  rotateIfNeeded();
  ensureDir();
  const model = process.env.REPAIR_MCP_MODEL_NAME ?? "unknown";
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    model,
    tool: toolName,
    repairApplied: repairs.length > 0,
    repairTypes,
    beforeSanitized: redactDeep(before) as Record<string, unknown>,
    afterSanitized: redactDeep(after) as Record<string, unknown>,
    notice,
  };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
}

export function readAllLogs(): LogEntry[] {
  ensureDir();
  const entries: LogEntry[] = [];
  const files = [LOG_FILE];
  if (existsSync(LOG_DIR)) {
    for (const f of readdirSync(LOG_DIR)) {
      if (f.startsWith("logs-") && f.endsWith(".jsonl")) {
        files.push(join(LOG_DIR, f));
      }
    }
  }
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf-8");
      for (const line of content.trim().split("\n")) {
        if (!line) continue;
        try { entries.push(JSON.parse(line)); } catch { /* skip malformed line */ }
      }
    } catch { /* skip unreadable file */ }
  }
  return entries;
}

export function loadSuggestions(): SuggestionEntry {
  if (existsSync(SUGGESTIONS_FILE)) {
    try {
      return JSON.parse(readFileSync(SUGGESTIONS_FILE, "utf-8"));
    } catch { /* fall through */ }
  }
  return { suggestedAliases: {} };
}

export function saveSuggestions(s: SuggestionEntry): void {
  ensureDir();
  writeFileSync(SUGGESTIONS_FILE, JSON.stringify(s, null, 2), "utf-8");
}
