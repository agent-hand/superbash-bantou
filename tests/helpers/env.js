'use strict';
// test の共通: 一時の dir（os.tmpdir() の下）、CLI の起動、偽の Tauri の project。

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN = path.join(ROOT, 'tools', 'macbuild', 'main.js');
const MANIFEST = path.join(ROOT, '.manifest', 'toolconfig.json');

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

// 偽の Tauri の CLI。受けた引数と環境の一部を record.json に書き、Fake.app を作って
// APPLE_SIGNING_IDENTITY で codesign し、Tauri と同じ形で「Finished 1 bundle at:」を出す。
// project に fail という file があれば失敗する。
const FAKE_TAURI = `#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const project = process.cwd();
const env = process.env;
fs.writeFileSync(path.join(project, 'record.json'), JSON.stringify({
  args: process.argv.slice(2),
  cwd: project,
  APPLE_SIGNING_IDENTITY: env.APPLE_SIGNING_IDENTITY ?? null,
  TAURI_SIGNING_PRIVATE_KEY: env.TAURI_SIGNING_PRIVATE_KEY ?? null,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? null,
  CARGO_TARGET_DIR: env.CARGO_TARGET_DIR ?? null,
  APPLE_CERTIFICATE: env.APPLE_CERTIFICATE ?? null,
  APPLE_ID: env.APPLE_ID ?? null,
}));
console.log('    Running fake tauri build');
if (fs.existsSync(path.join(project, 'fail'))) {
  console.error('error: fake build failed on purpose');
  process.exit(1);
}
const target = env.CARGO_TARGET_DIR || path.join(project, 'src-tauri', 'target');
const app = path.join(target, 'release', 'bundle', 'macos', 'Fake.app');
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
if (env.APPLE_SIGNING_IDENTITY) {
  const r = spawnSync('codesign', ['--force', '-s', env.APPLE_SIGNING_IDENTITY, app], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
console.log('\\u001b[32m    Finished\\u001b[0m 1 bundle at:');
console.log('        ' + app);
`;

/** 偽の Tauri の project を作る（src-tauri/tauri.conf.json と node_modules/.bin/tauri）。 */
function makeFakeProject(dir) {
  fs.mkdirSync(path.join(dir, 'src-tauri'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src-tauri', 'tauri.conf.json'), '{}\n');
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

module.exports = { ROOT, MAIN, MANIFEST, makeTmp, rmTmp, cleanEnv, runCli, makeFakeProject, readRecord };
