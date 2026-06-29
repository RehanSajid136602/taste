export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\//,
  /\bsudo\s+rm\b/,
  /\bmkfs\b/,
  /\bdd\s+if=\//,
  /\bchmod\s+-R\s+777\s+\//,
  /\bcurl\b.*\|\s*(sh|bash|zsh)\b/,
  /\bwget\b.*\|\s*(sh|bash|zsh)\b/,
];

export const SECRET_PATTERNS: RegExp[] = [
  /(api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/gi,
  /(secret|token|password|passwd|auth|bearer|jwt|session|refresh)[:=]\s*['"]?[A-Za-z0-9_\-\.]{8,}/gi,
  /(authorization|set-cookie|x-api-key|x-auth-token)[:=]\s*['"]?\S+/gi,
  /['"][A-Za-z0-9_\-]{40,}['"]/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /gh[ps]_[A-Za-z0-9]{36,}/g,
  /nvapi-[A-Za-z0-9\-]{40,}/g,
  /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
];

export function checkDangerousCommand(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked dangerous shell command matching: ${pattern}`;
    }
  }
  return null;
}

export function redact(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const eqIdx = match.indexOf("=");
      const colIdx = match.indexOf(":");
      const sepIdx = eqIdx !== -1 ? eqIdx : colIdx !== -1 ? colIdx : -1;
      if (sepIdx === -1) return "[REDACTED]";
      return match.slice(0, sepIdx + 1) + "[REDACTED]";
    });
  }
  if (result.length > 256) return "[REDACTED]";
  return result;
}

export function redactDeep(v: unknown): unknown {
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      result[k] = redactDeep(val);
    }
    return result;
  }
  return v;
}
