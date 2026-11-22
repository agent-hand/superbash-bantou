// macbuild sign: 成果物を host の設定の identity（無ければ ad-hoc）で署名し直し、codesign で確かめる。
// codesign の失敗の message は、返す前に identity・keychain の path などを伏せる。

import fs from 'node:fs';
import path from 'node:path';

import * as codesign from './codesign.ts';
import { loadConfig, reportWarnings, codesignIdentity } from './config.ts';
import { EXIT, UsageError, EnvError } from './errors.ts';
import { which } from './proc.ts';
import { scrubEnv, secretsOf, makeRedactor } from './secrets.ts';

/**
 * @param {object} values { path, entitlements?, noTimestamp? }
 * @param {object} ctx { env, cwd, stderr, tool }（tool は test で codesign の代わりを渡すため）
 */
function signArtifact(values, { env = process.env, cwd = process.cwd(), stderr = process.stderr, tool = codesign } = {}) {
  if (process.platform !== 'darwin') throw new EnvError('mac（darwin）でしか動かない');
  const target = path.resolve(cwd, values.path);
  if (!fs.existsSync(target)) throw new UsageError(`署名する物が無い: ${target}`);
  let entitlements = null;
  if (values.entitlements) {
    entitlements = path.resolve(cwd, values.entitlements);
    if (!fs.existsSync(entitlements)) throw new UsageError(`entitlements の file が無い: ${entitlements}`);
  }

  const config = loadConfig({ env, cwd });
  reportWarnings(config, stderr);
  if (!which('codesign', env)) throw new EnvError('codesign が無い');
  const toolEnv = scrubEnv(env, config);
  const redact = makeRedactor(secretsOf(config, env));

  const base = { path: target, signing: config.signingMode };
  const s = tool.sign(target, {
    identity: codesignIdentity(config),
    entitlements,
    noTimestamp: Boolean(values.noTimestamp),
    env: toolEnv,
  });
  if (!s.ok) {
    return { exitCode: EXIT.FAIL, result: { ok: false, ...base, error: redact(`署名が失敗: ${s.message}`) } };
  }
  const v = tool.verify(target, { env: toolEnv });
  const signature = tool.describe(target, { env: toolEnv });
  const expected = config.signingMode === 'identity' ? 'certificate' : 'adhoc';
  let error = null;
  if (!v.ok) error = redact(`署名の確かめが通らない: ${v.message}`);
  else if (signature.kind !== expected) error = `署名が ${expected} でない（${signature.kind}）`;
  return {
    exitCode: error ? EXIT.FAIL : EXIT.OK,
    result: { ok: error === null, ...base, verified: v.ok, signature, ...(error ? { error } : {}) },
  };
}

export { signArtifact };
