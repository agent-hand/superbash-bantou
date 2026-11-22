// help: toolconfig.json の定義をそのまま出す。`publish help [<並び>]`（例 `publish help github release create`）。群も引ける。

import { EXIT } from './errors.ts';
import { TOOL, toolCommands, findElement } from './manifest.ts';
import { stderr, writeJson } from './runtime.ts';

/** 終了 code を返す。words が空なら全体。 */
export function runHelp(words: string[]): number {
  const commands = toolCommands();
  if (words.length === 0) {
    writeJson({ tool: TOOL, usage: 'publish <並び> ... | publish help [<並び>]', commands });
    return EXIT.OK;
  }
  const c = findElement(commands, words);
  if (!c) {
    stderr.write(`publish: 未知の command: ${words.join(' ')}\n`);
    return EXIT.USAGE;
  }
  writeJson(c);
  return EXIT.OK;
}
