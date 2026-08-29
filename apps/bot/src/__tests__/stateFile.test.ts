import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonStateFile } from '../services/stateFile';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbn-state-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe('writeJsonStateFile', () => {
  it('creates the state directory when it does not exist yet', () => {
    const target = path.join(makeTempDir(), 'nested', 'cursor.json');

    writeJsonStateFile(target, { cursorEpoch: 42 });

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ cursorEpoch: 42 });
  });

  it('overwrites an existing state file', () => {
    const target = path.join(makeTempDir(), 'cursor.json');
    writeJsonStateFile(target, { cursorEpoch: 1 });

    writeJsonStateFile(target, { cursorEpoch: 2 });

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ cursorEpoch: 2 });
  });

  it('leaves no temp files behind', () => {
    const dir = makeTempDir();
    writeJsonStateFile(path.join(dir, 'cursor.json'), { cursorEpoch: 1 });

    expect(fs.readdirSync(dir)).toEqual(['cursor.json']);
  });

  // The regression this helper exists for: the k3s cutover seeded the bots' PVCs
  // with state files owned by another uid at mode 0644, and the pods run as root
  // with all capabilities dropped -- no CAP_DAC_OVERRIDE, so an in-place write
  // fails with EACCES even though the directory is writable. A rename only needs
  // the directory, so it still lands.
  it('replaces a read-only file, which an in-place write cannot', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'cursor.json');
    fs.writeFileSync(target, JSON.stringify({ cursorEpoch: 1 }));
    fs.chmodSync(target, 0o444);

    // Root ignores the mode bits in a plain test environment, so only assert the
    // in-place failure where the mode is actually enforced.
    if (process.getuid?.() !== 0) {
      expect(() => fs.writeFileSync(target, 'nope')).toThrow(
        expect.objectContaining({ code: 'EACCES' }),
      );
    }

    writeJsonStateFile(target, { cursorEpoch: 2 });

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ cursorEpoch: 2 });
  });

  it('preserves the previous file when serialization fails mid-write', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'cursor.json');
    writeJsonStateFile(target, { cursorEpoch: 1 });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => writeJsonStateFile(target, circular)).toThrow();

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ cursorEpoch: 1 });
    expect(fs.readdirSync(dir)).toEqual(['cursor.json']);
  });
});
