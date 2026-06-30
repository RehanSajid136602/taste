import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureStartupFiles } from "./setup.js";
import { guardPatchPath, guardReadPath, guardWritePath } from "./path-safety.js";
import { generateProjectMap } from "./project-map.js";
import {
  appendEditReceipt,
  appendShellReceipt,
  hashContent,
  readEditReceipts,
  readShellReceipts,
  resetReceiptFilesForTests,
} from "./receipts.js";
import { buildGate, finalReportGate, verifyClaims } from "./consistency.js";

let pass = 0;
let fail = 0;

function assert(condition: unknown, label: string): void {
  if (condition) {
    console.log(`ok - ${label}`);
    pass++;
  } else {
    console.error(`not ok - ${label}`);
    fail++;
  }
}

function main(): void {
  ensureStartupFiles();
  resetReceiptFilesForTests();

  const map = generateProjectMap();
  assert(existsSync(".repair-mcp/project-map.json"), "project map file generated");
  assert(map.packageManager === "pnpm", "project map detects pnpm");
  assert(Boolean(map.packageScripts.build), "project map includes package scripts");
  assert(map.configFiles.includes("package.json"), "project map includes config files");

  assert(!guardReadPath("../package.json").ok, "path traversal blocked for read");
  assert(!guardWritePath("missing-parent/new.txt").ok, "write requires existing parent folder");
  assert(!guardPatchPath("does-not-exist.txt").ok, "patch requires existing file");

  const receiptFile = "/tmp/repair-mcp-consistency-test.txt";
  const nextContent = `after-${Date.now()}`;
  const before = existsSync(receiptFile) ? readFileSync(receiptFile, "utf-8") : "";
  writeFileSync(receiptFile, nextContent, "utf-8");
  appendEditReceipt({
    timestamp: new Date().toISOString(),
    tool: "repair_write_file",
    filePath: receiptFile,
    operation: "write",
    changed: before !== nextContent,
    beforeHash: before ? hashContent(before) : null,
    afterHash: hashContent(nextContent),
    summary: "test write receipt",
    sanitizedArgs: { filePath: receiptFile, content: `[content ${nextContent.length} chars]` },
  });
  assert(readEditReceipts().length === 1, "edit receipt recorded");

  appendShellReceipt({
    timestamp: new Date().toISOString(),
    command: "pnpm build",
    exitCode: 1,
    success: false,
    durationMs: 10,
    outputSummary: "failed",
    blocked: false,
  });
  assert(!buildGate().allowedToClaimBuildPassed, "build gate rejects failed build");

  appendShellReceipt({
    timestamp: new Date().toISOString(),
    command: "pnpm build",
    exitCode: 0,
    success: true,
    durationMs: 10,
    outputSummary: "passed",
    blocked: false,
  });
  assert(buildGate().allowedToClaimBuildPassed, "build gate accepts latest successful build");
  assert(readShellReceipts().length === 2, "shell receipts recorded");

  const verified = verifyClaims([`I updated ${receiptFile}`])[0];
  assert(verified.status === "verified", "claim verifier verifies edited file claim");

  const unverified = verifyClaims(["I fixed all broken icons"])[0];
  assert(unverified.status === "not_verified", "claim verifier marks broad claim unverified");

  const finalReport = finalReportGate([`I updated ${receiptFile}`, "I fixed all broken icons"]);
  assert(finalReport.changedFiles.includes(receiptFile), "final report includes changed files");
  assert(finalReport.unverifiedClaims.length === 1, "final report lists unverified claims");

  console.log(`Passed: ${pass} Failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main();
