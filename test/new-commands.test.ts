import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(__dirname, "..", "src", "index.js");

function run(
  args: string[],
  expectFail = false
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout: string; stderr: string; status: number };
    if (!expectFail) throw e;
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

const SAMPLE = `---
marp: true
theme: custom
---

# Slide 1

Content of slide 1

---

# Slide 2

Content of slide 2 with TODO item

---

# Slide 3

Content of slide 3
`;

const SAMPLE_B = `---
marp: true
theme: other
---

# Slide A

Content A

---

# Slide B

Content B
`;

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "manip-new-test-"));
  tmpFile = join(tmpDir, "test.md");
  writeFileSync(tmpFile, SAMPLE, "utf-8");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

// ─── search ───────────────────────────────────────────────────────────

describe("CLI: search", () => {
  it("finds slides matching a literal string", () => {
    const { stdout } = run(["search", tmpFile, "TODO"]);
    assert.match(stdout, /2\s+Slide 2/);
    assert.doesNotMatch(stdout, /Slide 1/);
    assert.doesNotMatch(stdout, /Slide 3/);
  });

  it("finds slides matching a regex", () => {
    const { stdout } = run(["search", tmpFile, "/slide [12]/i"]);
    assert.match(stdout, /1\s+Slide 1/);
    assert.match(stdout, /2\s+Slide 2/);
  });

  it("shows no results message when nothing matches", () => {
    const { stdout } = run(["search", tmpFile, "nonexistent"]);
    assert.match(stdout, /No matching slides/);
  });

  it("outputs JSON with --json", () => {
    const { stdout } = run(["search", tmpFile, "TODO", "--json"]);
    const result = JSON.parse(stdout);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 2);
    assert.equal(result[0].title, "Slide 2");
    assert.ok(result[0].matches.length > 0);
  });

  it("matches across multiple slides", () => {
    const { stdout } = run(["search", tmpFile, "Content"]);
    assert.match(stdout, /1\s+Slide 1/);
    assert.match(stdout, /2\s+Slide 2/);
    assert.match(stdout, /3\s+Slide 3/);
  });
});

// ─── duplicate ────────────────────────────────────────────────────────

