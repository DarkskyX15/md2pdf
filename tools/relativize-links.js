#!/usr/bin/env node
'use strict';

/**
 * 把 PDF 里指向本输出目录的 file:// 链接改写成相对文件链接。
 *
 * Chrome 生成 PDF 时会把相对 href 解析成绝对地址；config 已经把它改写成
 * 最终文件的 file:// 路径，这一步再去掉前缀，使整个输出目录可以整体搬移。
 *
 * 用法: node tools/relativize-links.js <file.pdf> [<file.pdf> ...]
 */

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const { PDFDocument, PDFName, PDFString } = require('../assets/pdf-lib/pdf-lib.min.js');

const KEY_ACTION = PDFName.of('A');
const KEY_SUBTYPE = PDFName.of('Subtype');
const KEY_TYPE = PDFName.of('S');
const KEY_URI = PDFName.of('URI');

const LINK_SUBTYPE = '/Link';
const URI_ACTION = '/URI';

function nameOf(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value.asString === 'function') {
    return value.asString();
  }
  return String(value);
}

function textOf(value) {
  if (typeof value.decodeText === 'function') {
    return String(value.decodeText());
  }
  return String(value).replace(/^\((.*)\)$/s, '$1');
}

function dictOf(container, key) {
  if (!container || typeof container.lookup !== 'function') {
    return undefined;
  }
  const value = container.lookup(key);
  return value && typeof value.lookup === 'function' ? value : undefined;
}

function toRelativeHref(pdfDir, targetPath) {
  const relative = path.relative(pdfDir, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  const encoded = relative.split(path.sep).map(encodeURIComponent).join('/');
  // 必须带 ./ 前缀：像 01-intuition.light.pdf 这种含多个点的相对地址，
  // Chrome 会当成域名解析成 http://01-intuition.light.pdf/。
  return `./${encoded}`;
}

async function relativize(pdfPath) {
  const absolutePdfPath = path.resolve(pdfPath);
  const pdfDir = path.dirname(absolutePdfPath);
  const original = await fs.promises.readFile(absolutePdfPath);
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const context = doc.context;

  let changed = 0;
  let keptAbsolute = 0;

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) {
      continue;
    }

    for (let index = 0; index < annots.size(); index += 1) {
      const resolved = context.lookup(annots.get(index));
      const annot = resolved && typeof resolved.lookup === 'function' ? resolved : undefined;
      if (!annot) {
        continue;
      }
      if (nameOf(annot.lookup(KEY_SUBTYPE)) !== LINK_SUBTYPE) {
        continue;
      }

      const action = dictOf(annot, KEY_ACTION);
      if (!action) {
        continue;
      }
      if (nameOf(action.lookup(KEY_TYPE)) !== URI_ACTION) {
        continue;
      }

      const uriValue = action.lookup(KEY_URI);
      if (!uriValue) {
        continue;
      }

      const uri = textOf(uriValue);
      if (!uri.startsWith('file://')) {
        continue;
      }

      let targetPath;
      try {
        targetPath = fileURLToPath(uri.split('#')[0]);
      } catch {
        keptAbsolute += 1;
        continue;
      }

      const href = toRelativeHref(pdfDir, path.resolve(targetPath));
      if (!href) {
        keptAbsolute += 1;
        continue;
      }

      action.set(KEY_URI, PDFString.of(href));
      changed += 1;
    }
  }

  if (changed === 0) {
    return { changed, keptAbsolute };
  }

  const bytes = await doc.save({ updateMetadata: false });
  const tempPath = `${absolutePdfPath}.links-${process.pid}.tmp`;
  await fs.promises.writeFile(tempPath, bytes);
  await fs.promises.rename(tempPath, absolutePdfPath);

  return { changed, keptAbsolute };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('用法: node tools/relativize-links.js <file.pdf> [<file.pdf> ...]');
    process.exit(2);
  }

  for (const file of files) {
    try {
      const { changed, keptAbsolute } = await relativize(file);
      const note = keptAbsolute > 0 ? `，${keptAbsolute} 个目录外链接保持绝对路径` : '';
      console.log(`    相对链接: ${changed} 个${note}`);
    } catch (error) {
      console.error(`    相对链接改写失败: ${file}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

main();
