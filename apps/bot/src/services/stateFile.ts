import fs from 'node:fs';
import path from 'node:path';

/**
 * Persist JSON state by writing a sibling temp file and renaming it over the target.
 *
 * WHY NOT writeFileSync IN PLACE: an in-place write needs write permission on the
 * FILE; a rename needs it only on the DIRECTORY. That difference is what bit us in
 * Kubernetes. The state files seeded into the bots' PVCs during the k3s cutover
 * carry the uid of the machine they were copied from (502:wheel, mode 0644), and
 * the pods run as root with `capabilities: drop: ["ALL"]` -- so no
 * CAP_DAC_OVERRIDE, and root cannot open a foreign-owned 0644 file for writing.
 * Every cursor save failed with EACCES for two days while the 0777 directory
 * around them stayed perfectly writable. A frozen cursor is not visible while the
 * pod stays up (the in-memory cursor advances); it surfaces on the next restart,
 * when the notifier resumes from the stale file and re-posts every notification
 * since it froze into players' cubby channels.
 *
 * The rename also makes the write atomic: a crash mid-write leaves the previous
 * file intact instead of a truncated one, which the loaders treat as corrupt and
 * silently discard -- resetting the cursor and causing the same duplicate storm.
 *
 * The one case this does not survive is a sticky-bit directory (mode +t), where
 * replacing another uid's file requires ownership. Bot state directories are not
 * sticky.
 */
export function writeJsonStateFile(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // Same directory, so the rename stays on one filesystem (a cross-device rename
  // fails with EXDEV). The pid keeps two processes pointed at one data dir -- a
  // failover bot started while the primary is still draining -- from colliding.
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best effort — the temp file may never have been created
    }
    throw error;
  }
}
