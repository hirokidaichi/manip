import { readFileSync, writeFileSync } from "node:fs";

export interface MarpDocument {
  frontmatter: string;
  slides: string[];
}

export class ManipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManipError";
  }
}

const SLIDE_SEPARATOR = "\n---\n";
const SLIDE_SEPARATOR_RE = /\n---[^\S\n]*\n/;

function normalizeCRLF(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

export function parse(content: string): MarpDocument {
  const normalized = normalizeCRLF(content);
  // Frontmatter starts and ends with ---
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---[^\S\n]*\n/);
  if (!fmMatch) {
    // No frontmatter — treat entire content as slides
    const slides = normalized.split(SLIDE_SEPARATOR_RE);
    return { frontmatter: "", slides };
  }

  const frontmatter = `---\n${fmMatch[1]}\n---`;
  const rest = normalized.slice(fmMatch[0].length);
  const slides = rest.split(SLIDE_SEPARATOR_RE);

  return { frontmatter, slides };
}

export function serialize(doc: MarpDocument): string {
  const body = doc.slides.join(SLIDE_SEPARATOR);
  if (!doc.frontmatter) return body;
  return `${doc.frontmatter}\n${body}`;
}

export function readMarp(filePath: string): MarpDocument {
  try {
    const content = readFileSync(filePath, "utf-8");
    return parse(content);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ManipError(`file not found: ${filePath}`);
    }
    throw e;
  }
}

export function writeMarp(filePath: string, doc: MarpDocument): void {
  writeFileSync(filePath, serialize(doc), "utf-8");
}

/**
 * Parse a slide range string like "3", "2-5", or "1,3,5".
 * Returns 0-based indices. Validates against total slide count.
 */
export function parseSlideRange(
  rangeStr: string,
  totalSlides: number
): number[] {
  const indices: number[] = [];
  const parts = rangeStr.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 1 || end > totalSlides || start > end) {
        throw new ManipError(
          `slide range ${trimmed} out of range (1-${totalSlides})`
        );
      }
      for (let i = start; i <= end; i++) {
        indices.push(i - 1);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (Number.isNaN(n) || n < 1 || n > totalSlides) {
        throw new ManipError(
          `slide ${trimmed} out of range (1-${totalSlides})`
        );
      }
      indices.push(n - 1);
    }
  }
  // Deduplicate and sort
  return [...new Set(indices)].sort((a, b) => a - b);
}
