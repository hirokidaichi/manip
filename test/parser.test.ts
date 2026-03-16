import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse, serialize } from "../src/parser.js";

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
