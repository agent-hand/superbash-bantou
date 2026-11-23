'use strict';
// 終了 code の説明に挙がる道具の名前は、その葉が実際に起動する・探す道具と同じ（全部の葉）。
// 実際の道具は src で決まる: github は gh だけ（git は使わない）、gitea は git（credential fill）だけ（gh は使わない）、
// npm は npm だけ、macbuild は葉ごとに下の表。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { MANIFEST } = require('./helpers/env');
const { leaves } = require('./helpers/spec-in');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// 並びの名前 → 終了 code 4（道具・認証の不足）で名前を挙げてよい道具、かつ挙げるべき道具。
const TOOLS_OF = {
  'npm publish': ['npm'],
  'github repo create': ['gh'],
  'github release create': ['gh'],
  'gitea repo create': ['git'],
  'gitea release create': ['git'],
  'macbuild info': [],
  'macbuild tauri': ['codesign', 'cargo'],
  'macbuild sign': ['codesign'],
};

// 説明の文に出る道具の名前の語彙（これが文に出たら、その葉が使う道具でなければならない）。
const VOCAB = ['gh', 'git', 'npm', 'curl', 'tar', 'codesign', 'cargo', 'cargo-tauri', 'xcodebuild', 'sccache', 'rustc'];

function named(text) {
  return VOCAB.filter((w) => new RegExp(`(?<![\\w-])${w}(?![\\w-])`).test(text));
}

const all = [...leaves(manifest, 'macbuild'), ...leaves(manifest, 'publish')];

test('表は全部の葉を覆う', () => {
  assert.deepEqual(all.map((l) => l.name).sort(), Object.keys(TOOLS_OF).sort());
});

test('終了 code の説明に挙がる道具は、その葉が実際に使う道具と合う（全部の葉・全部の code）', () => {
  for (const l of all) {
    const used = TOOLS_OF[l.name];
    const codes = l.node.spec.out.exitCodes;
    for (const [code, text] of Object.entries(codes)) {
      for (const w of named(text)) {
        assert.ok(used.includes(w), `${l.name}: 終了 code ${code} の説明に、使わない道具 ${w} がある: ${text}`);
      }
    }
    // 終了 code 4 は道具が無い時の code。使う道具は全部挙げる（macbuild info は道具の有無を出すだけなので除く）。
    if (used.length > 0) {
      const four = named(codes['4']);
      for (const w of used) assert.ok(four.includes(w), `${l.name}: 終了 code 4 に ${w} が無い: ${codes['4']}`);
    }
  }
});

test('github の終了 code 4 は gh が PATH に無い時だけ（git・認証は挙げない。認証の失敗は終了 code 1）', () => {
  for (const name of ['github repo create', 'github release create']) {
    const codes = all.find((l) => l.name === name).node.spec.out.exitCodes;
    assert.equal(codes['4'], 'gh が PATH に無い');
    assert.ok(/認証/.test(codes['1']), `${name}: 認証の失敗は code 1`);
  }
});

test('照合の目: 元の誤り（github の説明に git）と、gitea の説明に gh は検出できる', () => {
  assert.deepEqual(named('host の設定の誤り・道具（gh・git）が無い・認証が取れない'), ['gh', 'git']);
  assert.ok(!TOOLS_OF['github repo create'].includes('git'));
  assert.ok(!TOOLS_OF['gitea repo create'].includes('gh'));
  assert.deepEqual(named('host の設定の誤り・git が無い・git の credential から token が取れない'), ['git']);
});
