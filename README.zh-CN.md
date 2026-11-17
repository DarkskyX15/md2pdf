[English](README.md) | **简体中文**

# md2pdf

对 [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf) 的一个小而顺手的包装：把 `src/` 下的 Markdown 批量转换成排版齐整的 PDF，支持 KaTeX 数学公式、亮色/暗色两套主题，生成的结果可以整体拷走，内部链接依然能点。

底层就是 md-to-pdf（marked + Puppeteer + Chromium）。公式与 PDF 后处理所需的依赖已经放进 `assets/`，**构建过程完全离线**，不需要连 CDN。

## 特性

- **数学公式**：`$...$` 行内、`$$...$$` 块级，支持 `aligned`、`underbrace`、`\left[ \|...\| \right]`、公式内 `\text{中文}`。KaTeX 在 marked 解析阶段直接渲染，`\,`、`\|`、`\\` 不会被 markdown 的转义规则吃掉。
- **亮色 / 暗色主题**：暗色用 `@page` 背景铺满整页，不是只在正文区块后面垫一块深色。
- **一次生成两套**：`--theme both` 输出 `{name}.light.pdf` 与 `{name}.dark.pdf`。
- **链接可用、可搬移**：`[上一篇](01-intuition.md)` 会变成指向 `./01-intuition.pdf` 的相对链接，整个 `dist/` 目录换台机器也能点。
- **中文排版**：A4、CJK 字体栈、代码块自动换行、表格跨页重复表头、公式与引用块避免跨页断裂。

## 目录结构

```text
md2pdf/
├── convert                     # 命令行入口（bash）
├── src/                        # Markdown 源文件（默认转换目录，gitignore）
├── config/
│   └── md-to-pdf.config.js      # md-to-pdf 配置：数学扩展、主题、页边距、链接改写
├── styles/
│   ├── base.css                 # 版式、代码块、表格、分页规则
│   ├── light.css                # 亮色配色
│   └── dark.css                 # 暗色配色
├── assets/
│   ├── katex/                   # KaTeX 0.16.10（JS、CSS、字体、许可证）
│   └── pdf-lib/                 # pdf-lib 1.17.1（链接后处理）
├── tools/
│   └── relativize-links.js      # 把 PDF 里的 file:// 链接改成相对链接
└── dist/                        # 生成产物（已 gitignore）
```

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Node.js | ≥ 18（开发与验证使用 v22） |
| md-to-pdf | 5.x，需全局安装 |
| Chromium / Chrome | md-to-pdf 通过 Puppeteer 调用；Puppeteer 安装时会自动下载 |
| 中文字体 | 建议 Noto Sans CJK SC（Debian/Ubuntu: `fonts-noto-cjk`） |
| bash、coreutils | `convert` 脚本本身 |

KaTeX、pdf-lib、highlight.js 样式均已内置或随 `md-to-pdf` 提供，**不需要**额外 `npm install`。

### 安装依赖

```bash
# 1. Node.js 18+（示例为通过 nvm 安装）
nvm install 22 && nvm use 22

# 2. md-to-pdf（全局安装，同时会拉取 Puppeteer 与 Chromium）
npm install -g md-to-pdf

# 3. 中文字体（缺字会显示成方块）
sudo apt install -y fonts-noto-cjk

# 4. 验证
md-to-pdf --version      # 期望 5.x
node -v                  # 期望 v18 以上
```

## 安装 Puppeteer 与 Chrome

`md-to-pdf` 依赖 Puppeteer，`npm install -g md-to-pdf` 会执行 Puppeteer 的安装脚本，把与它匹配的 **Chrome for Testing** 下载到 Puppeteer 缓存目录（Linux `~/.cache/puppeteer`，macOS `~/Library/Caches/puppeteer`）。一般情况下不需要额外操作，`./convert` 直接可用。

用 md-to-pdf 自带的 Puppeteer 查看已下载的浏览器：

```bash
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/lib/puppeteer/node/cli.js" browsers list
```

