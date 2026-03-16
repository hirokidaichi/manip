import { readFileSync, writeFileSync } from "node:fs";

export interface MarpDocument {
  frontmatter: string;
  slides: string[];
}

const SLIDE_SEPARATOR = "\n---\n";
const SLIDE_SEPARATOR_RE = /\n---[^\S\n]*\n/;

export function parse(content: string): MarpDocument {
  // Frontmatter starts and ends with ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---[^\S\n]*\n/);
  if (!fmMatch) {
    // No frontmatter — treat entire content as slides
    const slides = content.split(SLIDE_SEPARATOR_RE);
    return { frontmatter: "", slides };
  }

  const frontmatter = `---\n${fmMatch[1]}\n---`;
  const rest = content.slice(fmMatch[0].length);
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
      console.error(`Error: file not found: ${filePath}`);
      process.exit(1);
    }
    throw e;
  }
}

export function writeMarp(filePath: string, doc: MarpDocument): void {
  writeFileSync(filePath, serialize(doc), "utf-8");
}
