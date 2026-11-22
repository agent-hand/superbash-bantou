import { defineCommand } from 'citty';
import { repo } from './repo/index.ts';
import { release } from './release/index.ts';

// 群は run を持たない（citty は子の後に親の run も走らせる）。
export const gitea = defineCommand({
  meta: { name: "gitea", description: "Gitea の repo と release を作る（実際に作られる）。Gitea の URL は呼ぶ時の --url で受け、token は git credential fill で引く。" },
  subCommands: { repo, release },
});
