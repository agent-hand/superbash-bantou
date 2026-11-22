'use strict';

// 終了 code（toolconfig.json の out.exitCodes と同じ）。
const EXIT = Object.freeze({
  OK: 0,
  FAIL: 1, // publish・作成の失敗
  USAGE: 2, // 使い方の誤り
  ENV: 4, // host の設定の誤り・道具や認証の不足
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

class FailError extends Error {
  get exitCode() {
    return EXIT.FAIL;
  }
}

module.exports = { EXIT, UsageError, EnvError, FailError };
