import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { withTasteHarness } from "./taste-harness.js";
import { ensureStartupFiles } from "./setup.js";
import {
  shellSchema,
  readFileSchema,
  writeFileSchema,
  patchFileSchema,
  listFilesSchema,
  emptySchema,
  verifyClaimsSchema,
  finalReportGateSchema,
  zodToJsonSchema,
} from "./schemas.js";
import { listRecursive } from "./filesystem.js";
import { guardPatchPath, guardReadPath, guardWritePath, relativeDisplayPath, resolveSafePath } from "./path-safety.js";
import {
  appendEditReceipt,
  appendShellReceipt,
  hashContent,
  hashFileIfExists,
  sanitizeArgs,
  summarizeText,
} from "./receipts.js";
import { generateProjectMap } from "./project-map.js";
import { buildGate, finalReportGate, sessionWarmup, verifyClaims } from "./consistency.js";

interface ToolDef {
  description: string;
  schema: z.ZodTypeAny;
  executor: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function shellExitCode(status: number | null, signal: NodeJS.Signals | null, error?: Error): number | null {
  if (typeof status === "number") return status;
  if (signal || error) return 1;
  return null;
}

const tools: Record<string, ToolDef> = {
  repair_shell: {
    description: "Execute a shell command with repair-based safety checks",
    schema: shellSchema,
    executor: async (args) => {
      const { command, cwd, timeout } = args as z.infer<typeof shellSchema>;
      const started = Date.now();
      if (args._dangerous) {
        const message = (args._blocked as string) ?? "Command blocked by safety check";
        appendShellReceipt({
          timestamp: new Date().toISOString(),
          command: summarizeText(command),
          exitCode: null,
          success: false,
          durationMs: Date.now() - started,
          outputSummary: summarizeText(message),
          blocked: true,
        });
        return errorResult(message);
      }

      const result = spawnSync(command, {
        cwd,
        timeout,
        encoding: "utf-8",
        shell: true,
        maxBuffer: 1024 * 1024,
      });
      const exitCode = shellExitCode(result.status, result.signal, result.error ?? undefined);
      const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
      const success = exitCode === 0;
      appendShellReceipt({
        timestamp: new Date().toISOString(),
        command: summarizeText(command),
        exitCode,
        success,
        durationMs: Date.now() - started,
        outputSummary: summarizeText(output),
        blocked: false,
      });

      if (!success) return errorResult(output || `Command failed with exit code ${exitCode}`);
      return textResult(result.stdout ?? "");
    },
  },
  repair_read_file: {
    description: "Read a file's contents",
    schema: readFileSchema,
    executor: async (args) => {
      const { filePath, offset, limit } = args as z.infer<typeof readFileSchema>;
      const safe = guardReadPath(filePath);
      if (!safe.ok || !safe.absolutePath) return errorResult(safe.error ?? safe.warning ?? `Unsafe path: ${filePath}`);
      try {
        const content = readFileSync(safe.absolutePath, "utf-8");
        const lines = content.split("\n");
        const start = offset ? Math.max(0, offset - 1) : 0;
        const end = limit ? start + limit : lines.length;
        return textResult(lines.slice(start, end).join("\n"));
      } catch (e: unknown) {
        return errorResult(String(e));
      }
    },
  },
  repair_write_file: {
    description: "Write content to a file after path-safety checks and create an edit receipt",
    schema: writeFileSchema,
    executor: async (args) => {
      const { filePath, content } = args as z.infer<typeof writeFileSchema>;
      const safe = guardWritePath(filePath);
      if (!safe.ok || !safe.absolutePath) return errorResult(safe.error ?? safe.warning ?? `Unsafe path: ${filePath}`);
      try {
        const beforeHash = hashFileIfExists(safe.absolutePath);
        const afterHash = hashContent(content);
        const changed = beforeHash !== afterHash;
        writeFileSync(safe.absolutePath, content, "utf-8");
        appendEditReceipt({
          timestamp: new Date().toISOString(),
          tool: "repair_write_file",
          filePath: relativeDisplayPath(safe.absolutePath),
          operation: "write",
          changed,
          beforeHash,
          afterHash,
          summary: changed ? `Wrote ${content.length} bytes to ${filePath}` : `No content change for ${filePath}`,
          sanitizedArgs: sanitizeArgs(args),
        });
        return textResult(`Wrote ${content.length} bytes to ${filePath}`);
      } catch (e: unknown) {
        return errorResult(String(e));
      }
    },
  },
  repair_patch_file: {
    description: "Apply a find-and-replace patch to an existing file and create an edit receipt",
    schema: patchFileSchema,
    executor: async (args) => {
      const { filePath, oldValue, newValue, replaceAll } = args as z.infer<typeof patchFileSchema>;
      const safe = guardPatchPath(filePath);
      if (!safe.ok || !safe.absolutePath) return errorResult(safe.error ?? safe.warning ?? `Unsafe path: ${filePath}`);
      try {
        const before = readFileSync(safe.absolutePath, "utf-8");
        let result: string;
        let count = 0;
        if (replaceAll) {
          const parts = before.split(oldValue);
          count = parts.length - 1;
          result = parts.join(newValue);
        } else {
          const idx = before.indexOf(oldValue);
          if (idx === -1) return errorResult(`oldValue not found in ${filePath}`);
          count = 1;
          result = before.slice(0, idx) + newValue + before.slice(idx + oldValue.length);
        }
        const beforeHash = hashContent(before);
        const afterHash = hashContent(result);
        const changed = beforeHash !== afterHash;
        writeFileSync(safe.absolutePath, result, "utf-8");
        appendEditReceipt({
          timestamp: new Date().toISOString(),
          tool: "repair_patch_file",
          filePath: relativeDisplayPath(safe.absolutePath),
          operation: "patch",
          changed,
          beforeHash,
          afterHash,
          summary: `Applied ${count} replacement(s) to ${filePath}`,
          sanitizedArgs: sanitizeArgs(args),
        });
        return textResult(`Applied ${count} replacement(s) to ${filePath}`);
      } catch (e: unknown) {
        return errorResult(String(e));
      }
    },
  },
  repair_list_files: {
    description: "List files in a directory (recursive by default)",
    schema: listFilesSchema,
    executor: async (args) => {
      const { filePath, pattern, excludePatterns } = args as z.infer<typeof listFilesSchema>;
      const safe = resolveSafePath(filePath);
      if (!safe.ok || !safe.absolutePath) return errorResult(safe.error ?? `Unsafe path: ${filePath}`);
      if (!existsSync(safe.absolutePath)) return errorResult(`Directory does not exist: ${filePath}`);
      try {
        const entries = listRecursive(safe.absolutePath);
        let filtered = entries;
        if (pattern) {
          const regex = new RegExp(pattern);
          filtered = filtered.filter((f) => regex.test(f));
        }
        if (excludePatterns && excludePatterns.length > 0) {
          const excludeRegexes = excludePatterns.map((p) => new RegExp(p));
          filtered = filtered.filter((f) => !excludeRegexes.some((r) => r.test(f)));
        }
        return textResult(filtered.join("\n"));
      } catch (e: unknown) {
        return errorResult(String(e));
      }
    },
  },
  repair_session_warmup: {
    description: "Read local Taste MCP context files and summarize session consistency guidance without reading logs.jsonl",
    schema: emptySchema,
    executor: async () => textResult(sessionWarmup()),
  },
  repair_project_map: {
    description: "Scan the current project and create .repair-mcp/project-map.json without reading real env values",
    schema: emptySchema,
    executor: async () => textResult(generateProjectMap()),
  },
  repair_build_gate: {
    description: "Check latest build/lint/typecheck shell receipt and decide whether build-passed claims are allowed",
    schema: emptySchema,
    executor: async () => textResult(buildGate()),
  },
  repair_verify_claims: {
    description: "Verify final-response claims using edit receipts, shell receipts, project map, and file existence",
    schema: verifyClaimsSchema,
    executor: async (args) => {
      const { claims } = args as z.infer<typeof verifyClaimsSchema>;
      return textResult(verifyClaims(claims));
    },
  },
  repair_final_report_gate: {
    description: "Produce an evidence-backed final report gate with changed files, commands, build status, risks, and receipt summary",
    schema: finalReportGateSchema,
    executor: async (args) => {
      const { claims } = args as z.infer<typeof finalReportGateSchema>;
      return textResult(finalReportGate(claims ?? []));
    },
  },
};

const TOOL_NAMES = new Set(Object.keys(tools));

const server = new Server(
  { name: "repair-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolList = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: t.schema instanceof z.ZodObject
      ? zodToJsonSchema(t.schema)
      : { type: "object", properties: {} },
  }));
  return { tools: toolList };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: rawArgs } = request.params;
  if (!name || !TOOL_NAMES.has(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const tool = tools[name];
  return withTasteHarness({
    toolName: name,
    rawArgs: (rawArgs ?? {}) as Record<string, unknown>,
    schema: tool.schema,
    executor: tool.executor,
  });
});

async function main(): Promise<void> {
  ensureStartupFiles();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
