// macbuild info: この host で使える物と、署名の設定の有無（値は出さない）。
// 版の照会の子には、署名・公証・updater の秘密の変数を外した環境を渡す。

import fs from 'node:fs';
import os from 'node:os';

import { loadConfig, reportWarnings, NOTARIZE_FIELDS } from './config.ts';
import { EXIT } from './errors.ts';
import * as lock from './lock.ts';
import { which, runSync, firstLine } from './proc.ts';
import { scrubEnv } from './secrets.ts';

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

function collect({ env = process.env, stderr = process.stderr } = {}) {
  let config = null;
  let configError = null;
  try {
    config = loadConfig({ env });
  } catch (e) {
    configError = e.message;
  }
  if (config) reportWarnings(config, stderr);
  const childEnv = scrubEnv(env, config);

  const tools = {};
  for (const [name, args] of PROBES) tools[name] = probe(name, args, childEnv);
  const swVers = runSync('sw_vers', ['-productVersion'], { env: childEnv, timeout: 10_000 });
  const devDir = runSync('xcode-select', ['-p'], { env: childEnv, timeout: 10_000 });

  const report = {
    host: { platform: process.platform, arch: process.arch, macos: swVers.ok ? swVers.stdout.trim() : null },
    developerDir: devDir.ok ? devDir.stdout.trim() : null,
    tools,
  };

  if (!config) {
    report.signing = null;
    report.config = { error: configError };
    return { report, exitCode: EXIT.ENV };
  }

  const pwEnv = config.updaterKeyPasswordEnv;
  const notarizeNames = NOTARIZE_FIELDS.map(([key]) => config[key]).filter(Boolean);
  report.signing = {
    mode: config.signingMode,
    identity: config.signingMode === 'identity',
    updaterKey: Boolean(config.updaterKeyPath),
    updaterKeyFound: config.updaterKeyPath ? fileExists(config.updaterKeyPath) : null,
    updaterKeyPassword: Boolean(pwEnv),
    updaterKeyPasswordSet: pwEnv ? typeof env[pwEnv] === 'string' : null,
    notarize: notarizeNames.length > 0,
    notarizeSet: notarizeNames.length ? notarizeNames.every((n) => typeof env[n] === 'string') : null,
  };
  report.config = {
    file: tildify(config.file.path),
    found: config.file.found,
    sources: config.sources,
    warnings: config.warnings,
  };
  const st = lock.inspect(config.lockDir);
  report.lock = {
    dir: tildify(config.lockDir),
    held: st.held,
    ...(st.held ? { pid: st.pid, startedAt: st.startedAt, project: st.project } : {}),
  };
  report.logDir = tildify(config.logDir);
  return { report, exitCode: EXIT.OK };
}

export { collect, tildify, PROBES };
