import { defineCommand } from 'citty';
import { valuesOf } from '../lib/argv.ts';
import { writeJson } from '../lib/output.ts';
import { signArtifact } from '../lib/sign.ts';

export const args = {
  entitlements: { type: "string", description: "署名に付ける entitlements の plist の path（省略時は元の署名の entitlements を引き継ぐ）" },
  timestamp: { type: "boolean", default: true, description: "identity の署名に timestamp を付けない（offline で署名する時）。ad-hoc では元から付けない" },
  path: { type: 'positional', required: true, description: "署名し直す成果物の path。相対 path は起動した cwd から" },
} as const;

export const sign = defineCommand({
  meta: { name: "sign", description: "指定の成果物（.app・.dmg・実行 file）を host の設定の identity で署名し直す（identity が無ければ ad-hoc）。元の署名の entitlements と hardened runtime などの flag は引き継ぐ（--entitlements を渡せばそちら）。identity の時は timestamp を付ける（no-timestamp で外せる）。署名の後に codesign --verify --strict（bundle は --deep も）で確かめ、署名の種類を出す。bundle の中の入れ子の code は署名し直さない（外側だけ）。" },
  args,
  async run({ args: parsed }) {
    const { exitCode, result } = signArtifact(valuesOf(args, parsed), { env: process.env, stderr: process.stderr });
    if (!result.ok) process.stderr.write(`macbuild: ${result.error}\n`);
    writeJson(result);
    process.exitCode = exitCode;
  },
});
