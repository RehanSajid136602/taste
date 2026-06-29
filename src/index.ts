import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { withTasteHarness } from "./taste-harness.js";
import { ensureStartupFiles } from "./setup.js";
import {
  shellSchema,
  readFileSchema,
  writeFileSchema,
  patchFileSchema,
  listFilesSchema,
  zodToJsonSchema,
} from "./schemas.js";
import { listRecursive } from "./filesystem.js";

// Tool executors

interface ToolDef {
  description: string;
  schema: z.ZodTypeAny;
  executor: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

const tools: Record<string, ToolDef> = {
  repair_shell: {
    description: "Execute a shell command with repair-based safety checks",
    schema: shellSchema,
    executor: async (args) => {
      const { command, cwd, timeout } = args as z.infer<typeof shellSchema>;
      if (args._dangerous) {
        return {
          isError: true,
          content: [{ type: "text", text: (args._blocked as string) ?? "Command blocked by safety check" }],
        };
      }
      const opts: { cwd?: string; timeout?: number; encoding?: "utf-8" } = { encoding: "utf-8" };
      if (cwd) opts.cwd = cwd;
      if (timeout) opts.timeout = timeout;
      try {
        const stdout = execSync(command, opts).toString();
        return { content: [{ type: "text", text: stdout }] };
      } catch (e: unknown) {
        const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
        return {
          isError: true,
          content: [{ type: "text", text: err.stderr?.toString() ?? err.stdout?.toString() ?? String(e) }],
        };
      }
    },
  },
  repair_read_file: {
    description: "Read a file's contents",
    schema: readFileSchema,
    executor: async (args) => {
      const { filePath, offset, limit } = args as z.infer<typeof readFileSchema>;
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const start = offset ? Math.max(0, offset - 1) : 0;
        const end = limit ? start + limit : lines.length;
        const snippet = lines.slice(start, end).join("\n");
        return { content: [{ type: "text", text: snippet }] };
      } catch (e: unknown) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    },
  },
  repair_write_file: {
    description: "Write content to a file (creates parent directories if needed)",
    schema: writeFileSchema,
    executor: async (args) => {
      const { filePath, content } = args as z.infer<typeof writeFileSchema>;
      try {
        const dir = resolve(filePath, "..");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, content, "utf-8");
        return { content: [{ type: "text", text: `Wrote ${content.length} bytes to ${filePath}` }] };
      } catch (e: unknown) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    },
  },
  repair_patch_file: {
    description: "Apply a find-and-replace patch to a file",
    schema: patchFileSchema,
    executor: async (args) => {
      const { filePath, oldValue, newValue, replaceAll } = args as z.infer<typeof patchFileSchema>;
      try {
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
            return { isError: true, content: [{ type: "text", text: `oldValue not found in ${filePath}` }] };
          }
          count = 1;
          result = content.slice(0, idx) + newValue + content.slice(idx + oldValue.length);
        }
        writeFileSync(filePath, result, "utf-8");
        return { content: [{ type: "text", text: `Applied ${count} replacement(s) to ${filePath}` }] };
      } catch (e: unknown) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    },
  },
  repair_list_files: {
    description: "List files in a directory (recursive by default)",
    schema: listFilesSchema,
    executor: async (args) => {
      const { filePath, pattern, excludePatterns } = args as z.infer<typeof listFilesSchema>;
      try {
        const entries = listRecursive(filePath);
        let filtered = entries;
        if (pattern) {
          const regex = new RegExp(pattern);
          filtered = filtered.filter((f) => regex.test(f));
        }
        if (excludePatterns && excludePatterns.length > 0) {
          const excludeRegexes = excludePatterns.map((p) => new RegExp(p));
          filtered = filtered.filter((f) => !excludeRegexes.some((r) => r.test(f)));
        }
        return { content: [{ type: "text", text: filtered.join("\n") }] };
      } catch (e: unknown) {
        return { isError: true, content: [{ type: "text", text: String(e) }] };
      }
    },
  },
};

const TOOL_NAMES = new Set(Object.keys(tools));

// Server

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
  // Ensure .repair-mcp and default files exist at startup
  ensureStartupFiles();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
