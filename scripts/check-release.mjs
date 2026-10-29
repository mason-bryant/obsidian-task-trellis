import assert from 'node:assert/strict';
import { readFile, mkdir, copyFile, rm } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await readJson('manifest.json');
const pkg = await readJson('package.json');
const versions = await readJson('versions.json');
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/, 'ID must contain lowercase words separated by hyphens.');
assert(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'), 'ID must not contain obsidian or end with plugin.');
assert.match(manifest.name, /^[\x20-\x7e]+$/, 'Name must use Basic Latin characters.');
assert(!/obsidian|plugin/i.test(manifest.name), 'Name must not contain Obsidian or Plugin.');
assert.match(manifest.version, version, 'Version must be x.y.z, without a v prefix.');
assert.match(manifest.minAppVersion, version, 'Minimum app version must be x.y.z.');
assert.equal(manifest.version, pkg.version, 'Manifest and package versions must agree.');
assert.equal(versions[manifest.version], manifest.minAppVersion, 'versions.json must map this version to minAppVersion.');
const notesPath = `docs/releases/${manifest.version}.md`;
const notes = await readFile(notesPath, 'utf8').catch(() => '');
assert(notes.trim(), `${notesPath} is required. Write release notes before packaging or publishing.`);
assert(notes.split(/\r?\n/)[0] === `# Task Trellis ${manifest.version}`, `${notesPath} must start with the matching version heading.`);
assert(notes.split(/\r?\n/).slice(1).join('\n').trim(), `${notesPath} must describe the release, not just contain a heading.`);
for (const [release, minimum] of Object.entries(versions)) {
  assert.match(release, version);
  assert.match(minimum, version);
}
assert(typeof manifest.author === 'string' && manifest.author.trim(), 'Author is required.');
assert.equal(typeof manifest.isDesktopOnly, 'boolean', 'isDesktopOnly must be a boolean.');
assert(typeof manifest.description === 'string' && manifest.description.trim().length > 0);
assert(manifest.description.length <= 250 && manifest.description.endsWith('.'), 'Description must be at most 250 characters and end with a period.');
assert.match(manifest.description, /^[\x20-\x7e]+$/, 'Description must not contain emoji or special characters.');
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, manifest.version, 'Release tag must exactly equal the manifest version.');
}

const files = ['main.js', 'manifest.json', 'styles.css'];
for (const file of [...files, 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) assert((await readFile(file, 'utf8')).trim(), `${file} must not be empty.`);
const bundle = await readFile('main.js', 'utf8');
for (const notice of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
  assert(bundle.includes((await readFile(notice, 'utf8')).replaceAll('*/', '* /')), `${notice} must be preserved in main.js.`);
}
assert(!bundle.includes('sourceMappingURL='), 'Release bundle must not contain a development source map.');
// Catch a stale bundle produced by `npm run dev`, even when it contains the notices.
assert(bundle.includes('module.exports'), 'Release bundle must use CommonJS.');

if (process.argv.includes('--package')) {
  const destination = `dist/${manifest.id}`;
  await mkdir(destination, { recursive: true });
  for (const old of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) await rm(`${destination}/${old}`, { force: true });
  for (const file of files) await copyFile(file, `${destination}/${file}`);
  console.log(`Prepared ${destination} (${manifest.version}). Nothing was uploaded or published.`);
} else {
  console.log(`Release files verified for ${manifest.id} ${manifest.version}.`);
}
