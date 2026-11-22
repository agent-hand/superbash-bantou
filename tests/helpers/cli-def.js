'use strict';
// citty の定義（tools/<名前>/src/main.ts）を読み、入口（cli.ts）と同じ検査・同じ読み方で argv を値にする。
// 定義の読み込みは走らない（main.ts は定義だけ）。TS は node の型の除去で読む（node 22.18 以上）。

const path = require('node:path');
const { parseArgs } = require('citty');

const { ROOT } = require('./env');

const HINTS = { macbuild: 'macbuild help で一覧', publish: 'help で一覧' };

function loadDef(tool) {
  const src = path.join(ROOT, 'tools', tool, 'src');
  const { main } = require(path.join(src, 'main.ts'));
  const argv = require(path.join(src, 'lib', 'argv.ts'));

  /** argv を { subcommand（葉の並びの語）, values } に読む。使い方の誤りは UsageError。help は含まない。 */
  function parse(list) {
    const { names, cmd, rest } = argv.findLeaf(main, list, HINTS[tool]);
    const parsed = parseArgs(argv.normalizeArgv(cmd.args, rest), cmd.args);
    return { subcommand: names.join(' '), values: argv.valuesOf(cmd.args, parsed) };
  }

  return { main, parse, argv };
}

module.exports = { loadDef };
