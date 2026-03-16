import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Extract image/media references from a Marp markdown file.
 * Matches patterns like: ![...](images/...), ![...](subdir/images/...),
 * <img src="images/...">, <source src="images/...">, etc.
 */
export function extractImageRefs(content: string): string[] {
  const refs = new Set<string>();

  // Markdown image syntax: ![...](...) - capture any relative path containing "images/"
  const mdPattern = /!\[.*?\]\((?:\.\/)?([^)\s]*images\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdPattern.exec(content)) !== null) {
    refs.add(match[1]);
  }

  // HTML src attributes: src="..." - capture any relative path containing "images/"
  const htmlPattern = /src=["'](?:\.\/)?([^"']*images\/[^"']+)["']/g;
  while ((match = htmlPattern.exec(content)) !== null) {
    refs.add(match[1]);
  }

  return [...refs].sort();
}

/**
 * Recursively list all files under a directory, returning paths relative to baseDir.
 */
function listFilesRecursive(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...listFilesRecursive(fullPath, baseDir));
      } else {
        results.push(relative(baseDir, fullPath));
      }
    } catch {
      // skip unreadable entries
    }
  }
  return results;
}

/**
 * List all image files under the images/ directory of slidesDir.
 * Returns paths like "images/foo.png", "images/arch/bar.png".
 */
export function listAllImageFiles(slidesDir: string): string[] {
  const imagesDir = join(slidesDir, "images");
  return listFilesRecursive(imagesDir, slidesDir).sort();
}

/**
 * Find all .md files in slidesDir (including subdirectories like aiagent/).
 */
export function findAllMdFiles(slidesDir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(slidesDir);
  for (const entry of entries) {
    const fullPath = join(slidesDir, entry);
    const stat = statSync(fullPath);
    if (stat.isFile() && entry.endsWith(".md")) {
      results.push(fullPath);
    } else if (stat.isDirectory() && entry !== "images" && entry !== "node_modules") {
      // Check subdirectories (e.g., aiagent/)
      try {
        const subEntries = readdirSync(fullPath);
        for (const sub of subEntries) {
          if (sub.endsWith(".md")) {
            results.push(join(fullPath, sub));
          }
        }
      } catch {
        // skip
      }
    }
  }
  return results.sort();
}

/**
 * Scan all md files and return a map of image path -> list of md files referencing it.
 */
export function buildReferenceMap(
  slidesDir: string
): Map<string, string[]> {
  const refMap = new Map<string, string[]>();
  const mdFiles = findAllMdFiles(slidesDir);

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, "utf-8");
    const refs = extractImageRefs(content);
    const mdRelative = relative(slidesDir, mdFile);
    for (const ref of refs) {
      const existing = refMap.get(ref) ?? [];
      existing.push(mdRelative);
      refMap.set(ref, existing);
    }
  }

  return refMap;
}

export interface ImageReport {
  /** Image references found in the file */
  refs: string[];
}

export interface OrphanReport {
  /** Image files not referenced by any md file */
  orphans: string[];
}

export interface MissingReport {
  /** Image references that don't exist on disk */
  missing: string[];
}

/**
 * List image references in a single md file.
 */
export function listImages(mdFilePath: string): ImageReport {
  const content = readFileSync(mdFilePath, "utf-8");
  return { refs: extractImageRefs(content) };
}

/**
 * Find orphan images: files in images/ not referenced by any md.
 */
export function findOrphans(slidesDir: string): OrphanReport {
  const allFiles = listAllImageFiles(slidesDir);
  const refMap = buildReferenceMap(slidesDir);
  const referenced = new Set(refMap.keys());
  const orphans = allFiles.filter((f) => !referenced.has(f));
  return { orphans };
}

/**
 * Find missing images: references in an md file that don't exist on disk.
 */
export function findMissing(
  mdFilePath: string,
  slidesDir: string
): MissingReport {
  const content = readFileSync(mdFilePath, "utf-8");
  const refs = extractImageRefs(content);
  const missing: string[] = [];
  for (const ref of refs) {
    const fullPath = join(slidesDir, ref);
    try {
      statSync(fullPath);
    } catch {
      missing.push(ref);
    }
  }
  return { missing };
}
