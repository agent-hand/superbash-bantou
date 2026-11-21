'use strict';
// macbuild tauri: Tauri の build と署名（identity が無ければ ad-hoc）。
//
// - Tauri の CLI は project から上へ node_modules/.bin/tauri を探し、無ければ `cargo tauri`（cargo-tauri が PATH にある時）。
//   conf（tauri.conf.*）の場所の探し方は Tauri の CLI に任せる。
// - 署名は Tauri の bundler に任せる（APPLE_SIGNING_IDENTITY に identity か `-` を渡す）。build の後に codesign で確かめる。
// - 子の環境: 親の APPLE_*・TAURI_SIGNING_* と、設定が名前で指す元の変数は渡さない（secrets.scrubEnv）。
//   updater の鍵は path を TAURI_SIGNING_PRIVATE_KEY に、password は設定の環境変数名の値を TAURI_SIGNING_PRIVATE_KEY_PASSWORD に入れる。
//   identity の時だけ、公証の資格を設定の環境変数名の値から Tauri の名前（APPLE_ID など）で入れる。
// - build の出力は行ごとに秘密を伏せて log の file に書く。stderr には進捗だけ、失敗の時は（伏せた）log の末尾を出す。
//   成果物の path は伏せる前の出力から拾う（秘密の値が path の一部と一致しても path を壊さない）。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const codesign = require('./codesign');
const { loadConfig, reportWarnings, codesignIdentity, NOTARIZE_FIELDS } = require('./config');
const { EXIT, UsageError, EnvError } = require('./errors');
const lock = require('./lock');
const { which, runToLog, isExecutableFile } = require('./proc');
const { scrubEnv, secretsOf, makeRedactor } = require('./secrets');

const LOG_TAIL_LINES = 40;

/** Tauri の CLI を決める: { cmd, args, label } か null。 */
function findTauriCli(project, env = process.env) {
  let dir = project;
  for (;;) {
    const bin = path.join(dir, 'node_modules', '.bin', 'tauri');
    if (isExecutableFile(bin)) return { cmd: bin, args: [], label: path.relative(project, bin) || bin };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (which('cargo-tauri', env)) return { cmd: 'cargo', args: ['tauri'], label: 'cargo tauri' };
  return null;
}

/** tauri の CLI に渡す引数（`tauri` の後ろ）。 */
function tauriArgs({ target, bundles, debug } = {}) {
  const args = ['build', '--ci'];
  if (target) args.push('--target', target);
  if (bundles) args.push('--bundles', bundles);
  if (debug) args.push('--debug');
  return args;
}

function namedValue(baseEnv, name, what) {
  const v = baseEnv[name];
  if (typeof v !== 'string') throw new EnvError(`${what}の環境変数が無い: ${name}`);
  return v;
}

/** 子の環境。署名・updater の鍵・公証の資格は host の設定からだけ入れる。 */
function tauriEnv(config, { baseEnv = process.env, targetDir } = {}) {
  const env = scrubEnv(baseEnv, config);
  env.APPLE_SIGNING_IDENTITY = codesignIdentity(config);
  if (config.updaterKeyPath) {
    env.TAURI_SIGNING_PRIVATE_KEY = config.updaterKeyPath;
    if (config.updaterKeyPasswordEnv) {
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = namedValue(baseEnv, config.updaterKeyPasswordEnv, 'updater の鍵の password ');
    }
  }
  if (config.signingMode === 'identity') {
    for (const [key, passAs] of NOTARIZE_FIELDS) {
      if (config[key]) env[passAs] = namedValue(baseEnv, config[key], '公証の資格（' + passAs + '）');
    }
  }
  if (targetDir) env.CARGO_TARGET_DIR = targetDir;
  return env;
}

function artifactKind(p) {
  if (p.endsWith('.app.tar.gz')) return 'updater';
  if (p.endsWith('.sig')) return 'updater-signature';
  if (p.endsWith('.app')) return 'app';
  if (p.endsWith('.dmg')) return 'dmg';
  return 'other';
}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Tauri の「Finished N bundle(s) at:」「Finished N updater signature(s) at:」の下の path を拾う。 */
function parseFinishedPaths(text) {
  const lines = text.replace(ANSI_RE, '').split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/Finished \d+ .* at:\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const s = lines[j].trim();
      if (!s.startsWith('/')) break;
      found.push(s);
    }
  }
  return [...new Set(found)];
}

