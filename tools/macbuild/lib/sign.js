'use strict';
// macbuild sign: 成果物を host の設定の identity（無ければ ad-hoc）で署名し直し、codesign で確かめる。

const fs = require('node:fs');
const path = require('node:path');

const codesign = require('./codesign');
const { loadConfig, codesignIdentity } = require('./config');
const { EXIT, UsageError, EnvError } = require('./errors');
const { which } = require('./proc');

function signArtifact(values, { env = process.env, cwd = process.cwd() } = {}) {
  if (process.platform !== 'darwin') throw new EnvError('mac（darwin）でしか動かない');
  const target = path.resolve(cwd, values.path);
  if (!fs.existsSync(target)) throw new UsageError(`署名する物が無い: ${target}`);
  let entitlements = null;
  if (values.entitlements) {
    entitlements = path.resolve(cwd, values.entitlements);
    if (!fs.existsSync(entitlements)) throw new UsageError(`entitlements の file が無い: ${entitlements}`);
  }

  const config = loadConfig({ env, cwd });
  if (!which('codesign', env)) throw new EnvError('codesign が無い');

  const base = { path: target, signing: config.signingMode };
  const s = codesign.sign(target, { identity: codesignIdentity(config), entitlements });
  if (!s.ok) {
    return { exitCode: EXIT.FAIL, result: { ok: false, ...base, error: `署名が失敗: ${s.message}` } };
  }
  const v = codesign.verify(target);
  const signature = codesign.describe(target);
  const expected = config.signingMode === 'identity' ? 'certificate' : 'adhoc';
  let error = null;
  if (!v.ok) error = `署名の確かめが通らない: ${v.message}`;
  else if (signature.kind !== expected) error = `署名が ${expected} でない（${signature.kind}）`;
  return {
    exitCode: error ? EXIT.FAIL : EXIT.OK,
    result: { ok: error === null, ...base, verified: v.ok, signature, ...(error ? { error } : {}) },
  };
}

module.exports = { signArtifact };
