#!/usr/bin/env node

import { program } from "commander";
import { resolve, dirname } from "node:path";
import { readMarp, writeMarp } from "./parser.js";
import { listImages, findOrphans, findMissing } from "./images.js";

function validateSlideNumber(doc: { slides: string[] }, n: number): void {
  if (Number.isNaN(n) || n < 1 || n > doc.slides.length) {
    console.error(
      `Error: slide ${n} out of range (1-${doc.slides.length})`
    );
    process.exit(1);
  }
}

program
  .name("manip")
  .description("Manipulate Marp markdown slides by number")
  .version("0.1.0");

program
  .command("get")
  .description("Get a slide by number")
  .argument("<file>", "Marp markdown file")
  .argument("<number>", "Slide number (1-based)")
  .action((file: string, number: string) => {
    const doc = readMarp(file);
    const n = parseInt(number, 10);
    validateSlideNumber(doc, n);
    console.log(doc.slides[n - 1]);
  });

program
  .command("edit")
  .description("Replace a slide with content from stdin")
  .argument("<file>", "Marp markdown file")
  .argument("<number>", "Slide number (1-based)")
  .argument("<content>", "New slide content")
  .action((file: string, number: string, content: string) => {
    const doc = readMarp(file);
    const n = parseInt(number, 10);
    validateSlideNumber(doc, n);
    doc.slides[n - 1] = `\n${content}\n`;
    writeMarp(file, doc);
    console.log(`Slide ${n} updated.`);
  });

program
  .command("append")
  .description("Append a new slide")
  .argument("<file>", "Marp markdown file")
  .argument("<content>", "Slide content")
  .option("-a, --after <number>", "Insert after slide number")
  .action((file: string, content: string, opts: { after?: string }) => {
    const doc = readMarp(file);
    const slide = `\n${content}\n`;
    if (opts.after) {
      const n = parseInt(opts.after, 10);
      validateSlideNumber(doc, n);
      doc.slides.splice(n, 0, slide);
      console.log(`Slide inserted after slide ${n} (now slide ${n + 1}).`);
    } else {
      doc.slides.push(slide);
      console.log(`Slide appended as slide ${doc.slides.length}.`);
    }
    writeMarp(file, doc);
  });

program
  .command("delete")
  .description("Delete a slide by number")
  .argument("<file>", "Marp markdown file")
  .argument("<number>", "Slide number (1-based)")
  .action((file: string, number: string) => {
    const doc = readMarp(file);
    const n = parseInt(number, 10);
    validateSlideNumber(doc, n);
    doc.slides.splice(n - 1, 1);
    writeMarp(file, doc);
    console.log(`Slide ${n} deleted. (${doc.slides.length} slides remain)`);
  });

program
  .command("list")
  .description("List all slides with their numbers and titles")
  .argument("<file>", "Marp markdown file")
  .action((file: string) => {
    const doc = readMarp(file);
    doc.slides.forEach((slide, i) => {
      const titleMatch = slide.match(/^#+\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : "(no title)";
      console.log(`${String(i + 1).padStart(3)}  ${title}`);
    });
  });

program
  .command("count")
  .description("Show total number of slides")
  .argument("<file>", "Marp markdown file")
  .action((file: string) => {
    const doc = readMarp(file);
    console.log(doc.slides.length);
  });

const images = program
  .command("images")
  .description("Manage image references in Marp markdown files")
  .argument("[file]", "Marp markdown file")
  .option("--orphan", "Find image files not referenced by any markdown")
  .option("--missing", "Find image references that don't exist on disk")
  .option(
    "--slides-dir <dir>",
    "Slides directory (default: auto-detect from file or cwd)"
  )
  .action(
    (
      file: string | undefined,
      opts: { orphan?: boolean; missing?: boolean; slidesDir?: string }
    ) => {
      // Determine slides directory
      let slidesDir: string;
      if (opts.slidesDir) {
        slidesDir = resolve(opts.slidesDir);
      } else if (file) {
        // Assume the md file is in the slides dir or a subdirectory
        const absFile = resolve(file);
        const dir = dirname(absFile);
        // If the dir contains an 'images' folder, use it; otherwise go up one level
        try {
          const { statSync } = require("node:fs");
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
          console.error("Error: --missing requires a file argument");
          process.exit(1);
        }
        const { missing } = findMissing(resolve(file), slidesDir);
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
        console.error(
          "Error: provide a file argument or use --orphan/--missing"
        );
        process.exit(1);
      }
      const { refs } = listImages(resolve(file));
      if (refs.length === 0) {
        console.log("No image references found.");
      } else {
        for (const ref of refs) {
          console.log(ref);
        }
      }
    }
  );

program.parse();
