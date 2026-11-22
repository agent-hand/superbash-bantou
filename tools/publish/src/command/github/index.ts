import { defineCommand } from 'citty';
import { repo } from './repo/index.ts';
import { release } from './release/index.ts';

// 群は run を持たない（citty は子の後に親の run も走らせる）。
export const github = defineCommand({
  meta: { name: "github", description: "GitHub の repo と release を作る（実際に作られる）。host の gh の認証を使う。" },
  subCommands: { repo, release },
});
