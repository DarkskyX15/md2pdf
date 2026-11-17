# md2pdf

把 `src/` 下的 Markdown 教程批量转换成排版齐整的 PDF：支持 KaTeX 数学公式、亮色/暗色两套主题，生成的结果可以整体拷走，内部链接依然能点。

底层使用 [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf)（marked + Puppeteer + Chromium），公式与 PDF 后处理所需的依赖都已经放进 `assets/`，**构建过程完全离线**，不需要连 CDN。

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
├── src/                        # Markdown 源文件（默认转换目录）
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
# 1. Node.js 18+（示例为 Ubuntu 通过 nvm 安装）
nvm install 22 && nvm use 22

# 2. md-to-pdf（全局安装，同时会拉取 Puppeteer 与 Chromium）
npm install -g md-to-pdf

# 3. 中文字体（缺字会显示成方块）
sudo apt install -y fonts-noto-cjk

# 4. 验证
md-to-pdf --version      # 期望 5.x
node -v                  # 期望 v18 以上
```

如果机器上已经有系统 Chrome，希望复用而不是让 Puppeteer 下载，可以设置：

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

Puppeteer 默认把浏览器下载到 `~/.cache/puppeteer`；如果该目录不可写（例如只读的容器环境），按下面「常见问题」处理。

## 快速开始

```bash
git clone <repo-url> md2pdf
cd md2pdf

./convert                    # 转换 src/*.md，生成 dist/*.pdf（亮色）
ls dist
```

## 命令行

```text
用法: ./convert [选项] [file.md ...]

选项:
  -t, --theme <light|dark|both>  主题，默认 light
  -o, --out <dir>                输出目录，默认 dist
  -s, --src <dir>                源目录（发现该目录下的 *.md），默认 src
      --no-sandbox               受限环境（容器/CI）下以 --no-sandbox 启动 Chrome
      --no-relative-links        保留 file:// 绝对链接，不改写为相对链接
  -h, --help                     显示帮助
```

常用示例：

```bash
./convert                              # 全部文档，亮色
./convert --theme dark                 # 全部文档，暗色
./convert --theme both                 # 全部文档，亮色 + 暗色
./convert 02-ddpm.md                   # 只转一篇（相对 src/ 或当前目录均可）
./convert --theme dark 02-ddpm.md 07-math-optional.md
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

`--no-sandbox` 会把 Chrome 的配置和缓存指到临时目录，同时清理；若仍然报错，检查 `$TMPDIR` 是否可写。

**中文显示成方块**

安装 `fonts-noto-cjk`，或把 `styles/base.css` 里的 `font-family` 换成机器上已有的中文字体。

**公式显示成原始 LaTeX**

说明公式没被 KaTeX 接管（例如从别的工具拷来的 `\(...\)` 写法）。本项目只识别 `$...$` 与 `$$...$$`；`$$` 块需要独占一段。

**README 目录里出现字面量 `**`**

`src/README.md` 的 `**[标题](链接)**：` 这种「粗体包链接 + 紧跟全角标点」的写法，marked 4.x 会退化成普通文本（把 `**[x](y)**：` 换成 `**[x](y)** ：` 就能正常加粗）。这是 marked 对 CJK 标点边界的已知问题，与链接改写无关。

**转换很慢**

每篇文档、每个主题都会单独启动一次无头 Chrome（约 1–2 秒），8 篇 × 2 主题大约 20–30 秒。

## 第三方组件

| 组件 | 版本 | 许可证 | 位置 |
| --- | --- | --- | --- |
| [md-to-pdf](https://github.com/simonhaenisch/md-to-pdf) | 5.2.5 | MIT | 外部依赖 |
| [KaTeX](https://katex.org/) | 0.16.10 | MIT（字体 SIL OFL 1.1） | `assets/katex/` |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | MIT | `assets/pdf-lib/` |

`src/` 下的教程文字版权归原作者所有。