describe("CLI: duplicate", () => {
  it("duplicates a slide", () => {
    run(["duplicate", tmpFile, "2"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "4");
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    const { stdout: s3 } = run(["get", tmpFile, "3"]);
    // Both should have Slide 2 content
    assert.match(s2, /# Slide 2/);
    assert.match(s3, /# Slide 2/);
  });

  it("preserves surrounding slides", () => {
    run(["duplicate", tmpFile, "2"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s4 } = run(["get", tmpFile, "4"]);
    assert.match(s1, /# Slide 1/);
    assert.match(s4, /# Slide 3/);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run(["duplicate", tmpFile, "2", "--dry-run"]);
    assert.match(stdout, /dry-run/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });

  it("rejects out-of-range number", () => {
    const { exitCode, stderr } = run(
      ["duplicate", tmpFile, "99"],
      true
    );
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
  });
});

// ─── replace ──────────────────────────────────────────────────────────

describe("CLI: replace", () => {
  it("replaces text across all slides", () => {
    run(["replace", tmpFile, "Content", "Body"]);
    const content = readFileSync(tmpFile, "utf-8");
    assert.doesNotMatch(content, /Content of slide/);
    assert.match(content, /Body of slide 1/);
    assert.match(content, /Body of slide 2/);
    assert.match(content, /Body of slide 3/);
  });

  it("replaces with regex", () => {
    run(["replace", tmpFile, "/slide (\\d)/i", "page $1"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    assert.match(s1, /page 1/);
  });

  it("limits replacement to specific slides", () => {
    run(["replace", tmpFile, "Content", "Body", "-s", "1"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    assert.match(s1, /Body of slide 1/);
    assert.match(s2, /Content of slide 2/);
  });

  it("reports no matches", () => {
    const { stdout } = run(["replace", tmpFile, "zzzzz", "yyy"]);
    assert.match(stdout, /No matches/);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run([
      "replace",
      tmpFile,
      "Content",
      "Body",
      "--dry-run",
    ]);
    assert.match(stdout, /dry-run/);
    assert.match(stdout, /replacement/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });

  it("shows replacement count per slide", () => {
    const { stdout } = run(["replace", tmpFile, "Content", "Body"]);
    assert.match(stdout, /3 occurrence/);
    assert.match(stdout, /3 slide/);
  });
});

// ─── merge ────────────────────────────────────────────────────────────

describe("CLI: merge", () => {
  it("merges two files", () => {
    const fileB = join(tmpDir, "b.md");
    writeFileSync(fileB, SAMPLE_B, "utf-8");
    const outFile = join(tmpDir, "merged.md");
    run(["merge", tmpFile, fileB, outFile]);

    const { stdout } = run(["count", outFile]);
    assert.equal(stdout.trim(), "5"); // 3 + 2

    const { stdout: s1 } = run(["get", outFile, "1"]);
    assert.match(s1, /# Slide 1/);
    const { stdout: s4 } = run(["get", outFile, "4"]);
    assert.match(s4, /# Slide A/);
  });

  it("uses first file frontmatter by default", () => {
    const fileB = join(tmpDir, "b.md");
    writeFileSync(fileB, SAMPLE_B, "utf-8");
    const outFile = join(tmpDir, "merged.md");
    run(["merge", tmpFile, fileB, outFile]);
    const content = readFileSync(outFile, "utf-8");
    assert.match(content, /theme: custom/);
    assert.doesNotMatch(content, /theme: other/);
  });

  it("discards frontmatter with --frontmatter none", () => {
    const fileB = join(tmpDir, "b.md");
    writeFileSync(fileB, SAMPLE_B, "utf-8");
    const outFile = join(tmpDir, "merged.md");
    run(["merge", tmpFile, fileB, outFile, "--frontmatter", "none"]);
    const content = readFileSync(outFile, "utf-8");
    assert.doesNotMatch(content, /theme:/);
  });

  it("requires at least 2 input files + 1 output", () => {
    const { exitCode, stderr } = run(
      ["merge", tmpFile, join(tmpDir, "out.md")],
      true
    );
    assert.equal(exitCode, 1);
    assert.match(stderr, /at least 2 input/);
  });
});

// ─── split ────────────────────────────────────────────────────────────

describe("CLI: split", () => {
  it("splits every N slides", () => {
    const { stdout } = run(["split", tmpFile, "--every", "2"]);
    assert.match(stdout, /2 files/);
    const file1 = join(tmpDir, "test-1.md");
    const file2 = join(tmpDir, "test-2.md");
    assert.ok(existsSync(file1));
    assert.ok(existsSync(file2));

    const { stdout: c1 } = run(["count", file1]);
    assert.equal(c1.trim(), "2");
    const { stdout: c2 } = run(["count", file2]);
    assert.equal(c2.trim(), "1");
  });

  it("splits at specific positions", () => {
    const { stdout } = run(["split", tmpFile, "--at", "1,2"]);
    assert.match(stdout, /3 files/);
    const file1 = join(tmpDir, "test-1.md");
    const file2 = join(tmpDir, "test-2.md");
    const file3 = join(tmpDir, "test-3.md");

    const { stdout: c1 } = run(["count", file1]);
    assert.equal(c1.trim(), "1");
    const { stdout: c2 } = run(["count", file2]);
    assert.equal(c2.trim(), "1");
    const { stdout: c3 } = run(["count", file3]);
    assert.equal(c3.trim(), "1");
  });

  it("preserves frontmatter in all split files", () => {
    run(["split", tmpFile, "--every", "1"]);
    const file1 = join(tmpDir, "test-1.md");
    const file3 = join(tmpDir, "test-3.md");
    const content1 = readFileSync(file1, "utf-8");
    const content3 = readFileSync(file3, "utf-8");
    assert.match(content1, /marp: true/);
    assert.match(content3, /marp: true/);
  });

  it("supports --prefix option", () => {
    run(["split", tmpFile, "--every", "2", "--prefix", "chapter"]);
    assert.ok(existsSync(join(tmpDir, "chapter-1.md")));
    assert.ok(existsSync(join(tmpDir, "chapter-2.md")));
  });

  it("supports --output-dir option", () => {
    const outDir = join(tmpDir, "parts");
    run(["split", tmpFile, "--every", "2", "--output-dir", outDir]);
    assert.ok(existsSync(join(outDir, "test-1.md")));
    assert.ok(existsSync(join(outDir, "test-2.md")));
  });

  it("requires --every or --at", () => {
    const { exitCode, stderr } = run(["split", tmpFile], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /--every.*--at/);
  });
});

// ─── stats ────────────────────────────────────────────────────────────

describe("CLI: stats", () => {
  it("shows slide statistics", () => {
    const { stdout } = run(["stats", tmpFile]);
    assert.match(stdout, /3 slides/);
    assert.match(stdout, /chars/);
    assert.match(stdout, /lines/);
    assert.match(stdout, /Slide 1/);
    assert.match(stdout, /Slide 2/);
    assert.match(stdout, /Slide 3/);
  });

  it("outputs JSON with --json", () => {
    const { stdout } = run(["stats", tmpFile, "--json"]);
    const result = JSON.parse(stdout);
    assert.equal(result.slides.length, 3);
    assert.ok(result.slides[0].chars > 0);
    assert.ok(result.slides[0].lines > 0);
    assert.equal(typeof result.slides[0].images, "number");
    assert.equal(result.total.slideCount, 3);
    assert.ok(result.total.chars > 0);
  });

  it("counts characters correctly", () => {
    const { stdout } = run(["stats", tmpFile, "--json"]);
    const result = JSON.parse(stdout);
    // Each slide has content, so chars should be > 0
    for (const s of result.slides) {
      assert.ok(s.chars > 0, `Slide ${s.number} should have chars > 0`);
    }
    // Total should be sum of parts
    const sum = result.slides.reduce(
      (acc: number, s: { chars: number }) => acc + s.chars,
      0
    );
    assert.equal(result.total.chars, sum);
  });

  it("reports image count as 0 for slides without images", () => {
    const { stdout } = run(["stats", tmpFile, "--json"]);
    const result = JSON.parse(stdout);
    for (const s of result.slides) {
      assert.equal(s.images, 0);
    }
  });
});
