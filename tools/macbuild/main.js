#!/usr/bin/env node
'use strict';
// macbuild: mac の build（Tauri）と署名の窓口。使い方は `macbuild help`。

const { main } = require('./lib/cli');

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`macbuild: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  },
);
