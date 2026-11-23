// macbuild: mac の build（Tauri）と署名の窓口の定義。読み込んでも走らない（実行は cli.ts）。
import { defineCommand } from 'citty';
import { help } from './command/help.ts';
import { info } from './command/info.ts';
import { sign } from './command/sign.ts';
import { tauri } from './command/tauri.ts';

// 1 段目の key は argv の頭の語（macbuild は上の要素に spec.subcommand が無いので、info・tauri・sign）と、必須の help。
export const main = defineCommand({
  meta: {
    name: 'macbuild',
    version: '0.6.2',
    description:
      'mac でしか出来ない build（Tauri）と codesign の署名の窓口。署名の identity・updater の鍵・公証の資格は host の設定から読み、道具の引数にも出力にも出さない。',
  },
  subCommands: { help, info, tauri, sign },
});
