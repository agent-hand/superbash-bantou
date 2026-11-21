'use strict';
// macbuild の CLI: 引数を読み、副 command を振り分ける。結果は stdout に JSON で出す。

const { HELP, parse } = require('./commands');
const { EXIT } = require('./errors');
const { TOOL, toolCommands } = require('./manifest');

function writeJson(stream, value) {
  stream.write(JSON.stringify(value, null, 2) + '\n');
}

/** help: spec（toolconfig.json の定義）をそのまま出す。command は名前（macbuild-tauri）か副 command（tauri）。 */
function help(values, io) {
  const commands = toolCommands();
  if (!values.command) {
    writeJson(io.stdout, { tool: TOOL, usage: 'macbuild <subcommand> ...', commands });
    return EXIT.OK;
  }
  const c = commands.find((x) => x.name === values.command || (x.spec && x.spec.subcommand === values.command));
  if (!c) {
    io.stderr.write(`macbuild: 未知の command: ${values.command}\n`);
    return EXIT.USAGE;
  }
  writeJson(io.stdout, c);
  return EXIT.OK;
}

async function main(argv, io = { stdout: process.stdout, stderr: process.stderr, env: process.env }) {
  try {
    const { subcommand, values } = parse(argv);
    switch (subcommand) {
      case HELP:
        return help(values, io);
      case 'info': {
        const { report, exitCode } = require('./info').collect({ env: io.env, stderr: io.stderr });
        writeJson(io.stdout, report);
        return exitCode;
      }
      case 'tauri': {
        const { exitCode, result } = await require('./tauri').build(values, { stderr: io.stderr, env: io.env });
        writeJson(io.stdout, result);
        return exitCode;
      }
      case 'sign': {
        const { exitCode, result } = require('./sign').signArtifact(values, { env: io.env, stderr: io.stderr });
        if (!result.ok) io.stderr.write(`macbuild: ${result.error}\n`);
        writeJson(io.stdout, result);
        return exitCode;
      }
      default:
        throw new Error(`振り分けの無い副 command: ${subcommand}`);
    }
  } catch (e) {
    const code = typeof e.exitCode === 'number' ? e.exitCode : EXIT.FAIL;
    io.stderr.write(`macbuild: ${e.message}\n`);
    if (code !== EXIT.USAGE) writeJson(io.stdout, { ok: false, error: e.message });
    return code;
  }
}

module.exports = { main };
