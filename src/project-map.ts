import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ensureDir } from "./filesystem.js";

const REPAIR_DIR = ".repair-mcp";
const PROJECT_MAP_FILE = join(REPAIR_DIR, "project-map.json");
const MAX_FILES = 2000;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", ".repair-mcp", "coverage"]);

export interface ProjectMap {
  generatedAt: string;
  root: string;
  detectedFramework: string;
  packageManager: string;
  packageScripts: Record<string, string>;
  importantFolders: string[];
  routesPages: string[];
  components: string[];
  configFiles: string[];
  styleFiles: string[];
  envExampleFiles: string[];
}

function safeReadJson(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function walk(dir: string, root: string, results: string[]): void {
  if (results.length >= MAX_FILES) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    const rel = relative(root, full).replace(/\\/g, "/");
    if (st.isDirectory()) {
      results.push(`${rel}/`);
      walk(full, root, results);
    } else {
      results.push(rel);
    }
  }
}

function detectPackageManager(root: string): string {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "unknown";
}

function detectFramework(pkg: Record<string, unknown> | null, files: string[]): string {
  const deps = {
    ...((pkg?.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkg?.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  if (deps.next || files.some((f) => f === "next.config.js" || f === "next.config.mjs" || f === "next.config.ts")) return "Next.js";
  if (deps.vite || files.some((f) => f.startsWith("vite.config."))) return "Vite";
  if (deps.react) return "React";
  if (deps.vue) return "Vue";
  if (deps.svelte) return "Svelte";
  if (deps.express) return "Express";
  if (deps["@modelcontextprotocol/sdk"]) return "MCP TypeScript server";
  if (files.includes("package.json")) return "Node.js";
  return "unknown";
}

function isRouteOrPage(file: string): boolean {
  return /(^|\/)(app|pages|routes)\/.+\.(tsx|ts|jsx|js|svelte|vue)$/.test(file)
    || /(^|\/)src\/app\/.+\.(tsx|ts|jsx|js)$/.test(file);
}

function isComponent(file: string): boolean {
  return /(^|\/)(components|ui)\/.+\.(tsx|jsx|vue|svelte)$/.test(file)
    || /(^|\/)src\/components\/.+\.(tsx|jsx)$/.test(file);
}

function isConfig(file: string): boolean {
  return /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|vite\.config\.|next\.config\.|tailwind\.config\.|postcss\.config\.|eslint\.config\.|\.eslintrc|prettier\.config\.|\.prettierrc|mcp\.json)/.test(file);
}

function isStyle(file: string): boolean {
  return /\.(css|scss|sass|less)$/.test(file) || /(^|\/)tailwind\.config\./.test(file);
}

function isEnvExample(file: string): boolean {
  return /(^|\/)\.env\.example$/.test(file) || /(^|\/)\.env\.[^/]*example$/.test(file) || /(^|\/)example\.env$/.test(file);
}

export function generateProjectMap(root = process.cwd()): ProjectMap {
  const files: string[] = [];
  walk(root, root, files);
  const pkg = safeReadJson(join(root, "package.json"));
  const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
  const folders = files.filter((f) => f.endsWith("/")).filter((f) => {
    const depth = f.split("/").filter(Boolean).length;
    return depth <= 2;
  });

  const map: ProjectMap = {
    generatedAt: new Date().toISOString(),
    root,
    detectedFramework: detectFramework(pkg, files),
    packageManager: detectPackageManager(root),
    packageScripts: scripts,
    importantFolders: folders.slice(0, 80),
    routesPages: files.filter(isRouteOrPage).slice(0, 200),
    components: files.filter(isComponent).slice(0, 200),
    configFiles: files.filter(isConfig).slice(0, 120),
    styleFiles: files.filter(isStyle).slice(0, 120),
    envExampleFiles: files.filter(isEnvExample).slice(0, 40),
  };

  ensureDir(REPAIR_DIR);
  writeFileSync(PROJECT_MAP_FILE, JSON.stringify(map, null, 2) + "\n", "utf-8");
  return map;
}

export function loadProjectMap(): ProjectMap | null {
  if (!existsSync(PROJECT_MAP_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PROJECT_MAP_FILE, "utf-8")) as ProjectMap;
  } catch {
    return null;
  }
}
