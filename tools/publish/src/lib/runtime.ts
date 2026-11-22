// 出力は必ず redactor（秘密を伏せる）を通す。ネットワークの宛先（registry・Gitea の URL）は
// host の設定に持たず、呼ぶ時の option で受ける。

import { EXIT } from './errors.ts';
import { envSecrets, makeRedactor } from './secrets.ts';

export const redactor = makeRedactor(envSecrets(process.env));
export const { redact, redactDeep, add: addSecret } = redactor;

/** stderr にも伏せを通す。 */
export const stderr = { write: (s: string) => process.stderr.write(redact(s)) };

/** 値の文字列の葉だけを伏せて、stdout に JSON で 1 つ出す（直列化の後の文字列には通さない）。 */
export function writeJson(value: unknown, stream: { write(s: string): unknown } = process.stdout): void {
  stream.write(JSON.stringify(redactDeep(value), null, 2) + '\n');
}

export interface Ctx {
  env: NodeJS.ProcessEnv;
  cwd: string;
  stderr: { write(s: string): unknown };
  redact: (s: unknown) => string;
  addSecret: (v: unknown) => void;
}

/** 葉の command の共通の動き: 作業を行い、失敗なら stderr に 1 行、結果を stdout に JSON で出し、終了 code を決める。 */
export async function runLeaf(work: (ctx: Ctx) => Promise<{ exitCode: number; result: any }> | { exitCode: number; result: any }): Promise<void> {
  const ctx: Ctx = { env: process.env, cwd: process.cwd(), stderr, redact, addSecret };
  const { exitCode, result } = await work(ctx);
  if (!result.ok) stderr.write(`publish: ${result.error}\n`);
  writeJson(result);
  process.exitCode = exitCode ?? EXIT.OK;
}
