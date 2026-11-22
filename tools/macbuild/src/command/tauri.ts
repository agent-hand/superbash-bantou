import { defineCommand } from 'citty';
import { valuesOf } from '../lib/argv.ts';
import { writeJson } from '../lib/output.ts';
import { build } from '../lib/tauri.ts';

export const args = {
  target: { type: "string", description: "Rust の target triple（aarch64-apple-darwin・x86_64-apple-darwin・universal-apple-darwin）。省略時は host の target" },
  bundles: { type: "string", description: "作る bundle の種類を , で区切る（app・dmg）。省略時は Tauri の設定の bundle.targets" },
  debug: { type: "boolean", description: "debug の build にする" },
  targetDir: { type: "string", description: "cargo の target の dir（CARGO_TARGET_DIR として渡す）。省略時は環境の CARGO_TARGET_DIR か cargo の既定" },
  project: { type: 'positional', required: true, description: "Tauri の CLI を起動する dir（Tauri の project の dir）。conf の場所は Tauri の CLI が探す。相対 path は起動した cwd から" },
} as const;

export const tauri = defineCommand({
  meta: { name: "tauri", description: "指定の project の dir で Tauri の build（tauri build --ci）を行い、host の設定の identity で署名する（identity が無ければ ad-hoc）。identity の時だけ、host の設定が名前で指す環境変数から公証の資格（APPLE_ID・APPLE_PASSWORD・APPLE_TEAM_ID・APPLE_API_KEY・APPLE_API_ISSUER・APPLE_API_KEY_PATH・APPLE_PROVIDER_SHORT_NAME）を Tauri に渡す（親の環境の APPLE_* は渡さない）。同時に走る build は 1 本だけで、lock が取れなければ待たずに終わる（終了 code 3）。build のログは秘密を伏せて file に書き、その path と成果物の path（伏せる前の出力から拾う）・署名の確かめの結果を出す。長いので superbash の run_in_background で呼び、出力の file を後から読む。" },
  args,
  async run({ args: parsed }) {
    const { exitCode, result } = await build(valuesOf(args, parsed), { stderr: process.stderr, env: process.env });
    writeJson(result);
    process.exitCode = exitCode;
  },
});
