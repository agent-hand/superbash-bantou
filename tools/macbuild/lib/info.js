'use strict';
// macbuild info: この host で使える物と、署名の設定の有無（値は出さない）。

const fs = require('node:fs');
const os = require('node:os');

const { loadConfig } = require('./config');
const { EXIT } = require('./errors');
const lock = require('./lock');
const { which, runSync, firstLine } = require('./proc');

// 名前 → 版を聞く引数（null は版を聞かない。codesign には版の option が無い）。
const PROBES = Object.freeze([
  ['xcodebuild', ['-version']],
  ['codesign', null],
  ['sccache', ['--version']],
  ['cargo', ['--version']],
  ['rustc', ['--version']],
  ['node', ['--version']],
  ['cargo-tauri', ['--version']],
]);

function tildify(p, home = os.homedir()) {
  if (!p) return p;
  if (p === home) return '~';
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
}

function probe(name, versionArgs, env) {
  const p = which(name, env);
  if (!p) return { available: false, version: null, path: null };
  if (!versionArgs) return { available: true, version: null, path: tildify(p) };
  const r = runSync(p, versionArgs, { env, timeout: 20_000 });
  if (!r.ok) {
    return {
      available: false,
      version: null,
      path: tildify(p),
      note: firstLine(r.stderr) || firstLine(r.stdout) || firstLine(r.error && r.error.message),
    };
  }
  const version = (r.stdout.trim() || r.stderr.trim())
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('; ');
  return { available: true, version: version || null, path: tildify(p) };
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function collect({ env = process.env } = {}) {
  const tools = {};
  for (const [name, args] of PROBES) tools[name] = probe(name, args, env);

  const swVers = runSync('sw_vers', ['-productVersion'], { env, timeout: 10_000 });
  const devDir = runSync('xcode-select', ['-p'], { env, timeout: 10_000 });

  const report = {
    host: { platform: process.platform, arch: process.arch, macos: swVers.ok ? swVers.stdout.trim() : null },
    developerDir: devDir.ok ? devDir.stdout.trim() : null,
    tools,
  };

  let config = null;
  let configError = null;
  try {
    config = loadConfig({ env });
  } catch (e) {
    configError = e.message;
  }

  if (config) {
    const pwEnv = config.updaterKeyPasswordEnv;
    report.signing = {
      mode: config.signingMode,
      identity: config.signingMode === 'identity',
      updaterKey: Boolean(config.updaterKeyPath),
      updaterKeyFound: config.updaterKeyPath ? fileExists(config.updaterKeyPath) : null,
      updaterKeyPassword: Boolean(pwEnv),
      updaterKeyPasswordSet: pwEnv ? typeof env[pwEnv] === 'string' : null,
    };
    report.config = { file: tildify(config.file.path), found: config.file.found, sources: config.sources };
    const st = lock.inspect(config.lockDir);
    report.lock = {
      dir: tildify(config.lockDir),
      held: st.held,
      ...(st.held ? { pid: st.pid, startedAt: st.startedAt, stale: st.stale } : {}),
    };
    report.logDir = tildify(config.logDir);
  } else {
    report.signing = null;
    report.config = { error: configError };
  }
  return { report, exitCode: configError ? EXIT.ENV : EXIT.OK };
}

module.exports = { collect, tildify, PROBES };
