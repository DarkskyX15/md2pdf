**English** | [简体中文](README.zh-CN.md)

# md2pdf

A small, opinionated wrapper around [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf) that turns a folder of Markdown into print-ready PDFs with KaTeX math, light/dark themes and internal links that keep working after you copy the whole output folder elsewhere.

Under the hood it is md-to-pdf (marked + Puppeteer + Chromium). KaTeX and the PDF post-processing library are vendored under `assets/`, so **builds run fully offline** — no CDN required.

## Features

- **Math**: inline `$...$` and display `$$...$$`, including `aligned`, `underbrace`, `\left[ \|...\| \right]` and `\text{中文}` inside formulas. KaTeX renders during Markdown parsing, so `\,`, `\|` and `\\` are not eaten by Markdown's escape rules.
- **Light / dark themes**: the dark theme paints the whole page via `@page`, not just the content column.
- **Both themes at once**: `--theme both` emits `{name}.light.pdf` and `{name}.dark.pdf`.
- **Portable links**: `[previous](01-intuition.md)` becomes a link to `./01-intuition.pdf`, so the output folder works on any machine.
- **CJK-friendly layout**: A4, CJK font stack, wrapped code blocks, repeating table headers, and page-break rules for formulas and blockquotes.

## Repository layout

```text
md2pdf/
├── convert                     # CLI entry point (bash)
├── src/                        # Markdown sources (default input folder)
├── config/
│   └── md-to-pdf.config.js      # math extensions, theme, margins, link rewriting
├── styles/
│   ├── base.css                 # layout, code blocks, tables, page breaks
│   ├── light.css                # light palette
│   └── dark.css                 # dark palette
├── assets/
│   ├── katex/                   # KaTeX 0.16.10 (JS, CSS, fonts, license)
│   └── pdf-lib/                 # pdf-lib 1.17.1 (link post-processing)
├── tools/
│   └── relativize-links.js      # rewrites file:// links into relative ones
└── dist/                        # generated output (gitignored)
```

## Requirements

| Dependency | Notes |
| --- | --- |
| Node.js | ≥ 18 (developed and tested on v22) |
| md-to-pdf | 5.x, installed globally |
| Chromium / Chrome | driven by Puppeteer; downloads automatically on install |
| CJK fonts | Noto Sans CJK SC recommended (Debian/Ubuntu: `fonts-noto-cjk`) |
| bash, coreutils | for the `convert` script itself |

KaTeX, pdf-lib and the highlight.js stylesheets are already vendored or shipped with `md-to-pdf`; **no extra `npm install` is needed**.

### Install dependencies

```bash
# 1. Node.js 18+ (example uses nvm)
nvm install 22 && nvm use 22

# 2. md-to-pdf (also pulls in Puppeteer and Chromium)
npm install -g md-to-pdf

# 3. CJK fonts (missing glyphs render as boxes otherwise)
sudo apt install -y fonts-noto-cjk

# 4. Verify
md-to-pdf --version      # expect 5.x
node -v                  # expect v18 or newer
```

## Installing Puppeteer and Chrome

`md-to-pdf` depends on Puppeteer, and `npm install -g md-to-pdf` runs Puppeteer's install script, which downloads a matching **Chrome for Testing** into the Puppeteer cache (`~/.cache/puppeteer` on Linux, `~/Library/Caches/puppeteer` on macOS). In the common case there is nothing else to do — `./convert` just works.

Check what is already cached (using the Puppeteer bundled with your global md-to-pdf):

```bash
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/lib/puppeteer/node/cli.js" browsers list
```

```text
chrome@157.0.8103.50 (linux) /home/you/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome
```

If nothing is listed — for example the download was skipped in CI, `PUPPETEER_SKIP_DOWNLOAD=1` was set, or you have no network during `npm install` — download it explicitly:

```bash
# Option A: use the Puppeteer that md-to-pdf already ships (recommended)
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/lib/puppeteer/node/cli.js" browsers install chrome

# Option B: run Puppeteer's installer script directly
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/install.mjs"

# Option C: fetch a browser with npx (picks a stable Chrome)
npx puppeteer browsers install chrome
```

`install.mjs` accepts Puppeteer's usual flags; the CLI form (`browsers install chrome@stable`) lets you pin a channel or version.

**Already have Chrome?** Skip the download and point Puppeteer at your system binary:

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
./convert
```

**Custom cache location** (read-only home directories, containers):

```bash
export PUPPETEER_CACHE_DIR="$HOME/.local/share/puppeteer"
```

Version note: md-to-pdf pins a specific Puppeteer version, so prefer Option A/B over installing a newer standalone Puppeteer globally — the bundled CLI always downloads a browser revision that md-to-pdf can actually launch.

## Quick start

```bash
git clone git@github.com:DarkskyX15/md2pdf.git
cd md2pdf

./convert                    # src/*.md -> dist/*.pdf (light theme)
ls dist
```

## CLI

```text
Usage: ./convert [options] [file.md ...]

Options:
  -t, --theme <light|dark|both>  Theme, default light
  -o, --out <dir>                Output folder, default dist
  -s, --src <dir>                Source folder (discovers *.md), default src
      --no-sandbox               Launch Chrome with --no-sandbox (containers/CI)
      --no-relative-links        Keep file:// links instead of rewriting to relative
  -h, --help                     Show help
