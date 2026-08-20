#!/usr/bin/env node
/**
 * SC-008 / FR-016: zero visitor facing em dashes, in any language.
 *
 * Copy files (messages/, content/) are checked for the em dash, the en dash and
 * the double hyphen. Source files are checked for dashes only, because CSS
 * custom properties legitimately start with a double hyphen.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const root = process.cwd();

const COPY_DIRS = ['messages', 'content'];
const SOURCE_DIRS = ['src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mdx', '.md']);

const DASHES = /[—–‒―]/;
const DOUBLE_HYPHEN = /--/;

const findings = [];

function walk(dir, onFile) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function check(file, { doubleHyphen }) {
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    const dash = DASHES.test(line);
    const hyphen = doubleHyphen && DOUBLE_HYPHEN.test(line);
    if (!dash && !hyphen) return;

    findings.push({
      file: relative(root, file),
      line: index + 1,
      kind: dash ? 'dash' : 'double hyphen',
      excerpt: line.trim().slice(0, 120),
    });
  });
}

for (const dir of COPY_DIRS) {
  walk(join(root, dir), (file) => {
    if (extname(file) === '.json' || extname(file) === '.mdx') {
      check(file, { doubleHyphen: true });
    }
  });
}

for (const dir of SOURCE_DIRS) {
  walk(join(root, dir), (file) => {
    if (SOURCE_EXTENSIONS.has(extname(file))) check(file, { doubleHyphen: false });
  });
}

if (findings.length > 0) {
  console.error('\nBlocked: forbidden dash found in visitor facing copy.');
  console.error('Use a comma, a colon or parentheses instead (constitution VII).\n');
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  [${finding.kind}]  ${finding.excerpt}`);
  }
  console.error(`\n${findings.length} occurrence(s).\n`);
  process.exit(1);
}

console.log('Copy check passed: no em dash, en dash or double hyphen in visitor facing copy.');
