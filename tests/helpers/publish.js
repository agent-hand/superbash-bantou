'use strict';
// publish の test の共通: 偽の npm・gh（PATH の先に置く stub）、127.0.0.1 の偽の Gitea API server、
// 偽の git credential helper、偽の HOME。実際の npmjs・verdaccio・GitHub・Gitea には何も書かない。

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { ROOT, makeTmp } = require('./env');

const MAIN = path.join(ROOT, 'tools', 'publish', 'main.js');

// 偽の秘密（実在しない値）。出力に出ない事を確かめるのに使う。
const FAKE = Object.freeze({
  giteaToken: 'fake-gitea-token-0123456789abcdef',
  giteaUser: 'example-user',
  npmToken: 'npm_FAKE0123456789abcdefghijklmnop',
  ghToken: 'ghp_FAKE0123456789abcdefghijklmnop',
  envSecret: 'env-secret-value-xyz',
});

// 偽の npm・gh。起動された argv・cwd・環境（NPM_*・GH_*・PUBLISH_*）を FAKE_RECORD の dir に書く。
// FAKE_STDOUT / FAKE_STDERR を出し、FAKE_EXIT で終了 code を決める。gh は既定で URL を出す。
const FAKE_STUB = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const env = process.env;
// npm ping: 起動を .ping に記録する（publish の record と分ける）。FAKE_PING_REAL なら --registry に実際に接続して届くかを返す。
if (name === 'npm' && args[0] === 'ping') {
  if (env.FAKE_RECORD) fs.writeFileSync(path.join(env.FAKE_RECORD, 'npm-' + process.pid + '.ping'), JSON.stringify({ args, cwd: process.cwd() }));
  if (!env.FAKE_PING_REAL) process.exit(0);
  const url = args[args.indexOf('--registry') + 1];
  const req = require('node:http').get(url, { timeout: 8000 }, (res) => { res.resume(); process.exit(res.statusCode < 500 ? 0 : 1); });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (e) => { process.stderr.write('npm error code ' + (e.code || 'ERR') + '\\n'); process.exit(1); });
} else {
if (env.FAKE_RECORD) {
  const keep = Object.fromEntries(Object.entries(env).filter(([k]) => /^(NPM_|GH_|GITHUB_|PUBLISH_)/.test(k)));
  fs.writeFileSync(path.join(env.FAKE_RECORD, name + '-' + process.pid + '.json'), JSON.stringify({ name, args, cwd: process.cwd(), env: keep }));
}
if (env.FAKE_STDOUT) process.stdout.write(env.FAKE_STDOUT + '\\n');
else if (name === 'gh' && args[0] === 'repo') console.log('https://github.com/' + args[2]);
else if (name === 'gh' && args[0] === 'release') console.log('https://github.com/' + args.find((a) => a.startsWith('--repo=')).slice(7) + '/releases/tag/' + args[2]);
if (env.FAKE_STDERR) process.stderr.write(env.FAKE_STDERR + '\\n');
process.exit(Number(env.FAKE_EXIT || 0));
}
`;

/** 偽の npm・gh を置いた bin の dir を作り、その dir を先頭にした PATH を返す（tar・git は本物）。 */
function makeFakeBin(dir, names = ['npm', 'gh']) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), FAKE_STUB);
    fs.chmodSync(path.join(dir, name), 0o755);
  }
  return [dir, path.dirname(process.execPath), '/usr/bin', '/bin'].join(':');
}

function readRecords(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** 偽の npm が受けた ping の記録（args・cwd）。 */
function readPings(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ping'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// 偽の git credential helper。git が渡す protocol・host・username を record に書き、password に偽の token を返す。
const CRED_HELPER = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
if (process.argv[2] !== 'get') process.exit(0);
const input = fs.readFileSync(0, 'utf8');
if (process.env.FAKE_CRED_RECORD) fs.appendFileSync(process.env.FAKE_CRED_RECORD, JSON.stringify(input) + '\\n');
if (process.env.FAKE_CRED_NONE) process.exit(0);
process.stdout.write('password=' + process.env.FAKE_CRED_VALUE + '\\n');
`;

/** 偽の HOME（.gitconfig で偽の credential helper だけを指す）。{ home, helper } */
function makeFakeHome(base) {
  const home = path.join(base, 'home');
  fs.mkdirSync(home, { recursive: true });
  const helper = path.join(base, 'cred-helper.js');
  fs.writeFileSync(helper, CRED_HELPER);
  fs.chmodSync(helper, 0o755);
  fs.writeFileSync(path.join(home, '.gitconfig'), `[credential]\n\thelper = ${helper}\n`);
  return { home, helper };
}

/** publish を起動するための最小の環境（親の環境は写さない）。npm は使い捨ての cache・prefix・userconfig。 */
function baseEnv({ home, bin, work, extra = {} }) {
  return {
    HOME: home,
    PATH: bin,
    TMPDIR: work,
    GIT_CONFIG_NOSYSTEM: '1',
    NPM_CONFIG_CACHE: path.join(work, 'npm-cache'),
    NPM_CONFIG_PREFIX: path.join(work, 'npm-prefix'),
    NPM_CONFIG_USERCONFIG: path.join(work, 'npmrc'),
    ...extra,
  };
}

/** publish の CLI を起動する（非同期。偽の Gitea server と同じ process で動くため spawnSync にしない）。 */
function runPublish(args, { env, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => {
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        // JSON でない出力
      }
      resolve({ status, stdout, stderr, json });
    });
  });
}

/**
 * 偽の Gitea API server（127.0.0.1 の空き port）。要求を requests に溜める。
 * handler(req, record) が { status, body } を返せば、それを応答にする（無ければ既定の応答）。
 */
async function startFakeGitea({ token, handler } = {}) {
  const requests = [];
  let nextId = 100;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const record = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(record);
      const send = (status, obj, headers = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(obj));
      };
      if (req.headers.authorization !== `token ${token}`) return send(401, { message: 'unauthorized' });
      const custom = handler && handler(req, record);
      if (custom) return send(custom.status, custom.body, custom.headers);
      const u = new URL(req.url, 'http://x');
      const origin = `http://${req.headers.host}`;
      let m;
      if (req.method === 'POST' && (u.pathname === '/api/v1/user/repos' || /^\/api\/v1\/orgs\/[^/]+\/repos$/.test(u.pathname))) {
        const j = JSON.parse(body.toString('utf8'));
        const owner = u.pathname === '/api/v1/user/repos' ? FAKE.giteaUser : u.pathname.split('/')[4];
        return send(201, { html_url: `${origin}/${owner}/${j.name}`, name: j.name, private: j.private });
      }
      if (req.method === 'POST' && (m = /^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/releases$/.exec(u.pathname))) {
        const j = JSON.parse(body.toString('utf8'));
        return send(201, { id: nextId++, html_url: `${origin}/${m[1]}/${m[2]}/releases/tag/${j.tag_name}` });
      }
      if (req.method === 'POST' && /^\/api\/v1\/repos\/[^/]+\/[^/]+\/releases\/\d+\/assets$/.test(u.pathname)) {
        return send(201, { name: u.searchParams.get('name') });
      }
      return send(404, { message: 'not found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    requests,
    port,
    url: `http://127.0.0.1:${port}`,
    host: `127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { MAIN, FAKE, makeTmp, makeFakeBin, readRecords, readPings, makeFakeHome, baseEnv, runPublish, startFakeGitea };