```text
chrome@157.0.8103.50 (linux) /home/you/.cache/puppeteer/chrome/linux-157.0.8103.50/chrome-linux64/chrome
```

如果列表为空——例如 CI 里跳过了下载、安装时设了 `PUPPETEER_SKIP_DOWNLOAD=1`，或 `npm install` 时没有网络——可以手动补下载：

```bash
# 方案 A：用 md-to-pdf 自带的 Puppeteer（推荐）
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/lib/puppeteer/node/cli.js" browsers install chrome

# 方案 B：直接执行 Puppeteer 的安装脚本
node "$(npm root -g)/md-to-pdf/node_modules/puppeteer/install.mjs"

# 方案 C：用 npx 抓一个稳定版 Chrome
npx puppeteer browsers install chrome
```

`install.mjs` 支持 Puppeteer 的常用环境变量；CLI 形式（`browsers install chrome@stable`）可以指定通道或版本。

**机器上已经有 Chrome？** 跳过下载，直接指定可执行文件：

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
./convert
```

**自定义缓存位置**（home 目录只读、容器环境）：

```bash
export PUPPETEER_CACHE_DIR="$HOME/.local/share/puppeteer"
```

版本提示：md-to-pdf 固定了特定的 Puppeteer 版本，优先用上面的方案 A/B，而不是再全局装一个更新的 Puppeteer——自带的 CLI 总会下载 md-to-pdf 真正能启动的浏览器版本。

## 快速开始

```bash
git clone git@github.com:DarkskyX15/md2pdf.git
cd md2pdf

