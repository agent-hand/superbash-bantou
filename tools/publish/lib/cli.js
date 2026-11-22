'use strict';
// publish の CLI: 引数を読み、副 command を振り分ける。結果は stdout に JSON で出す。
// stdout・stderr に出す文字列は、必ず redactor（秘密を伏せる）を通す。

const config = require('./config');
const { HELP, parse } = require('./commands');
const { EXIT } = require('./errors');
const { TOOL, toolCommands } = require('./manifest');
const { envSecrets, makeRedactor } = require('./secrets');

// redactDeep: 値の文字列の葉だけを伏せる関数（直列化の後の文字列には通さない）。
function writeJson(stream, redactDeep, value) {
  stream.write(JSON.stringify(redactDeep(value), null, 2) + '\n');
}

/** help: spec（toolconfig.json の定義）をそのまま出す。command は名前（npm-publish）か副 command（同じ名前）。 */
function help(values, io, redact) {
  const commands = toolCommands();
  if (!values.command) {
    writeJson(io.stdout, redact, { tool: TOOL, usage: 'publish <subcommand> ...', commands });
    return EXIT.OK;
  }
  const c = commands.find((x) => x.name === values.command || (x.spec && x.spec.subcommand === values.command));
  if (!c) {
    io.stderr.write(`publish: 未知の command: ${values.command}\n`);
    return EXIT.USAGE;
  }
  writeJson(io.stdout, redact, c);
  return EXIT.OK;
}

async function dispatch(subcommand, values, ctx, io) {
  switch (subcommand) {
    case 'npm-publish': {
      const { publishPackage, NPMJS_REGISTRY } = require('./npm');
      return publishPackage(values, { ...ctx, registry: NPMJS_REGISTRY, label: 'npm-publish' });
    }
    case 'verdaccio-publish': {
      const cfg = config.loadConfig({ env: io.env });
      config.reportWarnings(cfg, io.stderr);
      const registry = config.verdaccioRegistry(cfg);
      return require('./npm').publishPackage(values, { ...ctx, registry, label: 'verdaccio-publish' });
    }
    case 'github-repo-create':
      return require('./github').repoCreate(values, ctx);
    case 'github-release-create':
      return require('./github').releaseCreate(values, ctx);
    case 'gitea-repo-create':
    case 'gitea-release-create': {
      const cfg = config.loadConfig({ env: io.env });
      config.reportWarnings(cfg, io.stderr);
      const gitea = require('./gitea');
      const g = { ...ctx, gitea: config.gitea(cfg) };
      return subcommand === 'gitea-repo-create' ? gitea.repoCreate(values, g) : gitea.releaseCreate(values, g);
    }
    default:
      throw new Error(`振り分けの無い副 command: ${subcommand}`);
  }
}

async function main(argv, io = { stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() }) {
  const redactor = makeRedactor(envSecrets(io.env));
  const { redact, redactDeep, add } = redactor;
  // stderr にも伏せを通す。
  const stderr = { write: (s) => io.stderr.write(redact(s)) };
  try {
    const { subcommand, values } = parse(argv);
    if (subcommand === HELP) return help(values, io, redactDeep);
    const ctx = { env: io.env, cwd: io.cwd || process.cwd(), stderr, redact, addSecret: add };
    const { exitCode, result } = await dispatch(subcommand, values, ctx, { ...io, stderr });
    if (!result.ok) stderr.write(`publish: ${result.error}\n`);
    writeJson(io.stdout, redactDeep, result);
    return exitCode;
  } catch (e) {
    const code = typeof e.exitCode === 'number' ? e.exitCode : EXIT.FAIL;
    const message = redact(e.message);
    io.stderr.write(`publish: ${message}\n`);
    if (code !== EXIT.USAGE) writeJson(io.stdout, redactDeep, { ok: false, error: message });
    return code;
  }
}

module.exports = { main };
