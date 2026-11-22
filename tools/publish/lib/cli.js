'use strict';
// publish の CLI: 引数を読み、副 command を振り分ける。結果は stdout に JSON で出す。
// stdout・stderr に出す文字列は、必ず redactor（秘密を伏せる）を通す。
// ネットワークの宛先（registry・Gitea の URL）は host の設定に持たず、呼ぶ時の option で受ける。

const { HELP, parse } = require('./commands');
const { EXIT } = require('./errors');
const { TOOL, toolCommands, findElement } = require('./manifest');
const { envSecrets, makeRedactor } = require('./secrets');

// redactDeep: 値の文字列の葉だけを伏せる関数（直列化の後の文字列には通さない）。
function writeJson(stream, redactDeep, value) {
  stream.write(JSON.stringify(redactDeep(value), null, 2) + '\n');
}

/** help: toolconfig.json の定義をそのまま出す。`<bin> help [<並び>]`（例 `publish help github release create`）。群も引ける。 */
function help(values, io, redact) {
  const commands = toolCommands();
  if (!values.words) {
    writeJson(io.stdout, redact, { tool: TOOL, usage: 'publish <並び> ... | publish help [<並び>]', commands });
    return EXIT.OK;
  }
  const c = findElement(commands, values.words);
  if (!c) {
    io.stderr.write(`publish: 未知の command: ${values.words.join(' ')}\n`);
    return EXIT.USAGE;
  }
  writeJson(io.stdout, redact, c);
  return EXIT.OK;
}

async function dispatch(subcommand, values, ctx) {
  switch (subcommand) {
    case 'npm publish':
      return require('./npm').publishPackage(values, { ...ctx, label: subcommand });
    case 'github repo create':
      return require('./github').repoCreate(values, ctx);
    case 'github release create':
      return require('./github').releaseCreate(values, ctx);
    case 'gitea repo create':
      return require('./gitea').repoCreate(values, ctx);
    case 'gitea release create':
      return require('./gitea').releaseCreate(values, ctx);
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
    const { exitCode, result } = await dispatch(subcommand, values, ctx);
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
