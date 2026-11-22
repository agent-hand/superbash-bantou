import { defineCommand } from 'citty';
import { collect } from '../lib/info.ts';
import { writeJson } from '../lib/output.ts';

export const info = defineCommand({
  meta: { name: "info", description: "この host で使える build の道具（xcodebuild・codesign・sccache・cargo・rustc・node・cargo-tauri）の有無と版、署名の設定が有るか無いか（値は出さない）、build の lock の状態を出す。" },
  run() {
    const { report, exitCode } = collect({ env: process.env, stderr: process.stderr });
    writeJson(report);
    process.exitCode = exitCode;
  },
});
