#!/usr/bin/env node

import { program } from "commander";
import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import {
  readMarp,
  writeMarp,
  ManipError,
  parseSlideRange,
} from "./parser.js";
import { listImages, findOrphans, findMissing } from "./images.js";

function validateSlideNumber(doc: { slides: string[] }, n: number): void {
  if (Number.isNaN(n) || n < 1 || n > doc.slides.length) {
    throw new ManipError(
      `slide ${n} out of range (1-${doc.slides.length})`
    );
  }
}

function handleError(e: unknown): never {
  if (e instanceof ManipError) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

program
  .name("manip")
  .description("Manipulate Marp markdown slides by number")
  .version("0.1.0");

program
  .command("get")
  .description("Get slide(s) by number or range (e.g. 3, 1-5, 1,3,5)")
  .argument("<file>", "Marp markdown file")
  .argument("<range>", "Slide number or range (1-based)")
  .option("--json", "Output as JSON")
  .action((file: string, range: string, opts: { json?: boolean }) => {
    try {
      const doc = readMarp(file);
      const indices = parseSlideRange(range, doc.slides.length);
      if (opts.json) {
        const result = indices.map((i) => ({
          number: i + 1,
          content: doc.slides[i],
        }));
        console.log(JSON.stringify(result, null, 2));
      } else {
        for (const i of indices) {
          console.log(doc.slides[i]);
        }
      }
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("edit")
  .description("Replace a slide's content")
  .argument("<file>", "Marp markdown file")
  .argument("<number>", "Slide number (1-based)")
  .argument("[content]", "New slide content (reads from stdin if omitted)")
  .option("--dry-run", "Show what would change without writing")
  .action(
    async (
      file: string,
      number: string,
      content: string | undefined,
      opts: { dryRun?: boolean }
    ) => {
      try {
        const doc = readMarp(file);
        const n = parseInt(number, 10);
        validateSlideNumber(doc, n);

        let newContent: string;
        if (content !== undefined) {
          newContent = content;
        } else {
          // Read from stdin
          newContent = readFileSync(0, "utf-8").trimEnd();
        }

        if (opts.dryRun) {
          console.log(`[dry-run] Would replace slide ${n} with:`);
          console.log(newContent);
          return;
        }

        doc.slides[n - 1] = `\n${newContent}\n`;
        writeMarp(file, doc);
        console.log(`Slide ${n} updated.`);
      } catch (e) {
        handleError(e);
      }
    }
  );

program
  .command("append")
  .description("Append a new slide")
  .argument("<file>", "Marp markdown file")
  .argument("<content>", "Slide content")
  .option("-a, --after <number>", "Insert after slide number")
  .option("--dry-run", "Show what would change without writing")
  .action(
    (
      file: string,
      content: string,
      opts: { after?: string; dryRun?: boolean }
    ) => {
      try {
        const doc = readMarp(file);
        const slide = `\n${content}\n`;
        if (opts.after) {
          const n = parseInt(opts.after, 10);
          validateSlideNumber(doc, n);
          if (opts.dryRun) {
            console.log(
              `[dry-run] Would insert slide after slide ${n}`
            );
            return;
          }
          doc.slides.splice(n, 0, slide);
          console.log(
            `Slide inserted after slide ${n} (now slide ${n + 1}).`
          );
        } else {
          if (opts.dryRun) {
            console.log(
              `[dry-run] Would append slide as slide ${doc.slides.length + 1}`
            );
            return;
          }
          doc.slides.push(slide);
          console.log(`Slide appended as slide ${doc.slides.length}.`);
        }
        writeMarp(file, doc);
      } catch (e) {
        handleError(e);
      }
    }
  );

program
  .command("delete")
  .description("Delete slide(s) by number or range (e.g. 3, 1-5, 1,3,5)")
  .argument("<file>", "Marp markdown file")
  .argument("<range>", "Slide number or range (1-based)")
  .option("--dry-run", "Show what would change without writing")
  .action(
    (file: string, range: string, opts: { dryRun?: boolean }) => {
      try {
        const doc = readMarp(file);
        const indices = parseSlideRange(range, doc.slides.length);

        if (opts.dryRun) {
          console.log(
            `[dry-run] Would delete slide(s): ${indices.map((i) => i + 1).join(", ")}`
          );
          return;
        }

        // Delete from end to start to preserve indices
        for (let i = indices.length - 1; i >= 0; i--) {
          doc.slides.splice(indices[i], 1);
        }
        writeMarp(file, doc);
        console.log(
          `Deleted ${indices.length} slide(s). (${doc.slides.length} slides remain)`
        );
      } catch (e) {
        handleError(e);
      }
    }
  );

program
  .command("list")
  .description("List all slides with their numbers and titles")
  .argument("<file>", "Marp markdown file")
  .option("--json", "Output as JSON")
  .action((file: string, opts: { json?: boolean }) => {
    try {
      const doc = readMarp(file);
      if (opts.json) {
        const result = doc.slides.map((slide, i) => {
          const titleMatch = slide.match(/^#+\s+(.+)$/m);
          return {
            number: i + 1,
            title: titleMatch ? titleMatch[1] : null,
          };
        });
        console.log(JSON.stringify(result, null, 2));
      } else {
        doc.slides.forEach((slide, i) => {
          const titleMatch = slide.match(/^#+\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1] : "(no title)";
          console.log(`${String(i + 1).padStart(3)}  ${title}`);
        });
      }
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("count")
  .description("Show total number of slides")
  .argument("<file>", "Marp markdown file")
  .action((file: string) => {
    try {
      const doc = readMarp(file);
      console.log(doc.slides.length);
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("move")
  .description("Move a slide from one position to another")
  .argument("<file>", "Marp markdown file")
  .argument("<from>", "Source slide number (1-based)")
  .argument("<to>", "Destination slide number (1-based)")
  .option("--dry-run", "Show what would change without writing")
  .action(
    (
      file: string,
      from: string,
      to: string,
      opts: { dryRun?: boolean }
    ) => {
      try {
        const doc = readMarp(file);
        const fromN = parseInt(from, 10);
        const toN = parseInt(to, 10);
        validateSlideNumber(doc, fromN);
        validateSlideNumber(doc, toN);

        if (fromN === toN) {
          console.log("Source and destination are the same. No change.");
          return;
        }

        if (opts.dryRun) {
          console.log(
            `[dry-run] Would move slide ${fromN} to position ${toN}`
          );
          return;
        }

        const [slide] = doc.slides.splice(fromN - 1, 1);
        doc.slides.splice(toN - 1, 0, slide);
        writeMarp(file, doc);
        console.log(`Slide ${fromN} moved to position ${toN}.`);
      } catch (e) {
        handleError(e);
      }
    }
  );

program
  .command("swap")
  .description("Swap two slides")
  .argument("<file>", "Marp markdown file")
  .argument("<n1>", "First slide number (1-based)")
  .argument("<n2>", "Second slide number (1-based)")
  .option("--dry-run", "Show what would change without writing")
  .action(
    (
      file: string,
      n1: string,
      n2: string,
      opts: { dryRun?: boolean }
    ) => {
      try {
        const doc = readMarp(file);
        const a = parseInt(n1, 10);
        const b = parseInt(n2, 10);
        validateSlideNumber(doc, a);
        validateSlideNumber(doc, b);

        if (a === b) {
          console.log("Same slide number. No change.");
          return;
        }

        if (opts.dryRun) {
          console.log(`[dry-run] Would swap slides ${a} and ${b}`);
          return;
        }

        const tmp = doc.slides[a - 1];
        doc.slides[a - 1] = doc.slides[b - 1];
        doc.slides[b - 1] = tmp;
        writeMarp(file, doc);
        console.log(`Slides ${a} and ${b} swapped.`);
      } catch (e) {
        handleError(e);
      }
    }
  );

program
  .command("extract")
  .description("Extract slide(s) to a new file")
  .argument("<file>", "Source Marp markdown file")
  .argument("<range>", "Slide range (e.g. 3, 2-5, 1,3,5)")
  .argument("<output>", "Output file")
  .action((file: string, range: string, output: string) => {
    try {
      const doc = readMarp(file);
      const indices = parseSlideRange(range, doc.slides.length);
      const extracted = indices.map((i) => doc.slides[i]);
      const newDoc = { frontmatter: doc.frontmatter, slides: extracted };
      writeMarp(output, newDoc);
      console.log(
        `Extracted ${extracted.length} slide(s) to ${output}.`
      );
    } catch (e) {
      handleError(e);
    }
  });

program
  .command("images")
  .description("Manage image references in Marp markdown files")
  .argument("[file]", "Marp markdown file")
  .option("--orphan", "Find image files not referenced by any markdown")
  .option("--missing", "Find image references that don't exist on disk")
  .option(
    "--slides-dir <dir>",
    "Slides directory (default: auto-detect from file or cwd)"
  )
  .option("--json", "Output as JSON")
  .action(
    (
      file: string | undefined,
      opts: {
        orphan?: boolean;
        missing?: boolean;
        slidesDir?: string;
        json?: boolean;
      }
    ) => {
      try {
        // Determine slides directory
        let slidesDir: string;
        if (opts.slidesDir) {
          slidesDir = resolve(opts.slidesDir);
        } else if (file) {
          const absFile = resolve(file);
          const dir = dirname(absFile);
          try {
            statSync(resolve(dir, "images"));
            slidesDir = dir;
          } catch {
            slidesDir = dirname(dir);
          }
        } else {
          slidesDir = process.cwd();
        }

        if (opts.orphan) {
          const { orphans } = findOrphans(slidesDir);
          if (opts.json) {
            console.log(JSON.stringify({ orphans }, null, 2));
            return;
          }
          if (orphans.length === 0) {
            console.log("No orphan images found.");
          } else {
            console.log(`Found ${orphans.length} orphan image(s):`);
            for (const o of orphans) {
              console.log(`  ${o}`);
            }
          }
          return;
        }

        if (opts.missing) {
          if (!file) {
            throw new ManipError("--missing requires a file argument");
          }
          const { missing } = findMissing(resolve(file), slidesDir);
          if (opts.json) {
            console.log(JSON.stringify({ missing }, null, 2));
            return;
          }
          if (missing.length === 0) {
            console.log("No missing images found.");
          } else {
            console.log(`Found ${missing.length} missing image(s):`);
            for (const m of missing) {
              console.log(`  ${m}`);
            }
          }
          return;
        }

        // Default: list image references in a file
        if (!file) {
          throw new ManipError(
            "provide a file argument or use --orphan/--missing"
          );
        }
        const { refs } = listImages(resolve(file));
        if (opts.json) {
          console.log(JSON.stringify({ refs }, null, 2));
          return;
        }
        if (refs.length === 0) {
          console.log("No image references found.");
        } else {
          for (const ref of refs) {
            console.log(ref);
          }
        }
      } catch (e) {
        handleError(e);
      }
    }
  );

program.parse();
