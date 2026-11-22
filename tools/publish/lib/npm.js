'use strict';
// npm-publish・verdaccio-publish: tarball か dir を指定の registry に publish する（npm publish を引数の配列で起動）。
// 認証は host の npm の設定（npm login）をそのまま使う。token は読まない。

const fs = require('node:fs');
const path = require('node:path');

const { EnvError, FailError, UsageError } = require('./errors');
const { which, run, firstLines } = require('./proc');

const NPMJS_REGISTRY = 'https://registry.npmjs.org/';
const ACCESS = new Set(['public', 'restricted']);
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function checkOptions(values) {
  if (values.tag !== undefined && !TAG_RE.test(values.tag)) throw new UsageError(`tag の形が不正: ${values.tag}`);
  if (values.access !== undefined && !ACCESS.has(values.access)) throw new UsageError('access は public か restricted');
}

/** target を絶対 path にして、tarball（file）か dir かを決める。 */
function resolveTarget(target, cwd) {
  const abs = path.resolve(cwd, target);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    throw new UsageError(`target が無い: ${abs}`);
  }
  if (st.isDirectory()) return { abs, kind: 'dir' };
  if (st.isFile() && /\.(tgz|tar\.gz)$/.test(abs)) return { abs, kind: 'tarball' };
  throw new UsageError(`target は dir か tarball（.tgz・.tar.gz）でなければならない: ${abs}`);
}

async function readManifest(t, env) {
  try {
    if (t.kind === 'dir') return JSON.parse(fs.readFileSync(path.join(t.abs, 'package.json'), 'utf8'));
    const tar = which('tar', env);
    if (!tar) return null;
    const r = await run(tar, ['-xzOf', t.abs, 'package/package.json'], { env, timeout: 30_000 });
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  }
}

function sameRegistry(a, b) {
  const norm = (u) => String(u).replace(/\/+$/, '');
  return norm(a) === norm(b);
}

function parseJson(text) {
  const s = String(text);
  const i = s.indexOf('{');
  if (i < 0) return null;
  try {
    return JSON.parse(s.slice(i));
  } catch {
    return null;
  }
}

/**
 * @param {object} values 引数
 * @param {{ registry: string, label: string, env, stderr, redact, cwd? }} ctx
 */
async function publishPackage(values, ctx) {
  const { registry, env, redact } = ctx;
  checkOptions(values);
  const t = resolveTarget(values.target, ctx.cwd || process.cwd());
  const npm = which('npm', env);
  if (!npm) throw new EnvError('npm が PATH に無い');

  const pkg = await readManifest(t, env);
  const name = pkg && typeof pkg.name === 'string' ? pkg.name : null;
  const version = pkg && typeof pkg.version === 'string' ? pkg.version : null;

  // package が別の registry を指していたら、指定の registry には出さない（誤って別の所に出さないため）。
  const pcReg = pkg && pkg.publishConfig && pkg.publishConfig.registry;
  if (typeof pcReg === 'string' && !sameRegistry(pcReg, registry)) {
    throw new FailError('package の publishConfig.registry が指定の registry と違うので publish しない');
  }

  const args = ['publish', t.abs, '--registry', registry, '--json'];
  if (name && name.startsWith('@')) args.push(`--${name.split('/')[0]}:registry=${registry}`); // scope の registry の設定に負けない
  if (values.tag !== undefined) args.push('--tag', values.tag);
  if (values.access !== undefined) args.push('--access', values.access);
  if (values.dryRun) args.push('--dry-run');

  ctx.stderr.write(
    `publish: ${ctx.label}: ${name || path.basename(t.abs)}${version ? '@' + version : ''} -> ${registry}${values.dryRun ? '（dry-run）' : ''}\n`,
  );
  const r = await run(npm, args, { env, cwd: t.kind === 'dir' ? t.abs : path.dirname(t.abs) });
  const base = {
    registry,
    target: t.abs,
    targetKind: t.kind,
    name,
    version,
    tag: values.tag ?? null,
    access: values.access ?? null,
    dryRun: values.dryRun,
  };
  if (r.error || r.status !== 0 || r.timedOut) {
    const why = r.timedOut ? '時間切れ' : r.error ? r.error.code || r.error.message : `npm が終了 code ${r.status}`;
    const detail = firstLines(redact(r.stderr || r.stdout));
    return { exitCode: 1, result: { ok: false, ...base, error: redact(`npm publish が失敗: ${why}${detail ? '\n' + detail : ''}`) } };
  }
  const out = parseJson(r.stdout);
  if (out && typeof out.name === 'string') base.name = out.name;
  if (out && typeof out.version === 'string') base.version = out.version;
  return { exitCode: 0, result: { ok: true, ...base } };
}

module.exports = { publishPackage, NPMJS_REGISTRY };
