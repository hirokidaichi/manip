# manip

CLI tool for manipulating [Marp](https://marp.app/) markdown slides by number.

## Install

```bash
npm install -g manip
```

## Usage

```bash
# List all slides with numbers and titles
manip list slides.md

# Get a specific slide
manip get slides.md 3

# Edit a slide (replace content)
manip edit slides.md 5 "# New Title\n\nNew content"

# Append a slide (at end or after a specific slide)
manip append slides.md "# New Slide"
manip append slides.md "# Inserted Slide" --after 10

# Delete a slide
manip delete slides.md 7

# Count slides
manip count slides.md

# List image references in a file
manip images slides.md

# Find orphan images (not referenced by any markdown)
manip images --orphan --slides-dir ./slides

# Find missing images (referenced but don't exist)
manip images slides.md --missing --slides-dir ./slides
```

## License

MIT
