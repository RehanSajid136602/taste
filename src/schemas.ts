import { z } from "zod";

export const shellSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  timeout: z.number().optional(),
});

export const readFileSchema = z.object({
  filePath: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional(),
});

export const writeFileSchema = z.object({
  filePath: z.string(),
  content: z.string(),
});

export const patchFileSchema = z.object({
  filePath: z.string(),
  oldValue: z.string(),
  newValue: z.string(),
  replaceAll: z.boolean().optional(),
});

export const listFilesSchema = z.object({
  filePath: z.string(),
  pattern: z.string().optional(),
  excludePatterns: z.array(z.string()).optional(),
});

export const emptySchema = z.object({});

export const verifyClaimsSchema = z.object({
  claims: z.array(z.string()),
});

export const finalReportGateSchema = z.object({
  claims: z.array(z.string()).optional(),
});

export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, zodType] of Object.entries(shape)) {
    properties[key] = describeZodType(zodType);
    if (!(zodType instanceof z.ZodOptional) && !(zodType instanceof z.ZodDefault)) {
      required.push(key);
    }
  }

  return { type: "object", properties, required: required.length > 0 ? required : undefined };
}

function describeZodType(zodType: z.ZodTypeAny): Record<string, unknown> {
  if (zodType instanceof z.ZodString) return { type: "string" };
  if (zodType instanceof z.ZodNumber) return { type: "number" };
  if (zodType instanceof z.ZodBoolean) return { type: "boolean" };
  if (zodType instanceof z.ZodArray) return { type: "array", items: describeZodType(zodType.element) };
  if (zodType instanceof z.ZodOptional) return describeZodType(zodType.unwrap());
  if (zodType instanceof z.ZodDefault) return describeZodType(zodType.removeDefault());
  return { type: "string" };
}
