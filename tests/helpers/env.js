'use strict';
// test の共通: 一時の dir（os.tmpdir() の下）、CLI の起動、偽の Tauri の project、偽の codesign・cargo。

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN = path.join(ROOT, 'tools', 'macbuild', 'dist', 'cli.mjs');
const MANIFEST = path.join(ROOT, '.manifest', 'toolconfig.json');

// 偽の秘密（実在しない identity・資格の値）。出力と log に出ない事を確かめるのに使う。
const FAKE = Object.freeze({
  identity: 'Developer ID Application: Fake Example Corp (FAKE123456)',
  teamId: 'FAKE123456',
  appleId: 'fake-apple-id@example.invalid',
  applePassword: 'fake-app-specific-password',
  appleTeamId: 'FAKETEAM99',
  parentAppleId: 'parent-apple-id@example.invalid',
  parentApplePassword: 'parent-apple-password',
  updaterPassword: 'fake-updater-password',
  providerShortName: 'FakeProvider42',
});

function makeTmp(prefix = 'macbuild-test-') {
  // macOS の /var → /private/var の symlink を解いておく（path の比較のため）。
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function rmTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 親の環境から MACBUILD_* と署名の変数を除き、HOME を偽の home にした環境。 */
function cleanEnv(home, extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('MACBUILD_') || k.startsWith('APPLE_') || k.startsWith('TAURI_')) continue;
    if (k === 'CARGO_TARGET_DIR') continue;
    env[k] = v;
  }
  env.HOME = home;
  return { ...env, ...extra };
}

/** macbuild の CLI を起動する（shell を通さない）。 */
function runCli(args, { env, cwd } = {}) {
  const r = spawnSync(process.execPath, [MAIN, ...args], { env, cwd, encoding: 'utf8', timeout: 120_000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // JSON でない出力（usage の誤りなど）
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// 偽の Tauri の CLI。受けた引数と、環境の APPLE_*・TAURI_* の値と全変数の名前を record.json に書く。
// Tauri と同じく「Signing with identity "<identity>"」と keychain の path を出す。
// identity が `-` の時だけ Fake.app を ad-hoc で codesign する（偽の identity では codesign を呼ばない）。
// project に fail という file があれば失敗する。FAKE_BUNDLE_DIR があれば Fake.app をその下に作る。
const FAKE_TAURI = `#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const project = process.cwd();
const env = process.env;
const pick = (prefix) => Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith(prefix)));
fs.writeFileSync(path.join(project, 'record.json'), JSON.stringify({
  args: process.argv.slice(2),
  cwd: project,
  APPLE: pick('APPLE_'),
  TAURI: pick('TAURI_'),
  CARGO_TARGET_DIR: env.CARGO_TARGET_DIR ?? null,
  keys: Object.keys(env),
}));
const id = env.APPLE_SIGNING_IDENTITY;
console.log('    Running fake tauri build');
console.log('     Signing with identity "' + id + '"');
console.error('note: using keychain ' + path.join(env.HOME || '/var/empty', 'Library', 'Keychains', 'fake-build.keychain-db'));
if (fs.existsSync(path.join(project, 'fail'))) {
  console.error('error: failed to sign with identity "' + id + '" (team ' + (id.match(/\\(([A-Z0-9]{10})\\)/) || [])[1] + ')');
  process.exit(1);
}
const target = env.CARGO_TARGET_DIR || path.join(project, 'src-tauri', 'target');
const app = env.FAKE_BUNDLE_DIR
  ? path.join(env.FAKE_BUNDLE_DIR, 'Fake.app')
  : path.join(target, 'release', 'bundle', 'macos', 'Fake.app');
fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'fake'), '#!/usr/bin/env node\\n');
fs.chmodSync(path.join(app, 'Contents', 'MacOS', 'fake'), 0o755);
fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0"><dict>',
  '<key>CFBundleExecutable</key><string>fake</string>',
  '<key>CFBundleIdentifier</key><string>com.example.fake</string>',
  '<key>CFBundlePackageType</key><string>APPL</string>',
  '</dict></plist>',
].join('\\n'));
if (id === '-') {
  // Tauri の bundler と同じく hardened runtime を付ける。
  const r = spawnSync('codesign', ['--force', '-s', '-', '--options', 'runtime', app], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
console.log('\\u001b[32m    Finished\\u001b[0m 1 bundle at:');
console.log('        ' + app);
`;

/** 偽の Tauri の project を作る（node_modules/.bin/tauri だけ。conf の場所は Tauri の CLI に任せる）。 */
function makeFakeProject(dir) {
  const bin = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'tauri'), FAKE_TAURI);
  fs.chmodSync(path.join(bin, 'tauri'), 0o755);
  return dir;
}

function readRecord(project) {
  const p = path.join(project, 'record.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// 偽の codesign と cargo。起動された時の環境（全変数の名前と、APPLE_*・TAURI_* の値）を FAKE_RECORD の dir に書く。
// codesign の -dv は ad-hoc の署名の形を出し、それ以外は何もせず 0 で終わる。
const FAKE_TOOL = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const env = process.env;
const pick = (prefix) => Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith(prefix)));
if (env.FAKE_RECORD) {
  fs.writeFileSync(
    path.join(env.FAKE_RECORD, name + '-' + process.pid + '-' + Date.now() + '.json'),
    JSON.stringify({ name, args, APPLE: pick('APPLE_'), TAURI: pick('TAURI_'), keys: Object.keys(env) }),
  );
}
if (name === 'cargo') console.log('cargo 0.0.0 (fake)');
if (name === 'codesign' && args.includes('-dv')) {
  console.error(['Identifier=com.example.fake', 'Format=generic', 'CodeDirectory v=20500 size=1 flags=0x2(adhoc) hashes=1+0 location=embedded', 'Signature=adhoc'].join('\\n'));
}
`;

/** 偽の codesign・cargo を置いた bin の dir を作り、その dir を先頭にした PATH を返す。 */
function makeFakeBin(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['codesign', 'cargo']) {
    fs.writeFileSync(path.join(dir, name), FAKE_TOOL);
    fs.chmodSync(path.join(dir, name), 0o755);
  }
  return [dir, path.dirname(process.execPath), '/usr/bin', '/bin'].join(':');
}

function readFakeRecords(recordDir) {
  return fs
    .readdirSync(recordDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(recordDir, f), 'utf8')));
}

module.exports = {
  ROOT,
  MAIN,
  MANIFEST,
  FAKE,
  makeTmp,
  rmTmp,
  cleanEnv,
  runCli,
  makeFakeProject,
  readRecord,
  makeFakeBin,
  readFakeRecords,
};
