import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse, serialize, parseSlideRange, ManipError } from "../src/parser.js";

describe("parse", () => {
  it("parses frontmatter and slides", () => {
    const input = `---
marp: true
theme: custom
---
# Slide 1

---

# Slide 2
`;
    const doc = parse(input);
    assert.equal(doc.frontmatter, "---\nmarp: true\ntheme: custom\n---");
    assert.equal(doc.slides.length, 2);
    assert.match(doc.slides[0], /# Slide 1/);
    assert.match(doc.slides[1], /# Slide 2/);
  });

  it("handles content without frontmatter", () => {
    const input = `# Slide 1

---

# Slide 2`;
    const doc = parse(input);
    assert.equal(doc.frontmatter, "");
    assert.equal(doc.slides.length, 2);
  });

  it("parses single slide with frontmatter", () => {
    const input = `---
marp: true
---
# Only slide
`;
    const doc = parse(input);
    assert.equal(doc.slides.length, 1);
    assert.match(doc.slides[0], /# Only slide/);
  });

  it("preserves HTML and comments in slides", () => {
    const input = `---
marp: true
---

<div class="grid">content</div>

<!-- note: speaker note -->

---

# Slide 2
`;
    const doc = parse(input);
    assert.equal(doc.slides.length, 2);
    assert.match(doc.slides[0], /<div class="grid">content<\/div>/);
    assert.match(doc.slides[0], /<!-- note: speaker note -->/);
  });

  it("handles video-bg slides", () => {
    const input = `---
marp: true
---

<!--
_class: video-bg
_color: white
-->

<video autoplay loop muted playsinline style="filter:brightness(0.5);">
  <source src="images/bg.mp4" type="video/mp4">
</video>

# Title

---

# Next slide
`;
    const doc = parse(input);
    assert.equal(doc.slides.length, 2);
    assert.match(doc.slides[0], /video-bg/);
    assert.match(doc.slides[0], /<video/);
    assert.match(doc.slides[0], /bg\.mp4/);
  });

  it("handles empty file", () => {
    const doc = parse("");
    assert.equal(doc.frontmatter, "");
    assert.equal(doc.slides.length, 1);
    assert.equal(doc.slides[0], "");
  });

  it("normalizes Windows CRLF line endings", () => {
    const input = "---\r\nmarp: true\r\n---\r\n# Slide 1\r\n\r\n---\r\n\r\n# Slide 2\r\n";
    const doc = parse(input);
    assert.equal(doc.frontmatter, "---\nmarp: true\n---");
    assert.equal(doc.slides.length, 2);
    assert.match(doc.slides[0], /# Slide 1/);
    assert.match(doc.slides[1], /# Slide 2/);
  });

  it("handles mixed CRLF and LF", () => {
    const input = "---\r\nmarp: true\n---\n# Slide 1\r\n\n---\n\n# Slide 2\n";
    const doc = parse(input);
    assert.equal(doc.slides.length, 2);
  });

  it("handles unicode/emoji content", () => {
    const input = `---
marp: true
---
# スライド 1 🎉

日本語テキスト

---

# Slide 2 ✨
`;
    const doc = parse(input);
    assert.equal(doc.slides.length, 2);
    assert.match(doc.slides[0], /スライド 1/);
    assert.match(doc.slides[1], /Slide 2/);
  });
});

describe("serialize", () => {
  it("round-trips frontmatter + slides", () => {
    const input = `---
marp: true
theme: custom
---
# Slide 1

---

# Slide 2
`;
    const doc = parse(input);
    assert.equal(serialize(doc), input);
  });

  it("round-trips content without frontmatter", () => {
    const input = `# Slide 1

---

# Slide 2`;
    const doc = parse(input);
    assert.equal(serialize(doc), input);
  });

  it("serializes empty frontmatter without prefix", () => {
    const doc = { frontmatter: "", slides: ["# A", "# B"] };
    assert.equal(serialize(doc), "# A\n---\n# B");
  });
});

describe("parse + serialize round-trip", () => {
  it("preserves complex multi-slide content", () => {
    const input = `---
marp: true
size: 16:9
theme: custom
title: Test
transition: reveal
paginate: true
---

<script src="https://cdn.tailwindcss.com/3.0.16"></script>

![bg brightness:0.75](images/background.jpeg)

# Title
## Subtitle

<!-- note: first note -->

---

<!--
_class: video-bg
_color: white
-->

<video autoplay loop muted playsinline style="filter:brightness(0.5);">
  <source src="images/bg.mp4" type="video/mp4">
</video>

# Video Slide

---

# Normal Slide

<div class="grid grid-cols-2 gap-8 mt-8">
  <div class="bg-gray-50 rounded-lg p-6">
    <h3>Column 1</h3>
  </div>
  <div class="bg-gray-50 rounded-lg p-6">
    <h3>Column 2</h3>
  </div>
</div>

<!-- note:
Multi-line
speaker note
-->
`;
    const doc = parse(input);
    assert.equal(doc.slides.length, 3);
    assert.equal(serialize(doc), input);
  });

  it("round-trips CRLF content (normalized to LF)", () => {
    const input = "---\r\nmarp: true\r\n---\r\n# Slide 1\r\n\r\n---\r\n\r\n# Slide 2\r\n";
    const doc = parse(input);
    const output = serialize(doc);
    // After round-trip, CRLF is normalized to LF
    assert.ok(!output.includes("\r\n"));
    const reparsed = parse(output);
    assert.equal(reparsed.slides.length, 2);
  });
});

describe("slide manipulation", () => {
  const base = `---
marp: true
---
# Slide 1

---

# Slide 2

---

# Slide 3
`;

  it("edit replaces a slide correctly", () => {
    const doc = parse(base);
    doc.slides[1] = "\n# Replaced\n";
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 3);
    assert.match(result.slides[1], /# Replaced/);
    assert.match(result.slides[0], /# Slide 1/);
    assert.match(result.slides[2], /# Slide 3/);
  });

  it("delete removes a slide and preserves others", () => {
    const doc = parse(base);
    doc.slides.splice(1, 1);
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0], /# Slide 1/);
    assert.match(result.slides[1], /# Slide 3/);
  });

  it("delete first slide", () => {
    const doc = parse(base);
    doc.slides.splice(0, 1);
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0], /# Slide 2/);
    assert.match(result.slides[1], /# Slide 3/);
  });

  it("delete last slide", () => {
    const doc = parse(base);
    doc.slides.splice(2, 1);
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0], /# Slide 1/);
    assert.match(result.slides[1], /# Slide 2/);
  });

  it("delete until one slide remains", () => {
    const doc = parse(base);
    doc.slides.splice(1, 2);
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 1);
    assert.match(result.slides[0], /# Slide 1/);
  });

  it("append adds a slide at the end", () => {
    const doc = parse(base);
    doc.slides.push("\n# Slide 4\n");
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 4);
    assert.match(result.slides[3], /# Slide 4/);
  });

  it("insert after a specific slide", () => {
    const doc = parse(base);
    doc.slides.splice(1, 0, "\n# Inserted\n");
    const result = parse(serialize(doc));
    assert.equal(result.slides.length, 4);
    assert.match(result.slides[0], /# Slide 1/);
    assert.match(result.slides[1], /# Inserted/);
    assert.match(result.slides[2], /# Slide 2/);
    assert.match(result.slides[3], /# Slide 3/);
  });
});

describe("parseSlideRange", () => {
  it("parses single number", () => {
    assert.deepEqual(parseSlideRange("3", 5), [2]);
  });

  it("parses range", () => {
    assert.deepEqual(parseSlideRange("2-4", 5), [1, 2, 3]);
  });

  it("parses comma-separated", () => {
    assert.deepEqual(parseSlideRange("1,3,5", 5), [0, 2, 4]);
  });

  it("parses mixed range and numbers", () => {
    assert.deepEqual(parseSlideRange("1,3-5", 5), [0, 2, 3, 4]);
  });

  it("deduplicates overlapping ranges", () => {
    assert.deepEqual(parseSlideRange("1-3,2-4", 5), [0, 1, 2, 3]);
  });

  it("throws on out-of-range number", () => {
    assert.throws(() => parseSlideRange("0", 5), ManipError);
    assert.throws(() => parseSlideRange("6", 5), ManipError);
  });

  it("throws on invalid range", () => {
    assert.throws(() => parseSlideRange("5-3", 5), ManipError);
  });

  it("throws on non-numeric", () => {
    assert.throws(() => parseSlideRange("abc", 5), ManipError);
  });
});