cp /path/to/your/*.md src/   # 把自己的 Markdown 放进 src/（该目录不进版本库）
./convert                    # 转换 src/*.md，生成 dist/*.pdf（亮色）
ls dist
```

`src/` 故意不纳入版本控制：仓库只发布工具链，被转换的 Markdown 留在本地。

## 命令行

```text
Usage: ./convert [options] [file.md ...]

Options:
  -t, --theme <light|dark|both>  Theme, default light
  -o, --out <dir>                Output folder, default dist
  -s, --src <dir>                Source folder (discovers *.md), default src
      --no-sandbox               Launch Chrome with --no-sandbox (containers/CI)
      --no-relative-links        Keep absolute file:// links instead of relative
  -h, --help                     Show help

（脚本的运行提示与帮助信息为英文。）
```

常用示例：

```bash
./convert                              # 全部文档，亮色
./convert --theme dark                 # 全部文档，暗色
./convert --theme both                 # 全部文档，亮色 + 暗色
./convert chapter-1.md                 # 只转一篇（相对 src/ 或当前目录均可）
./convert --theme dark chapter-1.md chapter-7.md
./convert --src notes --out build      # 换一个源目录和输出目录
./convert --no-sandbox                 # 容器 / CI 里没有 Chrome 沙箱时
```

`--src` 只发现该目录第一层的 `*.md`，不递归。源目录可以放在仓库之外，此时只有在**同一目录**里的 `.md` 之间才会互相链接。

### 输出命名

| 模式 | 产物 |
| --- | --- |
| `--theme light`（默认） | `dist/{name}.pdf` |
| `--theme dark` | `dist/{name}.pdf`（覆盖同名亮色文件） |
| `--theme both` | `dist/{name}.light.pdf`、`dist/{name}.dark.pdf` |

已有的同名 PDF 会被直接覆盖。默认的 `dist/` 不纳入版本控制，运行 `./convert` 即可重建。

## 工作方式

```text
src/*.md
  └─ marked + 自定义数学扩展 ──────► KaTeX HTML（解析阶段渲染，公式源码不被转义破坏）
       └─ 自定义 link renderer ────► 指向最终 PDF 的 file:// 链接
            └─ Chromium 打印 ──────► A4 PDF（含亮/暗主题 CSS、本地 KaTeX 字体）
                 └─ pdf-lib ───────► 把 file:// 链接改成 ./xxx.pdf 相对链接
```

为什么要多一步 pdf-lib：md-to-pdf 为了让相对路径（CSS、字体）能加载，会先把页面挂在 `http://localhost:<临时端口>/` 上再打印。Chromium 因此会把所有相对链接固化成 `http://localhost:端口/...`，关掉浏览器后就是死链。`config/md-to-pdf.config.js` 先把它改写成最终 PDF 的 `file://` 路径，`tools/relativize-links.js` 再把前缀去掉。

相对链接统一带 `./` 前缀：像 `01-intuition.light.pdf` 这种含多个点的相对地址，Chrome 的 PDF 阅读器会当成域名解析成 `http://01-intuition.light.pdf/`，加上 `./` 才能正确跳转。

## 链接行为

| Markdown 里的写法 | 生成的 PDF 链接 |
| --- | --- |
| `[x](https://example.com)` | 原样保留为外部链接 |
| `[x](01-intuition.md)`（同目录且文件存在） | `./01-intuition.pdf`（both 模式为 `./01-intuition.light.pdf`） |
| `[x](paper.pdf)`（本地文件存在） | 指向该文件的 `file://` 绝对链接（文件不会复制进 `dist/`） |
| `[x](../other/note.md)`（不在同目录） | 只保留文字，不生成链接 |
| `[x](../papers/foo.pdf)`（文件不存在） | 只保留文字，不生成链接 |
| `[x](#anchor)` | 只保留文字（PDF 里没有对应的标题锚点） |

## 自定义

- **配色与字体**：改 `styles/light.css`、`styles/dark.css` 顶部的 CSS 变量（`--bg`、`--fg`、`--link` 等）。
- **正文排版**：改 `styles/base.css`；正文字号 `10.5pt`、行高 `1.7`、页边距都在这里或 `pdf_options` 里调。
- **页边距 / 纸张 / 页脚**：改 `config/md-to-pdf.config.js` 的 `pdf_options`（`format`、`margin`、`headerTemplate` 等）。
- **代码高亮主题**：改配置里的 `highlight_style`（亮色 `github`、暗色 `github-dark`，可换成 `monokai` 等）。
- **改公式支持**：`config/md-to-pdf.config.js` 里的 `mathBlock` / `mathInline` 两个 marked 扩展。

## 常见问题

**Chrome 启动失败：`No usable sandbox!`**

Ubuntu 23.10+ 或容器里默认禁用了非特权 user namespace。加 `--no-sandbox`：

```bash
./convert --no-sandbox
```

**Chrome 启动失败：`Read-only file system` / 无法写 `~/.config/google-chrome`**

`--no-sandbox` 会把 Chrome 的配置和缓存指到临时目录，同时清理；若仍然报错，检查 `$TMPDIR` 是否可写，或用 `PUPPETEER_CACHE_DIR` 指向可写目录。

**中文显示成方块**

安装 `fonts-noto-cjk`，或把 `styles/base.css` 里的 `font-family` 换成机器上已有的中文字体。

**公式显示成原始 LaTeX**

说明公式没被 KaTeX 接管（例如从别的工具拷来的 `\(...\)` 写法）。本项目只识别 `$...$` 与 `$$...$$`；`$$` 块需要独占一段。

**README 目录里出现字面量 `**`**

`**[标题](链接)**：` 这种「粗体包链接 + 紧跟全角标点」的写法，marked 4.x 会退化成普通文本（把 `**[x](y)**：` 换成 `**[x](y)** ：` 就能正常加粗）。这是 marked 对 CJK 标点边界的已知问题，与链接改写无关。

**转换很慢**

每篇文档、每个主题都会单独启动一次无头 Chrome（约 1–2 秒），8 篇 × 2 主题大约 20–30 秒。

## 第三方组件

| 组件 | 版本 | 许可证 | 位置 |
| --- | --- | --- | --- |
| [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf) | 5.2.5 | MIT | 外部依赖 |
| [KaTeX](https://katex.org/) | 0.16.10 | MIT（字体 SIL OFL 1.1） | `assets/katex/` |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | MIT | `assets/pdf-lib/` |

`src/` 下的 Markdown 已被 gitignore，不属于本仓库内容。