```

> `./convert --help` currently prints the same options in Chinese; the flags, defaults and behaviour are identical.

Common invocations:

```bash
./convert                              # every document, light theme
./convert --theme dark                 # every document, dark theme
./convert --theme both                 # every document, light + dark
./convert 02-ddpm.md                   # one document (resolved against src/ or cwd)
./convert --theme dark 02-ddpm.md 07-math-optional.md
./convert --src notes --out build      # different source and output folders
./convert --no-sandbox                 # containers / CI without a Chrome sandbox
```

`--src` only discovers `*.md` directly inside the given folder (no recursion). The source folder may live outside this repository; in that case only Markdown files **in the same folder** link to each other.

### Output naming

| Mode | Files |
| --- | --- |
| `--theme light` (default) | `dist/{name}.pdf` |
| `--theme dark` | `dist/{name}.pdf` (overwrites the light one) |
| `--theme both` | `dist/{name}.light.pdf`, `dist/{name}.dark.pdf` |

Existing PDFs with the same name are overwritten. `dist/` is not versioned — run `./convert` to rebuild.

## How it works

```text
src/*.md
  └─ marked + custom math extensions ──► KaTeX HTML (rendered during parsing)
       └─ custom link renderer ─────────► file:// links to the final PDFs
            └─ Chromium print ──────────► A4 PDF (theme CSS, local KaTeX fonts)
                 └─ pdf-lib ────────────► file:// rewritten to ./name.pdf
```

Why the extra pdf-lib step: to resolve relative paths (CSS, fonts), md-to-pdf serves the page from `http://localhost:<port>/` and then prints it. Chromium therefore bakes every relative link into `http://localhost:<port>/...`, which is dead as soon as the browser closes. `config/md-to-pdf.config.js` first rewrites those links to the final `file://` paths, and `tools/relativize-links.js` strips the prefix afterwards.

Relative links always carry a `./` prefix: Chrome's PDF viewer treats a name with several dots — such as `01-intuition.light.pdf` — as a host and resolves it to `http://01-intuition.light.pdf/`. The `./` makes it resolve as a path.

## Link behavior

| Markdown | Resulting PDF link |
| --- | --- |
| `[x](https://example.com)` | kept as an external link |
| `[x](01-intuition.md)` (same folder, file exists) | `./01-intuition.pdf` (`.light.pdf` / `.dark.pdf` in both mode) |
| `[x](paper.pdf)` (local file exists) | absolute `file://` link (the file is not copied into `dist/`) |
| `[x](../other/note.md)` (different folder) | text only |
| `[x](../papers/foo.pdf)` (file missing) | text only |
| `[x](#anchor)` | text only (PDF has no matching heading anchors) |

## Customization

- **Colors and fonts**: CSS variables (`--bg`, `--fg`, `--link`, …) at the top of `styles/light.css` and `styles/dark.css`.
- **Body typography**: `styles/base.css` — 10.5pt body text, 1.7 line height, spacing, page-break rules.
- **Margins / paper / header-footer**: `pdf_options` in `config/md-to-pdf.config.js` (`format`, `margin`, `headerTemplate`, …).
- **Code highlighting**: `highlight_style` in the config (`github` for light, `github-dark` for dark; `monokai` etc. also work).
- **Math support**: the `mathBlock` / `mathInline` marked extensions in `config/md-to-pdf.config.js`.

## Troubleshooting

**`No usable sandbox!` when Chrome starts**

Ubuntu 23.10+ and most containers disable unprivileged user namespaces:

```bash
./convert --no-sandbox
```

**`Read-only file system` while writing `~/.config/google-chrome`**

`--no-sandbox` points Chrome's profile and cache at a temporary directory that is cleaned up afterwards. If it still fails, check that `$TMPDIR` is writable or set `PUPPETEER_CACHE_DIR` to a writable path.

**Chinese text renders as boxes**

Install `fonts-noto-cjk`, or replace the `font-family` in `styles/base.css` with a CJK font you already have.

**Formulas appear as raw LaTeX**

The formula was not picked up by KaTeX — this project only understands `$...$` and `$$...$$` (not `\(...\)`), and a `$$` block must be its own paragraph.

**Literal `**` in the README table of contents**

In `src/README.md`, the pattern `**[title](link)**：` (bold wrapping a link, immediately followed by a full-width punctuation) degrades to plain text in marked 4.x; adding a space before the punctuation (`**[x](y)** ：`) fixes it. This is a known marked issue with CJK punctuation boundaries, unrelated to link rewriting.

**Slow conversions**

Every document and theme starts its own headless Chrome (about 1–2 seconds each); 8 documents × 2 themes takes roughly 20–30 seconds.

## Third-party components

| Component | Version | License | Location |
| --- | --- | --- | --- |
| [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf) | 5.2.5 | MIT | external dependency |
| [KaTeX](https://katex.org/) | 0.16.10 | MIT (fonts: SIL OFL 1.1) | `assets/katex/` |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | MIT | `assets/pdf-lib/` |

Tutorial text under `src/` remains © its original author.
