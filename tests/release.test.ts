import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'task-trellis-release-'));
  roots.push(root);
  for (const file of ['manifest.json', 'package.json', 'versions.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'README.md', 'styles.css']) {
    writeFileSync(join(root, file), readFileSync(resolve(file)));
  }
  const notices = ['LICENSE', 'THIRD_PARTY_NOTICES.txt'].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
  writeFileSync(join(root, 'main.js'), `/*! ${notices} */\nmodule.exports = {};`);
  return {
    root,
    version: (JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as { version: string }).version,
    run: (tag?: string, args: string[] = []) => spawnSync(process.execPath, [resolve('scripts/check-release.mjs'), ...args], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, GITHUB_REF_TYPE: tag ? 'tag' : '', GITHUB_REF_NAME: tag ?? '' },
    }),
  };
}

describe('release checks', () => {
  it('packages the three install assets and licenses without publishing', () => {
    const { root, run, version } = fixture();
    const result = run(version, ['--package']);
    expect(result.status, result.stderr).toBe(0);
    for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
      expect(readFileSync(join(root, 'dist/task-trellis', file))).toEqual(readFileSync(join(root, file)));
    }
  });

  it.each([
    ['manifest.json', JSON.stringify({ ...JSON.parse(readFileSync('manifest.json', 'utf8')), version: 'invalid' })],
    ['versions.json', '{}'],
    ['main.js', 'module.exports = {};'],
    ['styles.css', ''],
  ])('rejects incomplete or mismatched %s', (file, content) => {
    const { root, run } = fixture();
    writeFileSync(join(root, file), content);
    expect(run().status).not.toBe(0);
  });

  it('rejects a v-prefixed release tag', () => {
    const { run, version } = fixture();
    expect(run(`v${version}`).status).not.toBe(0);
  });
});
