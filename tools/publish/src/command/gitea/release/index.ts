import { defineCommand } from 'citty';
import { create } from './create.ts';

// 群は run を持たない（citty は子の後に親の run も走らせる）。
export const release = defineCommand({
  meta: { name: "release", description: "release の操作" },
  subCommands: { create },
});
