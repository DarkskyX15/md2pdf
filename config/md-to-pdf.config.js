'use strict';

/**
 * md-to-pdf configuration for this workspace.
 *
 * Theme is selected by the convert script through MD2PDF_THEME.
 * Math is handled before marked's escape rules: the extensions below turn
 * $...$ / $$...$$ into KaTeX HTML directly, so sequences like \, \| \\ survive.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');
const katex = require(path.join(rootDir, 'assets', 'katex', 'katex.min.js'));

const theme = process.env.MD2PDF_THEME === 'dark' ? 'dark' : 'light';
const errorColor = theme === 'dark' ? '#ff7b72' : '#cf222e';

// convert 在每次调用 md-to-pdf 前设置这些变量。
// Chrome 会把相对链接解析成 http://localhost:port/...，因此这里直接改写成
// 最终 PDF 的 file:// 地址，避免临时服务器地址被写进 PDF。
const sourceDir = process.env.MD2PDF_SOURCE_DIR
  ? path.resolve(process.env.MD2PDF_SOURCE_DIR)
  : rootDir;
const outputDir = process.env.MD2PDF_OUTPUT_DIR
  ? path.resolve(process.env.MD2PDF_OUTPUT_DIR)
  : rootDir;
const linkSuffix = process.env.MD2PDF_LINK_SUFFIX || '.pdf';

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderLink(href, title, text) {
  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';

  if (!href) {
    return text;
  }

  // 不把脚本类 URL 带进 PDF。
  if (/^(?:javascript|vbscript|data):/i.test(href)) {
    return text;
  }

  // 外部链接和已经是绝对地址的链接保持原样。
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith('//')) {
    return `<a href="${escapeAttribute(href)}"${titleAttribute}>${text}</a>`;
  }

  // 文档没有标题锚点，保留 # 链接只会得到 localhost 地址，直接退化为文本。
  if (href.startsWith('#')) {
    return text;
  }

  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    decoded = href;
  }

  const pathPart = decoded.split(/[?#]/, 1)[0];
  if (!pathPart) {
    return text;
  }

  const targetPath = path.resolve(sourceDir, pathPart);
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return text;
  }

  if (pathPart.toLowerCase().endsWith('.md')) {
    // 只有同目录下的 Markdown 才会被一起转换，链接到别处的 .md 只保留文字。
    if (path.dirname(targetPath) !== sourceDir) {
      return text;
    }

    const pdfName = `${path.basename(targetPath).replace(/\.md$/i, '')}${linkSuffix}`;
    const pdfPath = path.join(outputDir, pdfName);
    return `<a href="${escapeAttribute(pathToFileURL(pdfPath).href)}"${titleAttribute}>${text}</a>`;
  }

  return `<a href="${escapeAttribute(pathToFileURL(targetPath).href)}"${titleAttribute}>${text}</a>`;
}

function renderMath(tex, displayMode) {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    errorColor,
    strict: 'ignore',
    trust: false,
    output: 'html',
  });
}

const mathBlock = {
  name: 'mathBlock',
  level: 'block',
  start(src) {
    const index = src.indexOf('$$');
    return index === -1 ? undefined : index;
  },
  tokenizer(src) {
    const match = /^\$\$[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src);
    if (!match) {
      return undefined;
    }
    const text = match[1].trim();
    if (!text) {
      return undefined;
    }
    return { type: 'mathBlock', raw: match[0], text };
  },
  renderer(token) {
    return renderMath(token.text, true) + '\n';
  },
};

const mathInline = {
  name: 'mathInline',
  level: 'inline',
  start(src) {
    const index = src.search(/\$(?!\$)/);
    return index === -1 ? undefined : index;
  },
  tokenizer(src) {
    // Avoid common currency forms such as "$5" and "$5 到 $10".
    const match = /^\$(?!\$)(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?![\d$])/.exec(src);
    if (!match) {
      return undefined;
    }
    const text = match[1].trim();
    if (!text) {
      return undefined;
    }
    return { type: 'mathInline', raw: match[0], text };
  },
  renderer(token) {
    return renderMath(token.text, false);
  },
};

const launchOptions = {};

if (process.env.MD2PDF_NO_SANDBOX === '1') {
  launchOptions.args = ['--no-sandbox', '--disable-dev-shm-usage'];
}

if (process.env.MD2PDF_CHROME_PROFILE) {
  launchOptions.userDataDir = process.env.MD2PDF_CHROME_PROFILE;
}

module.exports = {
  stylesheet: [
    path.join(rootDir, 'assets', 'katex', 'katex.min.css'),
    path.join(rootDir, 'styles', 'base.css'),
    path.join(rootDir, 'styles', `${theme}.css`),
  ],
  body_class: [`theme-${theme}`],
  page_media_type: process.env.MD2PDF_MEDIA_TYPE === 'screen' ? 'screen' : 'print',
  highlight_style: theme === 'dark' ? 'github-dark' : 'github',
  marked_extensions: [
    { extensions: [mathBlock, mathInline] },
    { renderer: { link: renderLink } },
  ],
  pdf_options: {
    printBackground: true,
    format: 'A4',
    margin: {
      top: '20mm',
      right: '18mm',
      bottom: '20mm',
      left: '18mm',
    },
  },
  launch_options: launchOptions,
};
