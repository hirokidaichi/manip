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
});

describe("CLI: get", () => {
  it("returns slide content by number", () => {
    const { stdout } = run(["get", tmpFile, "2"]);
    assert.match(stdout, /# Slide 2/);
    assert.match(stdout, /Content of slide 2/);
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

  it("rejects non-numeric input", () => {
    const { stderr, exitCode } = run(["delete", tmpFile, "abc"], true);
    assert.equal(exitCode, 1);
    assert.match(stderr, /out of range/);
    // File should be unchanged
    const content = readFileSync(tmpFile, "utf-8");
    assert.equal(content, SAMPLE);
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
