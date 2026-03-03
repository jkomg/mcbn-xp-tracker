#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INCLUDE_EXT = new Set(['.ts', '.js', '.mjs', '.json', '.md', '.yml', '.yaml']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist']);
const errors = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        walk(fullPath);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDE_EXT.has(ext)) {
      continue;
    }

    checkFile(fullPath);
  }
}

function checkFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(ROOT, filePath);
  const lines = text.split('\n');

  if (text.includes('\r')) {
    errors.push(`${rel}: contains CRLF characters`);
  }

  lines.forEach((line, idx) => {
    if (/\s+$/.test(line)) {
      errors.push(`${rel}:${idx + 1} has trailing whitespace`);
    }
  });

  if (text.length > 0 && !text.endsWith('\n')) {
    errors.push(`${rel}: missing trailing newline`);
  }
}

walk(ROOT);

if (errors.length > 0) {
  console.error('Format check failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Format check passed.');