/** log から拾えなかった時: target の dir の bundle/ を見る（build の開始の後に出来た物だけ）。 */
function scanBundleDir({ project, targetDir, target, debug, since }) {
  const base = targetDir || path.join(project, 'src-tauri', 'target');
  const root = path.join(base, ...(target ? [target] : []), debug ? 'debug' : 'release', 'bundle');
  const found = [];
  for (const sub of ['macos', 'dmg']) {
    const dir = path.join(root, sub);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = path.join(dir, name);
      try {
        if (fs.statSync(p).mtimeMs >= since - 1000) found.push(p);
      } catch {
        // 消えた
      }
    }
  }
  return found;
}

function readTail(file, lines = LOG_TAIL_LINES) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(ANSI_RE, '');
    return text.split('\n').slice(-lines - 1).join('\n');
  } catch {
    return '';
  }
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

/**
 * build を行う。
 * @returns {Promise<{ exitCode: number, result: object }>}
 */
async function build(values, { stderr = process.stderr, env = process.env, cwd = process.cwd() } = {}) {
  const say = (msg) => stderr.write(`macbuild: ${msg}\n`);
  const started = Date.now();

  if (process.platform !== 'darwin') throw new EnvError('mac（darwin）でしか動かない');
  const project = path.resolve(cwd, values.project);
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    throw new UsageError(`project の dir が無い: ${project}`);
  }

  const config = loadConfig({ env, cwd });
  reportWarnings(config, stderr);
  const redact = makeRedactor(secretsOf(config, env));
  const toolEnv = scrubEnv(env, config);
  if (!which('codesign', env)) throw new EnvError('codesign が無い');
  if (!which('cargo', env)) throw new EnvError('cargo が無い（Rust の toolchain が要る）');
  const cli = findTauriCli(project, env);
  if (!cli) {
    throw new EnvError('Tauri の CLI が無い（project の node_modules/.bin/tauri か、PATH の cargo-tauri が要る）');
  }
  if (config.updaterKeyPath) {
    let st = null;
    try {
      st = fs.statSync(config.updaterKeyPath);
    } catch {
      // 下で報告
    }
    if (!st || !st.isFile()) throw new EnvError('設定の updater の鍵の file が無い');
  }
  const targetDir = values.targetDir ? path.resolve(cwd, values.targetDir) : env.CARGO_TARGET_DIR || null;
  const childEnv = tauriEnv(config, { baseEnv: env, targetDir });
  const args = tauriArgs(values);

  try {
    fs.mkdirSync(config.logDir, { recursive: true });
  } catch (e) {
    throw new EnvError(`log の dir を作れない: ${config.logDir}: ${e.code || e.message}`);
  }

  let held;
  try {
    held = lock.acquire(config.lockDir, { project, command: 'tauri' });
  } catch (e) {
    throw new EnvError(`lock を取れない（lock の dir の誤り）: ${config.lockDir}: ${e.code || e.message}`);
  }
  if (!held.acquired) {
    const owner = lock.publicOwner(held.owner);
    say(
      `別の build が lock を持っている（待たずに終わる）: ${held.path}` +
        (owner ? ` pid=${owner.pid} startedAt=${owner.startedAt} project=${owner.project}` : ''),
    );
    return {
      exitCode: EXIT.BUSY,
      result: { ok: false, error: 'lock-busy', project, lock: { path: held.path, owner } },
    };
  }

  let child = null;
  const onSignal = (sig) => {
    if (child && child.exitCode === null) child.kill(sig);
    held.release();
    process.exit(128 + (os.constants.signals[sig] || 0));
  };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const s of signals) process.on(s, onSignal);
  process.on('exit', held.release);

  const logPath = path.join(config.logDir, `tauri-${stamp(new Date(started))}-${process.pid}.log`);
  let rawOutput = ''; // 伏せる前の出力（memory の中だけ。成果物の path を拾う）
  try {
    say(`lock を取った: ${held.path}`);
    const fd = fs.openSync(logPath, 'a');
    try {
      fs.writeSync(
        fd,
        redact(
          [
            `# macbuild tauri ${new Date(started).toISOString()}`,
            `# project: ${project}`,
            `# cli: ${cli.label} ${[...cli.args, ...args].join(' ')}`,
            `# signing: ${config.signingMode}${config.updaterKeyPath ? ' (updater key: set)' : ''}`,
            `# target dir: ${targetDir || '(cargo の既定)'}`,
            '',
          ].join('\n') + '\n',
        ),
      );
      say(`build を始めた: log ${logPath}`);
      const r = await runToLog(cli.cmd, [...cli.args, ...args], {
        cwd: project,
        env: childEnv,
        fd,
        redact,
        tap: (raw) => {
          rawOutput += raw;
        },
        onSpawn: (c) => {
          child = c;
        },
      });
      child = null;
      if (r.error || r.status !== 0) {
        const why = r.error
          ? `Tauri の CLI を起動できない: ${r.error.message}`
          : r.signal
            ? `Tauri の build が signal ${r.signal} で止まった`
            : `Tauri の build が失敗した（終了 code ${r.status}）`;
        say(why);
        const tail = redact(readTail(logPath));
        if (tail) stderr.write(`--- log の末尾（${logPath}）---\n${tail}\n--- ここまで ---\n`);
        return {
          exitCode: EXIT.FAIL,
          result: { ok: false, error: why, project, log: logPath, durationMs: Date.now() - started },
        };
      }
    } finally {
      fs.closeSync(fd);
    }

    let paths = parseFinishedPaths(rawOutput).filter((p) => fs.existsSync(p));
    rawOutput = '';
    if (paths.length === 0) {
      paths = scanBundleDir({ project, targetDir, target: values.target, debug: values.debug, since: started });
    }
    const artifacts = paths.map((p) => {
      const a = { kind: artifactKind(p), path: p };
      if (a.kind === 'app' || a.kind === 'dmg') {
        a.signature = codesign.describe(p, { env: toolEnv });
        if (a.signature.kind !== 'unsigned') {
          const v = codesign.verify(p, { env: toolEnv });
          a.verified = v.ok;
          if (!v.ok) a.verifyError = redact(v.message);
        } else {
          a.verified = false;
        }
      }
      return a;
    });

    const expected = config.signingMode === 'identity' ? 'certificate' : 'adhoc';
    const apps = artifacts.filter((a) => a.kind === 'app');
    let error = null;
    if (apps.length === 0) error = '成果物の .app が見つからない';
    else if (apps.some((a) => !a.verified)) error = '.app の署名の確かめが通らない';
    else if (apps.some((a) => a.signature.kind !== expected)) error = `.app の署名が ${expected} でない`;

    const result = {
      ok: error === null,
      ...(error ? { error } : {}),
      project,
      signing: config.signingMode,
      updaterKey: Boolean(config.updaterKeyPath),
      cli: cli.label,
      tauriArgs: [...cli.args, ...args],
      targetDir,
      log: logPath,
      artifacts,
      durationMs: Date.now() - started,
    };
    say(error ? `終わった（失敗: ${error}）` : `終わった: 成果物 ${artifacts.length} 件`);
    return { exitCode: error ? EXIT.FAIL : EXIT.OK, result };
  } finally {
    for (const s of signals) process.removeListener(s, onSignal);
    process.removeListener('exit', held.release);
    held.release();
  }
}

module.exports = {
  build,
  tauriArgs,
  tauriEnv,
  findTauriCli,
  parseFinishedPaths,
  artifactKind,
};
