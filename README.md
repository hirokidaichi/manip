# manip

CLI tool for manipulating [Marp](https://marp.app/) markdown slides by number.

## Install

```bash
npm install -g manip
```

Requires Node.js >= 18.

## Usage

```bash
# List all slides with numbers and titles
manip list slides.md

# Get a specific slide (supports ranges: 3, 1-5, 1,3,5)
manip get slides.md 3
manip get slides.md 1-5

# Edit a slide (replace content)
manip edit slides.md 5 "# New Title\n\nNew content"

# Edit a slide from stdin
echo "# New Content" | manip edit slides.md 5

# Append a slide (at end or after a specific slide)
manip append slides.md "# New Slide"
manip append slides.md "# Inserted Slide" --after 10

# Delete slide(s) (supports ranges)
manip delete slides.md 7
manip delete slides.md 2-4

# Move a slide to a different position
manip move slides.md 5 2

# Swap two slides
manip swap slides.md 3 7

# Extract slides to a new file
manip extract slides.md 2-5 output.md

# Count slides
manip count slides.md

# List image references in a file
manip images slides.md

# Find orphan images (not referenced by any markdown)
manip images --orphan --slides-dir ./slides

# Find missing images (referenced but don't exist)
manip images slides.md --missing --slides-dir ./slides
```

### Options

- `--json` — JSON output for `list`, `get`, `images`
- `--dry-run` — Preview changes without writing for `edit`, `append`, `delete`, `move`, `swap`

## Development

```bash
npm install
npm run build    # Compile TypeScript
npm test         # Build + run tests
npm run dev      # Watch mode
```

## License

MIT
