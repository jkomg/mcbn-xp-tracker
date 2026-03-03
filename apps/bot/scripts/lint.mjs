#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const ALLOWED_ANY_FILES = new Set([
  path.join(SRC_DIR, 'logger.ts'),
]);

const errors = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }
    lintFile(full);
  }
}

function lintFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const allowAny = ALLOWED_ANY_FILES.has(filePath);

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;

    if (/\bTODO\b|\bFIXME\b/.test(line)) {
      errors.push(`${rel(filePath)}:${lineNumber} contains TODO/FIXME`);
    }

    if (!allowAny && (/\bas any\b/.test(line) || /:\s*any\b/.test(line))) {
      errors.push(`${rel(filePath)}:${lineNumber} uses explicit any`);
    }

    if (/process\.env\./.test(line) && !filePath.endsWith(`${path.sep}config.ts`)) {
      errors.push(`${rel(filePath)}:${lineNumber} accesses process.env outside config.ts`);
    }
  });
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

if (!fs.existsSync(SRC_DIR)) {
  console.error('src directory not found');
  process.exit(1);
}

walk(SRC_DIR);

if (errors.length > 0) {
  console.error('Lint failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Lint passed.');
