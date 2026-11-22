#!/usr/bin/env node
'use strict';
// publish: npm の package の公開と、GitHub・Gitea の repo・release の作成の窓口。使い方は `publish help`。

const { main } = require('./lib/cli');

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`publish: ${e && e.message ? e.message : e}\n`);
    process.exitCode = 1;
  },
);
