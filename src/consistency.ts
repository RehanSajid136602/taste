import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { guardReadPath } from "./path-safety.js";
import { loadProjectMap, type ProjectMap } from "./project-map.js";
import { readEditReceipts, readShellReceipts, type EditReceipt, type ShellReceipt } from "./receipts.js";

const REPAIR_DIR = ".repair-mcp";
const BUILD_COMMAND_RE = /\b(build|lint|typecheck|tsc|test)\b/i;
const BUILD_PASS_RE = /\b(build|lint|typecheck|tsc|test).*(passed|succeeded|success|green)|\bpassed\b/i;
const BUILD_FAIL_RE = /\b(build|lint|typecheck|tsc|test).*(failed|failing|errored|broken)|\bfailed\b/i;

function readOptionalText(path: string, maxChars = 6000): string | null {
  if (!existsSync(path)) return null;
  try {
    const st = statSync(path);
    if (!st.isFile()) return null;
    return readFileSync(path, "utf-8").slice(0, maxChars);
  } catch {
    return null;
  }
}

function readOptionalJson(path: string): unknown | null {
  const text = readOptionalText(path, 100000);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countKeys(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

export interface WarmupSummary {
  loadedFiles: string[];
  missingOptionalFiles: string[];
  summary: string;
  rulesAliases: number;
  totalToolCalls: number;
  totalRepairs: number;
  suggestedAliasTools: number;
  hasProjectRules: boolean;
  hasProjectMap: boolean;
}

export function sessionWarmup(): WarmupSummary {
  const loadedFiles: string[] = [];
  const missingOptionalFiles: string[] = [];
  const rules = readOptionalJson(join(REPAIR_DIR, "taste-rules.json")) as Record<string, unknown> | null;
  const stats = readOptionalJson(join(REPAIR_DIR, "taste-stats.json")) as Record<string, unknown> | null;
  const suggestions = readOptionalJson(join(REPAIR_DIR, "taste-suggestions.json")) as Record<string, unknown> | null;
  const report = readOptionalText(join(REPAIR_DIR, "taste-report.md"));
  const projectRules = readOptionalText(join(REPAIR_DIR, "project-rules.md"));
  const projectMap = readOptionalJson(join(REPAIR_DIR, "project-map.json")) as ProjectMap | null;

  for (const [file, value] of [
    ["taste-rules.json", rules],
    ["taste-stats.json", stats],
    ["taste-suggestions.json", suggestions],
    ["taste-report.md", report],
    ["project-rules.md", projectRules],
    ["project-map.json", projectMap],
  ] as const) {
    if (value) loadedFiles.push(`${REPAIR_DIR}/${file}`);
    else if (["taste-report.md", "project-rules.md", "project-map.json"].includes(file)) missingOptionalFiles.push(`${REPAIR_DIR}/${file}`);
  }

  const globalAliases = (rules?.globalAliases as Record<string, string> | undefined) ?? {};
  const toolRules = (rules?.tools as Record<string, unknown> | undefined) ?? {};
  const suggestedAliases = (suggestions?.suggestedAliases as Record<string, unknown> | undefined) ?? {};
  const totalToolCalls = Number(stats?.totalToolCalls ?? 0);
  const totalRepairs = Number(stats?.totalRepairs ?? 0);
  const framework = projectMap?.detectedFramework ?? "unknown";
  const packageManager = projectMap?.packageManager ?? "unknown";

  return {
    loadedFiles,
    missingOptionalFiles,
    rulesAliases: countKeys(globalAliases) + Object.values(toolRules).reduce((sum, rule) => {
      const aliases = (rule as { aliases?: Record<string, string> })?.aliases;
      return sum + countKeys(aliases);
    }, 0),
    totalToolCalls,
    totalRepairs,
    suggestedAliasTools: countKeys(suggestedAliases),
    hasProjectRules: Boolean(projectRules),
    hasProjectMap: Boolean(projectMap),
    summary: [
      `Loaded ${loadedFiles.length} taste context file(s).`,
      `Known alias rules: ${countKeys(globalAliases)} global plus tool-specific aliases.`,
      `Prior tool calls: ${totalToolCalls}; repairs: ${totalRepairs}.`,
      `Project map: ${projectMap ? `${framework} using ${packageManager}` : "not generated yet"}.`,
      projectRules ? "Project rules are available and should constrain claims and edits." : "No project-rules.md found yet.",
      report ? "Latest taste-report.md was included; logs.jsonl was intentionally not read." : "No taste-report.md found; logs.jsonl was intentionally not read.",
    ].join("\n"),
  };
}

export interface BuildGateResult {
  latestBuildCommand: string | null;
  exitCode: number | null;
  success: boolean;
  timestamp: string | null;
  allowedToClaimBuildPassed: boolean;
}

export function buildGate(): BuildGateResult {
  const receipts = readShellReceipts().filter((receipt) => BUILD_COMMAND_RE.test(receipt.command));
  const latest = receipts.at(-1);
  if (!latest) {
    return { latestBuildCommand: null, exitCode: null, success: false, timestamp: null, allowedToClaimBuildPassed: false };
  }
  return {
    latestBuildCommand: latest.command,
    exitCode: latest.exitCode,
    success: latest.success,
    timestamp: latest.timestamp,
    allowedToClaimBuildPassed: latest.success && latest.exitCode === 0 && !latest.blocked,
  };
}

export type ClaimStatus = "verified" | "not_verified" | "contradicted";

export interface ClaimVerification {
  claim: string;
  status: ClaimStatus;
  evidence: string[];
  recommendedWording: string;
}

function extractMentionedFiles(claim: string, map: ProjectMap | null): string[] {
  const fileLike = claim.match(/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g) ?? [];
  const mapped = map
    ? [...map.routesPages, ...map.components, ...map.configFiles, ...map.styleFiles, ...map.envExampleFiles]
        .filter((file) => claim.includes(file))
    : [];
  return Array.from(new Set([...fileLike, ...mapped]));
}

function latestEditForFile(filePath: string, edits: EditReceipt[]): EditReceipt | undefined {
  return [...edits].reverse().find((receipt) => receipt.filePath === filePath || receipt.filePath.endsWith(filePath));
}

function verifyFileEditClaim(claim: string, edits: EditReceipt[], map: ProjectMap | null): ClaimVerification | null {
  const files = extractMentionedFiles(claim, map);
  if (files.length === 0) return null;
  const evidence: string[] = [];
  let anyVerified = false;
  let anyContradicted = false;

  for (const file of files) {
    const safe = guardReadPath(file);
    const edit = latestEditForFile(file, edits);
    if (edit?.changed) {
      evidence.push(`Edit receipt found for ${edit.filePath} at ${edit.timestamp}`);
      anyVerified = true;
    } else if (safe.ok) {
      evidence.push(`File exists: ${file}, but no edit receipt verifies this session changed it`);
    } else {
      evidence.push(`File not found or unsafe: ${file}`);
      anyContradicted = true;
    }
  }

  if (anyVerified) {
    return { claim, status: "verified", evidence, recommendedWording: claim };
  }
  if (anyContradicted && /\b(updated|changed|edited|created|fixed)\b/i.test(claim)) {
    return { claim, status: "contradicted", evidence, recommendedWording: `I could not verify this file claim: ${claim}` };
  }
  return { claim, status: "not_verified", evidence, recommendedWording: `Not verified: ${claim}` };
}

function verifyBuildClaim(claim: string): ClaimVerification | null {
  if (!BUILD_PASS_RE.test(claim) && !BUILD_FAIL_RE.test(claim)) return null;
  const gate = buildGate();
  const evidence = gate.latestBuildCommand
    ? [`Latest build-like command: ${gate.latestBuildCommand}`, `exitCode=${gate.exitCode}`, `timestamp=${gate.timestamp}`]
    : ["No build/lint/typecheck shell receipt found"];

  if (BUILD_PASS_RE.test(claim)) {
    if (gate.allowedToClaimBuildPassed) {
      return { claim, status: "verified", evidence, recommendedWording: claim };
    }
    return { claim, status: gate.latestBuildCommand ? "contradicted" : "not_verified", evidence, recommendedWording: "Build/lint/typecheck not verified as passed." };
  }

  if (BUILD_FAIL_RE.test(claim)) {
    if (gate.latestBuildCommand && !gate.success) {
      return { claim, status: "verified", evidence, recommendedWording: claim };
    }
    return { claim, status: "not_verified", evidence, recommendedWording: `Not verified: ${claim}` };
  }

  return null;
}

function verifyBroadClaim(claim: string, edits: EditReceipt[], shells: ShellReceipt[]): ClaimVerification {
  const evidence: string[] = [];
  if (/\b(all|every|fixed all|no remaining|fully)\b/i.test(claim)) {
    evidence.push("Broad completion claims require targeted checks; receipts alone cannot prove this.");
    return { claim, status: "not_verified", evidence, recommendedWording: `Not verified: ${claim}` };
  }
  if (/\b(command|ran|executed)\b/i.test(claim) && shells.length > 0) {
    const latest = shells.at(-1)!;
    evidence.push(`Latest shell receipt: ${latest.command} exitCode=${latest.exitCode}`);
    return { claim, status: "verified", evidence, recommendedWording: claim };
  }
  if (/\b(updated|changed|edited|created|fixed)\b/i.test(claim) && edits.some((edit) => edit.changed)) {
    evidence.push(`${edits.filter((edit) => edit.changed).length} changed edit receipt(s) exist, but no exact file target was detected.`);
    return { claim, status: "not_verified", evidence, recommendedWording: `Partially evidenced but not verified: ${claim}` };
  }
  evidence.push("No receipt or file evidence matched this claim.");
  return { claim, status: "not_verified", evidence, recommendedWording: `Not verified: ${claim}` };
}

export function verifyClaims(claims: string[]): ClaimVerification[] {
  const edits = readEditReceipts();
  const shells = readShellReceipts();
  const map = loadProjectMap();
  return claims.map((claim) => {
    const build = verifyBuildClaim(claim);
    if (build) return build;
    const fileEdit = verifyFileEditClaim(claim, edits, map);
    if (fileEdit) return fileEdit;
    return verifyBroadClaim(claim, edits, shells);
  });
}

export interface FinalReportGateResult {
  changedFiles: string[];
  commandsRun: { command: string; exitCode: number | null; success: boolean; timestamp: string }[];
  buildStatus: BuildGateResult;
  unverifiedClaims: ClaimVerification[];
  remainingRisks: string[];
  receiptsSummary: { editReceipts: number; shellReceipts: number; changedEditReceipts: number };
  reportMarkdown: string;
}

export function finalReportGate(claims: string[] = []): FinalReportGateResult {
  const edits = readEditReceipts();
  const shells = readShellReceipts();
  const verifications = claims.length > 0 ? verifyClaims(claims) : [];
  const unverifiedClaims = verifications.filter((item) => item.status !== "verified");
  const changedFiles = Array.from(new Set(edits.filter((edit) => edit.changed).map((edit) => edit.filePath)));
  const buildStatus = buildGate();
  const commandsRun = shells.slice(-20).map((receipt) => ({
    command: receipt.command,
    exitCode: receipt.exitCode,
    success: receipt.success,
    timestamp: receipt.timestamp,
  }));
  const remainingRisks = [
    ...(!buildStatus.allowedToClaimBuildPassed ? ["Build/lint/typecheck has not been verified as passing by repair_build_gate."] : []),
    ...(unverifiedClaims.length > 0 ? [`${unverifiedClaims.length} claim(s) are not verified or contradicted.`] : []),
  ];

  const reportMarkdown = [
    "Changed files:",
    changedFiles.length ? changedFiles.map((file) => `- ${file}`).join("\n") : "- None recorded",
    "",
    "Commands run:",
    commandsRun.length ? commandsRun.map((cmd) => `- ${cmd.command} (exit ${cmd.exitCode}, ${cmd.success ? "success" : "failure"})`).join("\n") : "- None recorded",
    "",
    `Build status: ${buildStatus.allowedToClaimBuildPassed ? "verified passed" : "not verified passed"}`,
    "",
    "Unverified claims:",
    unverifiedClaims.length ? unverifiedClaims.map((item) => `- ${item.claim}: ${item.status}`).join("\n") : "- None",
    "",
    "Remaining risks:",
    remainingRisks.length ? remainingRisks.map((risk) => `- ${risk}`).join("\n") : "- None recorded",
  ].join("\n");

  return {
    changedFiles,
    commandsRun,
    buildStatus,
    unverifiedClaims,
    remainingRisks,
    receiptsSummary: {
      editReceipts: edits.length,
      shellReceipts: shells.length,
      changedEditReceipts: edits.filter((edit) => edit.changed).length,
    },
    reportMarkdown,
  };
}
