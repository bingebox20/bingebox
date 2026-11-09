import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';

let writes: Promise<void> = Promise.resolve();

/** Replace one setting without rewriting unrelated configuration. Writes are
 * serialized and atomic; the new file is readable only by the server owner. */
export function setEnvValue(file: string, name: string, value: string): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !/^[a-zA-Z0-9_@.+-]+$/.test(value))
    return Promise.reject(new Error('Invalid environment setting.'));
  const operation = writes.then(async () => {
    let content = '';
    try { content = await readFile(file, 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const match = new RegExp(`^\\s*(?:export[ \\t]+)?${name}[ \\t]*=`);
    let replaced = false;
    const lines = content.split(/\r?\n/).filter((line) => {
      if (!match.test(line)) return true;
      if (replaced) return false;
      replaced = true;
      return true;
    }).map((line) => match.test(line) ? `${name}=${value}` : line);
    if (!replaced) {
      if (lines.at(-1) === '') lines.pop();
      lines.push(`${name}=${value}`);
    }
    if (lines.at(-1) !== '') lines.push('');
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(lines.join(newline), 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  });
  writes = operation.catch(() => {});
  return operation;
}
