import { defineCommand } from 'citty';
import { create } from './create.ts';

// 群は run を持たない（citty は子の後に親の run も走らせる）。
export const repo = defineCommand({
  meta: { name: "repo", description: "repo の操作" },
  subCommands: { create },
});
