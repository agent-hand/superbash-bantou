import { defineCommand } from 'citty';
import { publish } from './publish.ts';

// 群は run を持たない（citty は子の後に親の run も走らせる）。
export const npm = defineCommand({
  meta: { name: "npm", description: "npm の package を publish する（実際に公開される）。host の npm の設定（npm login）を使う。" },
  subCommands: { publish },
});
