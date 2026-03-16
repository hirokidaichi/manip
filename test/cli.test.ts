import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
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

Content of slide 2

---

# Slide 3

Content of slide 3
`;

let tmpDir: string;
let tmpFile: string;

function resetFile() {
  writeFileSync(tmpFile, SAMPLE, "utf-8");
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "manip-test-"));
  tmpFile = join(tmpDir, "test.md");
  resetFile();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe("CLI: count", () => {
  it("returns correct slide count", () => {
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "3");
  });
});

describe("CLI: list", () => {
  it("lists slides with numbers and titles", () => {
    const { stdout } = run(["list", tmpFile]);
    const lines = stdout.trim().split("\n");
    assert.equal(lines.length, 3);
    assert.match(lines[0], /1\s+Slide 1/);
    assert.match(lines[1], /2\s+Slide 2/);
    assert.match(lines[2], /3\s+Slide 3/);
  });

  it("outputs JSON with --json", () => {
    const { stdout } = run(["list", tmpFile, "--json"]);
    const result = JSON.parse(stdout);
    assert.equal(result.length, 3);
    assert.equal(result[0].number, 1);
    assert.equal(result[0].title, "Slide 1");
  });
});

describe("CLI: get", () => {
  it("returns slide content by number", () => {
    const { stdout } = run(["get", tmpFile, "2"]);
    assert.match(stdout, /# Slide 2/);
    assert.match(stdout, /Content of slide 2/);
  });

  it("returns multiple slides with range", () => {
    const { stdout } = run(["get", tmpFile, "1-2"]);
    assert.match(stdout, /# Slide 1/);
    assert.match(stdout, /# Slide 2/);
  });

  it("returns multiple slides with comma-separated numbers", () => {
    const { stdout } = run(["get", tmpFile, "1,3"]);
    assert.match(stdout, /# Slide 1/);
    assert.match(stdout, /# Slide 3/);
  });

  it("outputs JSON with --json", () => {
    const { stdout } = run(["get", tmpFile, "2", "--json"]);
    const result = JSON.parse(stdout);
    assert.equal(result.length, 1);
    assert.equal(result[0].number, 2);
    assert.match(result[0].content, /# Slide 2/);
  });

  it("rejects out-of-range number", () => {
    const { stderr, exitCode } = run(["get", tmpFile, "0"], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
  });

  it("rejects number above max", () => {
    const { stderr, exitCode } = run(["get", tmpFile, "99"], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
  });

  it("rejects non-numeric input", () => {
    const { stderr, exitCode } = run(["get", tmpFile, "abc"], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
  });
});

describe("CLI: edit", () => {
  it("replaces slide content", () => {
    run(["edit", tmpFile, "2", "# Replaced\n\nNew content"]);
    const { stdout } = run(["get", tmpFile, "2"]);
    assert.match(stdout, /# Replaced/);
    assert.match(stdout, /New content/);
  });

  it("preserves adjacent slides", () => {
    run(["edit", tmpFile, "2", "# Replaced"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s3 } = run(["get", tmpFile, "3"]);
    assert.match(s1, /# Slide 1/);
    assert.match(s3, /# Slide 3/);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run(["edit", tmpFile, "2", "# New", "--dry-run"]);
    assert.match(stdout, /dry-run/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: append", () => {
  it("appends to end", () => {
    run(["append", tmpFile, "# Slide 4"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "4");
    const { stdout: s4 } = run(["get", tmpFile, "4"]);
    assert.match(s4, /# Slide 4/);
  });

  it("inserts after specific slide", () => {
    run(["append", tmpFile, "# Inserted", "-a", "1"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "4");
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    assert.match(s2, /# Inserted/);
    const { stdout: s3 } = run(["get", tmpFile, "3"]);
    assert.match(s3, /# Slide 2/);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    run(["append", tmpFile, "# New", "--dry-run"]);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: delete", () => {
  it("deletes a slide", () => {
    run(["delete", tmpFile, "2"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "2");
  });

  it("preserves remaining slides after delete", () => {
    run(["delete", tmpFile, "2"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    assert.match(s1, /# Slide 1/);
    assert.match(s2, /# Slide 3/);
  });

  it("deletes first slide", () => {
    run(["delete", tmpFile, "1"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "2");
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    assert.match(s1, /# Slide 2/);
  });

  it("deletes last slide", () => {
    run(["delete", tmpFile, "3"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "2");
  });

  it("deletes range of slides", () => {
    run(["delete", tmpFile, "1-2"]);
    const { stdout } = run(["count", tmpFile]);
    assert.equal(stdout.trim(), "1");
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    assert.match(s1, /# Slide 3/);
  });

  it("rejects non-numeric input", () => {
    const { stderr, exitCode } = run(["delete", tmpFile, "abc"], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
    // File should be unchanged
    const content = readFileSync(tmpFile, "utf-8");
    assert.equal(content, SAMPLE);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run(["delete", tmpFile, "2", "--dry-run"]);
    assert.match(stdout, /dry-run/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: move", () => {
  it("moves a slide forward", () => {
    run(["move", tmpFile, "1", "3"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s3 } = run(["get", tmpFile, "3"]);
    assert.match(s1, /# Slide 2/);
    assert.match(s3, /# Slide 1/);
  });

  it("moves a slide backward", () => {
    run(["move", tmpFile, "3", "1"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    assert.match(s1, /# Slide 3/);
    assert.match(s2, /# Slide 1/);
  });

  it("no-op when same position", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run(["move", tmpFile, "2", "2"]);
    assert.match(stdout, /No change/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    run(["move", tmpFile, "1", "3", "--dry-run"]);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: swap", () => {
  it("swaps two slides", () => {
    run(["swap", tmpFile, "1", "3"]);
    const { stdout: s1 } = run(["get", tmpFile, "1"]);
    const { stdout: s3 } = run(["get", tmpFile, "3"]);
    assert.match(s1, /# Slide 3/);
    assert.match(s3, /# Slide 1/);
    // Middle slide unchanged
    const { stdout: s2 } = run(["get", tmpFile, "2"]);
    assert.match(s2, /# Slide 2/);
  });

  it("no-op when same slide", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const { stdout } = run(["swap", tmpFile, "2", "2"]);
    assert.match(stdout, /No change/);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });

  it("dry-run does not modify file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    run(["swap", tmpFile, "1", "3", "--dry-run"]);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: extract", () => {
  it("extracts a single slide", () => {
    const outFile = join(tmpDir, "out.md");
    run(["extract", tmpFile, "2", outFile]);
    const { stdout } = run(["count", outFile]);
    assert.equal(stdout.trim(), "1");
    const { stdout: s1 } = run(["get", outFile, "1"]);
    assert.match(s1, /# Slide 2/);
  });

  it("extracts a range of slides", () => {
    const outFile = join(tmpDir, "out.md");
    run(["extract", tmpFile, "1-2", outFile]);
    const { stdout } = run(["count", outFile]);
    assert.equal(stdout.trim(), "2");
  });

  it("preserves frontmatter in extracted file", () => {
    const outFile = join(tmpDir, "out.md");
    run(["extract", tmpFile, "1", outFile]);
    const content = readFileSync(outFile, "utf-8");
    assert.match(content, /marp: true/);
  });

  it("does not modify source file", () => {
    const before = readFileSync(tmpFile, "utf-8");
    const outFile = join(tmpDir, "out.md");
    run(["extract", tmpFile, "2", outFile]);
    const after = readFileSync(tmpFile, "utf-8");
    assert.equal(before, after);
  });
});

describe("CLI: error handling", () => {
  it("shows friendly error for missing file", () => {
    const { stderr, exitCode } = run(
      ["get", "/tmp/nonexistent-manip-test.md", "1"],
      true
    );
    assert.equal(exitCode, 1);
    assert.match(stderr, /file not found/);
  });
});

describe("CLI: round-trip integrity", () => {
  it("file unchanged after get operations", () => {
    run(["get", tmpFile, "1"]);
    run(["get", tmpFile, "2"]);
    run(["get", tmpFile, "3"]);
    run(["list", tmpFile]);
    run(["count", tmpFile]);
    const content = readFileSync(tmpFile, "utf-8");
    assert.equal(content, SAMPLE);
  });

  it("edit then re-edit restores original", () => {
    const { stdout: original } = run(["get", tmpFile, "2"]);
    run(["edit", tmpFile, "2", "# Temp"]);
    run(["edit", tmpFile, "2", original.trim()]);
    const { stdout: restored } = run(["get", tmpFile, "2"]);
    assert.match(restored, /# Slide 2/);
  });
});

describe("CLI: CRLF file handling", () => {
  it("handles CRLF files correctly", () => {
    const crlfFile = join(tmpDir, "crlf.md");
    writeFileSync(
      crlfFile,
      "---\r\nmarp: true\r\n---\r\n# Slide 1\r\n\r\n---\r\n\r\n# Slide 2\r\n",
      "utf-8"
    );
    const { stdout } = run(["count", crlfFile]);
    assert.equal(stdout.trim(), "2");
    const { stdout: s1 } = run(["get", crlfFile, "1"]);
    assert.match(s1, /# Slide 1/);
  });
});
