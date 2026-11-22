// github repo create・github release create: host の gh の CLI を引数の配列で起動する。
// 認証は host の gh の認証をそのまま使う（token は読まない・渡さない）。

import * as common from './common.ts';
import { EnvError } from './errors.ts';
import { which, run, firstLines } from './proc.ts';

const URL_RE = /https?:\/\/[^\s'"<>]+/;

function ghEnv(env) {
  return { ...env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1', GH_NO_UPDATE_NOTIFIER: '1' };
}

async function runGh(args, ctx) {
  const gh = which('gh', ctx.env);
  if (!gh) throw new EnvError('gh が PATH に無い');
  return run(gh, args, { env: ghEnv(ctx.env), cwd: ctx.cwd });
}

function failure(r, what, ctx) {
  const why = r.timedOut ? '時間切れ' : r.error ? r.error.code || r.error.message : `gh が終了 code ${r.status}`;
  const detail = firstLines(ctx.redact(r.stderr || r.stdout));
  return ctx.redact(`${what}が失敗: ${why}${detail ? '\n' + detail : ''}`);
}

// gh が返した URL だけを出す。無ければ null（URL を自分で組まない）。
function findUrl(r, ctx) {
  const m = r.stdout.match(URL_RE) || r.stderr.match(URL_RE);
  return m ? ctx.redact(m[0]) : null;
}

/** github repo create <owner/name> [--visibility public|private|internal] [--description d] */
async function repoCreate(values, ctx) {
  const repo = common.parseRepo(values.repo);
  const visibility = common.checkVisibility(values.visibility, ['public', 'private', 'internal']);
  common.checkDescription(values.description);
  const args = ['repo', 'create', repo.full, `--${visibility}`];
  if (values.description !== undefined) args.push(`--description=${values.description}`);
  ctx.stderr.write(`publish: github repo create: ${repo.full}（${visibility}）\n`);
  const r = await runGh(args, ctx);
  if (r.error || r.status !== 0 || r.timedOut) {
    return { exitCode: 1, result: { ok: false, repo: repo.full, visibility, error: failure(r, 'repo の作成', ctx) } };
  }
  const url = findUrl(r, ctx);
  return { exitCode: 0, result: { ok: true, repo: repo.full, visibility, url } };
}

/** github release create [options] <owner/name> <tag> */
async function releaseCreate(values, ctx) {
  const repo = common.parseRepo(values.repo);
  const tag = common.checkTag(values.tag);
  common.checkTarget(values.target);
  const notes = common.readNotes(values.notesFile, ctx.cwd);
  const assets = common.resolveAssets(values.assets, ctx.cwd);
  const title = values.title !== undefined ? values.title : tag;
  const args = ['release', 'create', tag, ...assets, `--repo=${repo.full}`, `--title=${title}`];
  args.push(notes ? `--notes-file=${notes.abs}` : '--notes=');
  if (values.target !== undefined) args.push(`--target=${values.target}`);
  if (values.draft) args.push('--draft');
  if (values.prerelease) args.push('--prerelease');
  ctx.stderr.write(`publish: github release create: ${repo.full} ${tag}（asset ${assets.length} 件）\n`);
  const r = await runGh(args, ctx);
  const base = { repo: repo.full, tag, draft: values.draft, prerelease: values.prerelease, assets };
  if (r.error || r.status !== 0 || r.timedOut) {
    return { exitCode: 1, result: { ok: false, ...base, error: failure(r, 'release の作成', ctx) } };
  }
  const url = findUrl(r, ctx);
  return { exitCode: 0, result: { ok: true, ...base, url } };
}

export { repoCreate, releaseCreate };
