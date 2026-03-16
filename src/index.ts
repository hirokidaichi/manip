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
  .version("0.2.0")
  .addHelpText(
    "after",
    `
Slide Range Syntax:
  Many commands accept a <range> argument. Supported formats:
    3         Single slide (slide 3)
    2-5       Range of slides (slides 2, 3, 4, 5)
    1,3,5     Comma-separated list (slides 1, 3, 5)
    1-3,7     Mixed range and individual slides

Common Options:
  --json      Output structured JSON (available on: list, get, images)
  --dry-run   Preview changes without writing to disk (available on: edit, append, delete, move, swap)

Quick Start:
  $ manip list slides.md              List all slides with titles
  $ manip get slides.md 1             Show the first slide
  $ manip count slides.md             Show total slide count
  $ manip delete --dry-run slides.md 3  Preview deleting slide 3

More Info:
  https://github.com/hirokidaichi/manip`
  );

program
  .command("get")
  .description("Get slide(s) by number or range (e.g. 3, 1-5, 1,3,5)")
  .argument("<file>", "Marp markdown file path")
  .argument("<range>", "Slide number or range (1-based): 3, 1-5, 1,3,5")
  .option("--json", "Output as JSON with slide number and content")
  .addHelpText(
    "after",
    `
Examples:
  $ manip get slides.md 1              Get the first slide
  $ manip get slides.md 2-4            Get slides 2, 3, and 4
  $ manip get slides.md 1,3,5          Get specific slides
  $ manip get slides.md 1 --json       Get slide 1 as JSON

  Pipe to other tools:
  $ manip get slides.md 3 | pbcopy     Copy slide 3 to clipboard
  $ manip get slides.md 1-3 --json | jq '.[].title'`
  )
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
  .argument("<file>", "Marp markdown file path")
  .argument("<number>", "Slide number to replace (1-based)")
  .argument("[content]", "New slide content (reads from stdin if omitted)")
  .option("--dry-run", "Preview the change without writing to disk")
  .addHelpText(
    "after",
    `
Examples:
  $ manip edit slides.md 2 "# New Title"             Replace slide 2 inline
  $ manip edit slides.md 2 --dry-run "# New Title"    Preview the change
  $ echo "# Updated" | manip edit slides.md 3         Replace slide 3 from stdin
  $ cat new-slide.md | manip edit slides.md 1          Replace from a file`
  )
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
  .description("Append a new slide at the end or after a specific slide")
  .argument("<file>", "Marp markdown file path")
  .argument("<content>", "Slide content to add")
  .option("-a, --after <number>", "Insert after the given slide number instead of at the end")
  .option("--dry-run", "Preview the change without writing to disk")
  .addHelpText(
    "after",
    `
Examples:
  $ manip append slides.md "# New Slide"              Add a slide at the end
  $ manip append slides.md -a 2 "# Inserted"          Insert after slide 2
  $ manip append slides.md --dry-run "# Draft"         Preview without writing
  $ manip append slides.md "# Slide\\n\\nWith body text"  Multi-line content`
  )
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
  .argument("<file>", "Marp markdown file path")
  .argument("<range>", "Slide number or range to delete (1-based): 3, 1-5, 1,3,5")
  .option("--dry-run", "Preview which slides would be deleted without writing")
  .addHelpText(
    "after",
    `
Examples:
  $ manip delete slides.md 3                Delete slide 3
  $ manip delete slides.md 2-4              Delete slides 2, 3, and 4
  $ manip delete slides.md 1,5,8            Delete specific slides
  $ manip delete slides.md 3 --dry-run      Preview without deleting

Note: Use --dry-run first to verify which slides will be removed.`
  )
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
  .argument("<file>", "Marp markdown file path")
  .option("--json", "Output as JSON array with number and title fields")
  .addHelpText(
    "after",
    `
Examples:
  $ manip list slides.md                Show slide numbers and titles
  $ manip list slides.md --json         Output as structured JSON

Output Format:
  Default:    "  1  Introduction"
  JSON:       [{"number":1,"title":"Introduction"}, ...]

  Titles are extracted from the first heading (# ...) in each slide.
  Slides without headings show "(no title)".`
  )
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
  .argument("<file>", "Marp markdown file path")
  .addHelpText(
    "after",
    `
Examples:
  $ manip count slides.md               Print the slide count
  $ echo "Total: $(manip count slides.md) slides"   Use in scripts`
  )
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
  .argument("<file>", "Marp markdown file path")
  .argument("<from>", "Source slide number (1-based)")
  .argument("<to>", "Destination position (1-based)")
  .option("--dry-run", "Preview the move without writing to disk")
  .addHelpText(
    "after",
    `
Examples:
  $ manip move slides.md 5 2             Move slide 5 to position 2
  $ manip move slides.md 1 10            Move first slide to position 10
  $ manip move slides.md 3 1 --dry-run   Preview moving slide 3 to front`
  )
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
  .description("Swap the positions of two slides")
  .argument("<file>", "Marp markdown file path")
  .argument("<n1>", "First slide number (1-based)")
  .argument("<n2>", "Second slide number (1-based)")
  .option("--dry-run", "Preview the swap without writing to disk")
  .addHelpText(
    "after",
    `
Examples:
  $ manip swap slides.md 2 5             Swap slides 2 and 5
  $ manip swap slides.md 1 3 --dry-run   Preview swapping slides 1 and 3`
  )
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
  .description("Extract slide(s) to a new Marp file (preserves frontmatter)")
  .argument("<file>", "Source Marp markdown file path")
  .argument("<range>", "Slide range to extract (1-based): 3, 2-5, 1,3,5")
  .argument("<output>", "Output file path for extracted slides")
  .addHelpText(
    "after",
    `
Examples:
  $ manip extract slides.md 1-3 intro.md          Extract first 3 slides
  $ manip extract slides.md 5,8,10 highlights.md  Extract specific slides
  $ manip extract slides.md 2-4 chapter2.md       Split into chapters

Note: The output file will include the original frontmatter (theme, etc.).`
  )
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
  .description("List, audit, and manage image references in Marp markdown")
  .argument("[file]", "Marp markdown file path (required unless --orphan)")
  .option("--orphan", "Find image files on disk not referenced by any .md file")
  .option("--missing", "Find image references in the file that don't exist on disk")
  .option(
    "--slides-dir <dir>",
    "Base directory for scanning (default: auto-detect from file or cwd)"
  )
  .option("--json", "Output as structured JSON")
  .addHelpText(
    "after",
    `
Modes:
  (default)   List all image references found in <file>
  --orphan    Scan the images/ directory for files not used by any .md
  --missing   Check that every image referenced in <file> exists on disk

Examples:
  $ manip images slides.md                  List all image refs in slides.md
  $ manip images slides.md --json           List as JSON
  $ manip images --orphan                   Find unused images in cwd
  $ manip images --orphan --slides-dir ./deck  Scan a specific directory
  $ manip images slides.md --missing        Find broken image references
  $ manip images slides.md --missing --json Output as JSON

Use Cases:
  Clean up unused images before publishing:
    $ manip images --orphan | xargs rm

  Verify all images exist before building:
    $ manip images slides.md --missing && echo "All good!"`
  )
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
