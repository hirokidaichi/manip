import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  extractImageRefs,
  listImages,
  findOrphans,
  findMissing,
  listAllImageFiles,
  findAllMdFiles,
  buildReferenceMap,
} from "../src/images.js";

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

let tmpDir: string;

function setupSlidesDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "manip-images-test-"));

  // Create images directory with some files
  mkdirSync(join(tmpDir, "images"));
  mkdirSync(join(tmpDir, "images", "arch"));
  writeFileSync(join(tmpDir, "images", "background.jpeg"), "fake");
  writeFileSync(join(tmpDir, "images", "eot.png"), "fake");
  writeFileSync(join(tmpDir, "images", "orphan.png"), "fake");
  writeFileSync(join(tmpDir, "images", "arch", "diagram.png"), "fake");

  // Create md files
  writeFileSync(
    join(tmpDir, "test1.md"),
    `---
marp: true
---

# Slide 1

![bg](images/background.jpeg)

---

# Slide 2

![bg right:40%](images/eot.png)

---

# Slide 3

![](images/arch/diagram.png)
`,
    "utf-8"
  );

  writeFileSync(
    join(tmpDir, "test2.md"),
    `---
marp: true
---

# Slide 1

![bg](images/background.jpeg)

---

# Slide 2

<img src="images/missing.png">
`,
    "utf-8"
  );

  // Create subdirectory with md
  mkdirSync(join(tmpDir, "subdir"));
  writeFileSync(
    join(tmpDir, "subdir", "nested.md"),
    `---
marp: true
---

# Nested

![](images/eot.png)
`,
    "utf-8"
  );

  return tmpDir;
}

beforeEach(() => {
  setupSlidesDir();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true });
});

describe("extractImageRefs", () => {
  it("extracts markdown image refs", () => {
    const content = "![bg](images/foo.png)\n![](images/bar.jpg)";
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/bar.jpg", "images/foo.png"]);
  });

  it("extracts HTML img src refs", () => {
    const content = '<img src="images/foo.png">';
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/foo.png"]);
  });

  it("extracts HTML video src refs", () => {
    const content = '<video src="images/video.mp4">';
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/video.mp4"]);
  });

  it("extracts bg image refs with modifiers", () => {
    const content = "![bg right:40% brightness:1.2](images/eot.png)";
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/eot.png"]);
  });

  it("returns empty array for no refs", () => {
    const refs = extractImageRefs("# Just a title\n\nSome text");
    assert.deepEqual(refs, []);
  });

  it("deduplicates refs", () => {
    const content = "![](images/a.png)\n![](images/a.png)";
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/a.png"]);
  });

  it("normalizes ./images/ to images/", () => {
    const content = "![](./images/foo.png)\n![bg](./images/bar.png)";
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/bar.png", "images/foo.png"]);
  });

  it("normalizes ./images/ in HTML src", () => {
    const content = '<img src="./images/foo.png">';
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/foo.png"]);
  });

  it("deduplicates across ./images/ and images/", () => {
    const content = "![](images/a.png)\n![](./images/a.png)";
    const refs = extractImageRefs(content);
    assert.deepEqual(refs, ["images/a.png"]);
  });
});

describe("listAllImageFiles", () => {
  it("lists all image files recursively", () => {
    const files = listAllImageFiles(tmpDir);
    assert.ok(files.includes("images/background.jpeg"));
    assert.ok(files.includes("images/eot.png"));
    assert.ok(files.includes("images/orphan.png"));
    assert.ok(files.includes("images/arch/diagram.png"));
  });
});

describe("findAllMdFiles", () => {
  it("finds md files in root and subdirectories", () => {
    const mdFiles = findAllMdFiles(tmpDir);
    assert.ok(mdFiles.some((f) => f.endsWith("test1.md")));
    assert.ok(mdFiles.some((f) => f.endsWith("test2.md")));
    assert.ok(mdFiles.some((f) => f.endsWith("nested.md")));
  });
});

describe("buildReferenceMap", () => {
  it("maps image paths to referencing md files", () => {
    const refMap = buildReferenceMap(tmpDir);
    // background.jpeg is referenced by test1.md and test2.md
    const bgRefs = refMap.get("images/background.jpeg");
    assert.ok(bgRefs);
    assert.equal(bgRefs.length, 2);
    // eot.png is referenced by test1.md and nested.md
    const eotRefs = refMap.get("images/eot.png");
    assert.ok(eotRefs);
    assert.equal(eotRefs.length, 2);
  });
});

describe("findOrphans", () => {
  it("detects unreferenced image files", () => {
    const { orphans } = findOrphans(tmpDir);
    assert.ok(orphans.includes("images/orphan.png"));
    assert.ok(!orphans.includes("images/background.jpeg"));
    assert.ok(!orphans.includes("images/eot.png"));
  });
});

describe("findMissing", () => {
  it("detects references to non-existent files", () => {
    const mdFile = join(tmpDir, "test2.md");
    const { missing } = findMissing(mdFile, tmpDir);
    assert.ok(missing.includes("images/missing.png"));
  });

  it("returns empty for file with all valid refs", () => {
    const mdFile = join(tmpDir, "test1.md");
    const { missing } = findMissing(mdFile, tmpDir);
    assert.equal(missing.length, 0);
  });
});

describe("CLI: images", () => {
  it("lists image references in a file", () => {
    const mdFile = join(tmpDir, "test1.md");
    const { stdout } = run(["images", mdFile, "--slides-dir", tmpDir]);
    assert.match(stdout, /images\/background\.jpeg/);
    assert.match(stdout, /images\/eot\.png/);
    assert.match(stdout, /images\/arch\/diagram\.png/);
  });

  it("finds orphans with --orphan", () => {
    const { stdout } = run(["images", "--orphan", "--slides-dir", tmpDir]);
    assert.match(stdout, /orphan\.png/);
  });

  it("finds missing with --missing", () => {
    const mdFile = join(tmpDir, "test2.md");
    const { stdout } = run([
      "images",
      mdFile,
      "--missing",
      "--slides-dir",
      tmpDir,
    ]);
    assert.match(stdout, /missing\.png/);
  });

  it("reports no missing for clean file", () => {
    const mdFile = join(tmpDir, "test1.md");
    const { stdout } = run([
      "images",
      mdFile,
      "--missing",
      "--slides-dir",
      tmpDir,
    ]);
    assert.match(stdout, /No missing/);
  });

  it("errors when --missing without file", () => {
    const { stderr, exitCode } = run(
      ["images", "--missing", "--slides-dir", tmpDir],
      true
    );
    assert.equal(exitCode, 1);
  });
});
