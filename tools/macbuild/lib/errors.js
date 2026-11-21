'use strict';

// 終了 code（toolconfig.json の out.exitCodes と同じ）。
const EXIT = Object.freeze({
  OK: 0,
  FAIL: 1, // build・署名・確かめの失敗
  USAGE: 2, // 使い方の誤り
  BUSY: 3, // 別の build が lock を持っている
  ENV: 4, // host の設定の誤り・道具の不足
});

class UsageError extends Error {
  get exitCode() {
    return EXIT.USAGE;
  }
}

class EnvError extends Error {
  get exitCode() {
    return EXIT.ENV;
  }
}

module.exports = { EXIT, UsageError, EnvError };
