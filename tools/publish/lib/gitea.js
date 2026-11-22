'use strict';
// gitea-repo-create・gitea-release-create: Gitea の REST API（/api/v1）を node の fetch から呼ぶ（curl は使わない）。
// token は実行時に `git credential fill`（protocol・host は Gitea の URL から、username は host の設定）で取り出す。
// 取り出した token は redactor に登録し、stdout・stderr・error message に出さない。

const fs = require('node:fs');
const path = require('node:path');

const common = require('./common');
const { EnvError } = require('./errors');
const { which, run } = require('./proc');

const REQUEST_TIMEOUT_MS = 120_000;

/** git credential fill で token（password）を取る。取れなければ EnvError。 */
async function fetchToken(cfg, ctx) {
  const git = which('git', ctx.env);
  if (!git) throw new EnvError('git が PATH に無い');
  const input = `protocol=${cfg.protocol}\nhost=${cfg.host}\nusername=${cfg.username}\n\n`;
  const env = { ...ctx.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  const r = await run(git, ['credential', 'fill'], { env, input, timeout: 30_000 });
  const m = r.stdout.match(/^password=(.*)$/m);
  if (r.status !== 0 || !m || m[1] === '') {
    throw new EnvError(`git credential fill で ${cfg.host}（user ${cfg.username}）の token が取れない`);
  }
  ctx.addSecret(m[1]);
  return m[1];
}

class GiteaError extends Error {}

function client(cfg, token, ctx) {
  const apiBase = `${cfg.baseUrl}/api/v1`;
  return async function api(method, apiPath, { json, form } = {}) {
    const headers = { Authorization: `token ${token}`, Accept: 'application/json' };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form !== undefined) {
      body = form;
    }
    let res;
    try {
      res = await fetch(apiBase + apiPath, {
        method,
        headers,
        body,
        redirect: 'manual', // 別の host に token を持ち出さない
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new GiteaError(ctx.redact(`${method} ${apiPath}: 接続できない: ${e.cause && e.cause.code ? e.cause.code : e.name}`));
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // JSON でない応答
    }
    if (res.status >= 300) {
      const msg = data && typeof data.message === 'string' ? data.message : text.slice(0, 200);
      const loc = res.status < 400 ? '（redirect は追わない）' : '';
      throw new GiteaError(ctx.redact(`${method} ${apiPath}: HTTP ${res.status}${loc} ${msg}`.trim()));
    }
    return data;
  };
}

async function prepare(ctx) {
  const cfg = ctx.gitea;
  const token = await fetchToken(cfg, ctx);
  return { cfg, api: client(cfg, token, ctx) };
}

/** gitea-repo-create <owner/name> [--visibility public|private] [--description d] */
async function repoCreate(values, ctx) {
  const repo = common.parseRepo(values.repo);
  const visibility = common.checkVisibility(values.visibility, ['public', 'private']);
  common.checkDescription(values.description);
  const { cfg, api } = await prepare(ctx);
  const own = repo.owner.toLowerCase() === cfg.username.toLowerCase();
  const apiPath = own ? '/user/repos' : `/orgs/${encodeURIComponent(repo.owner)}/repos`;
  const payload = { name: repo.name, private: visibility === 'private' };
  if (values.description !== undefined) payload.description = values.description;
  ctx.stderr.write(`publish: gitea-repo-create: ${repo.full}（${visibility}）\n`);
  try {
    const data = await api('POST', apiPath, { json: payload });
    const url = data && typeof data.html_url === 'string' ? data.html_url : `${cfg.baseUrl}/${repo.full}`;
    return { exitCode: 0, result: { ok: true, repo: repo.full, visibility, url: ctx.redact(url) } };
  } catch (e) {
    if (!(e instanceof GiteaError)) throw e;
    return { exitCode: 1, result: { ok: false, repo: repo.full, visibility, error: e.message } };
  }
}

/** gitea-release-create [options] <owner/name> <tag> */
async function releaseCreate(values, ctx) {
  const repo = common.parseRepo(values.repo);
  const tag = common.checkTag(values.tag);
  common.checkTarget(values.target);
  const notes = common.readNotes(values.notesFile, ctx.cwd);
  const assets = common.resolveAssets(values.assets, ctx.cwd);
  const { cfg, api } = await prepare(ctx);
  const base = { repo: repo.full, tag, draft: values.draft, prerelease: values.prerelease, assets };
  const rel = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/releases`;
  const payload = {
    tag_name: tag,
    name: values.title !== undefined ? values.title : tag,
    body: notes ? notes.text : '',
    draft: values.draft,
    prerelease: values.prerelease,
  };
  if (values.target !== undefined) payload.target_commitish = values.target;
  ctx.stderr.write(`publish: gitea-release-create: ${repo.full} ${tag}（asset ${assets.length} 件）\n`);
  let release;
  try {
    release = await api('POST', rel, { json: payload });
  } catch (e) {
    if (!(e instanceof GiteaError)) throw e;
    return { exitCode: 1, result: { ok: false, ...base, error: e.message } };
  }
  const url = ctx.redact(release && typeof release.html_url === 'string' ? release.html_url : `${cfg.baseUrl}/${repo.full}/releases/tag/${tag}`);
  const uploaded = [];
  for (const file of assets) {
    try {
      const form = new FormData();
      form.append('attachment', new Blob([fs.readFileSync(file)]), path.basename(file));
      await api('POST', `${rel}/${encodeURIComponent(release.id)}/assets?name=${encodeURIComponent(path.basename(file))}`, { form });
      uploaded.push(file);
    } catch (e) {
      if (!(e instanceof GiteaError)) throw e;
      // release は作られている。どこまで出来たかを返す。
      return { exitCode: 1, result: { ok: false, ...base, url, uploaded, failedAsset: file, error: `asset の添付が失敗（release は作成済み）: ${e.message}` } };
    }
  }
  return { exitCode: 0, result: { ok: true, ...base, url, uploaded } };
}

module.exports = { repoCreate, releaseCreate };
