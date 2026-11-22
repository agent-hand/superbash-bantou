// help: toolconfig.json の定義をそのまま出す。`macbuild help [<並び>]`（例 `macbuild help tauri`・`macbuild help macbuild tauri`）。群も引ける。

import { EXIT } from './errors.ts';
import { TOOL, toolCommands, findElement } from './manifest.ts';
import { writeJson } from './output.ts';

/** 終了 code を返す。words が空なら全体。 */
export function runHelp(words: string[]): number {
  const commands = toolCommands();
  if (words.length === 0) {
    writeJson({ tool: TOOL, usage: 'macbuild <subcommand> ... | macbuild help [<並び>]', commands });
    return EXIT.OK;
  }
  const c = findElement(commands, words);
  if (!c) {
    process.stderr.write(`macbuild: 未知の command: ${words.join(' ')}\n`);
    return EXIT.USAGE;
  }
  writeJson(c);
  return EXIT.OK;
}
