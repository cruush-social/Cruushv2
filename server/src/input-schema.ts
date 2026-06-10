import { z } from "zod";

const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SINGLE_LINE_WHITESPACE = /[\t\r\n]+/g;

export function normalizeMultilineText(value: string) {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").trim();
}

export function normalizeSingleLineText(value: string) {
  return normalizeMultilineText(value).replace(SINGLE_LINE_WHITESPACE, " ").trim();
}

export function multilineTextSchema(options: { min?: number; max: number }) {
  return z.string()
    .transform(normalizeMultilineText)
    .pipe(z.string().min(options.min ?? 0).max(options.max));
}

export function singleLineTextSchema(options: { min?: number; max: number }) {
  return z.string()
    .transform(normalizeSingleLineText)
    .pipe(z.string().min(options.min ?? 0).max(options.max));
}

export function optionalSingleLineTextSchema(max: number) {
  return singleLineTextSchema({ max }).optional().default("");
}

export const uuidSchema = z.uuid();
