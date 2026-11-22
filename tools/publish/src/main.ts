// publish: 公開の操作（npm の package の公開、GitHub・Gitea の repo・release の作成）の窓口の定義。
// 読み込んでも走らない（実行は cli.ts）。
import { defineCommand } from 'citty';
import { gitea } from './command/gitea/index.ts';
import { github } from './command/github/index.ts';
import { help } from './command/help.ts';
import { npm } from './command/npm/index.ts';

// 1 段目の key は、上の要素の spec.subcommand（npm・github・gitea）と、必須の help。
export const main = defineCommand({
  meta: { name: 'publish', version: '0.6.0', description: '公開の操作（npm の publish、GitHub・Gitea の repo と release の作成）' },
  subCommands: { help, npm, github, gitea },
});
