import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repo = 'siriketuanal-cpu/Abyss.2';
const expectedHead = 'ae0d9bb61a895d91c0d5ee3dbb0657a3a72a3208';

function run(command, args, input) {
  return execFileSync(command, args, { encoding: 'utf8', input }).trim();
}

function api(path, method = 'GET', body) {
  const args = ['api', '--method', method, path];
  if (body !== undefined) args.push('--input', '-');
  const output = run('gh', args, body === undefined ? undefined : JSON.stringify(body));
  const clean = output.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-nqry=><~]))?/g, '');
  return JSON.parse(clean);
}

function createBlob(path) {
  const content = readFileSync(path, 'utf8');
  return api(`repos/${repo}/git/blobs`, 'POST', {
    content: Buffer.from(content, 'utf8').toString('base64'),
    encoding: 'base64',
  }).sha;
}

const ref = api(`repos/${repo}/git/ref/heads/main`);
if (ref.object.sha !== expectedHead) {
  throw new Error(`mainが想定外に更新されているため中止しました: ${ref.object.sha}`);
}

const base = api(`repos/${repo}/git/commits/${expectedHead}`);
const files = [
  'core-v228.js',
  'abyss-v228.js',
  'styles-v228.css',
  'index.html',
  'app-primary-v237.min.js',
  'styles-games-v237.min.css',
  'sw.js',
  'update.html',
];
const blobs = Object.fromEntries(files.map((path) => [path, createBlob(path)]));
const tree = api(`repos/${repo}/git/trees`, 'POST', {
  base_tree: base.tree.sha,
  tree: files.map((path) => ({ path, mode: '100644', type: 'blob', sha: blobs[path] })),
});
const commit = api(`repos/${repo}/git/commits`, 'POST', {
  message: 'Make manual PWA update load final touch edit fix',
  tree: tree.sha,
  parents: [expectedHead],
});
api(`repos/${repo}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: false });
console.log(JSON.stringify({ publishedCommit: commit.sha, changed: files }, null, 2));
