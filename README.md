# superbash-macbuild

[superbash](https://github.com/unagents/superbash) の toolset。mac でしか出来ない build（Tauri）と codesign の署名を、MCP の道具 `superbash-command` の command として出す。

署名の identity・updater の鍵・その password・公証の資格は **host の設定** から読む。道具の引数にも出力にも log にも出さない。

## 構成

```
.manifest/toolconfig.json   定義（正本）。command 3 つの spec
tools/macbuild/main.js      CLI の入口（node。依存なし）
tools/macbuild/lib/         CLI の中身
tests/                      node:test の test と、Tauri の最小の雛形（tests/fixtures/tauri-min）
```

## command

| command | 副 command | 引数（superbash の `args`） | すること |
|---|---|---|---|
| `macbuild-info` | `info` | 無し | xcodebuild・codesign・sccache・cargo・rustc・node・cargo-tauri の有無と版、署名の設定の有無（値は出さない）、lock の状態を JSON で出す |
| `macbuild-tauri` | `tauri` | `project`（必須）、`target`、`bundles`、`debug`、`targetDir` | project の dir で `tauri build --ci` を行い、host の identity（無ければ ad-hoc）で署名させ、codesign で確かめる。conf の場所は Tauri の CLI が探す |
| `macbuild-sign` | `sign` | `path`（必須）、`entitlements`、`noTimestamp` | 成果物を host の identity（無ければ ad-hoc）で署名し直し、codesign で確かめる |

すべて stdout に JSON を 1 つ出す。終了 code は 0 成功、1 build・署名・確かめの失敗、2 使い方の誤り、3 lock が取れない（`macbuild-tauri` だけ）、4 host の設定の誤り・道具の不足。

spec の全体は `macbuild help`、1 つは `macbuild help macbuild-tauri`（`macbuild help tauri` でも同じ）で出る。

### superbash から呼ぶ例

```json
{ "name": "macbuild-info", "args": {} }
{ "name": "macbuild-tauri", "args": { "project": "/path/to/app", "bundles": "app" }, "run_in_background": true }
{ "name": "macbuild-sign", "args": { "path": "/path/to/app/src-tauri/target/release/bundle/macos/Example.app" } }
```

wrapper が組む argv の例: `macbuild tauri --bundles app /path/to/app`。

### 長い build（background）

Tauri の build は数分から十数分かかる。superbash の既定の時間の上限（10 分）を超えうるので、`run_in_background: true` で呼ぶ。返った出力の file（stdout と stderr を合わせた物）と状態の file（`status.json`）を後から読む。

- 出力の file の始めの方に `macbuild: build を始めた: log <path>` が出る。build の詳しいログはその log の file にある。
- 終わると、出力の file の最後に結果の JSON（`ok`・`log`・`artifacts` など）が出て、`status.json` の `state` が `exited` になる。

窓口の側に「開始・状態・ログ」の別の command は無い。

## host の設定

項目ごとに **環境変数 > 設定の file > 既定** の順で決まる。環境変数の空の値は「未設定」と同じ。

| file の key | 環境変数 | 意味 | 既定 |
|---|---|---|---|
| `identity` | `MACBUILD_IDENTITY` | codesign の identity の名前。`-` か未設定なら ad-hoc | 未設定（ad-hoc） |
| `updaterKeyPath` | `MACBUILD_UPDATER_KEY_PATH` | Tauri の updater の秘密鍵の file の path | 未設定 |
| `updaterKeyPasswordEnv` | `MACBUILD_UPDATER_KEY_PASSWORD_ENV` | その鍵の password を持つ **環境変数の名前** | 未設定 |
| `appleIdEnv` | `MACBUILD_APPLE_ID_ENV` | 公証の Apple ID を持つ環境変数の名前（Tauri に `APPLE_ID` で渡す） | 未設定 |
| `applePasswordEnv` | `MACBUILD_APPLE_PASSWORD_ENV` | 公証の app 用 password を持つ環境変数の名前（`APPLE_PASSWORD`） | 未設定 |
| `appleTeamIdEnv` | `MACBUILD_APPLE_TEAM_ID_ENV` | 公証の team id を持つ環境変数の名前（`APPLE_TEAM_ID`） | 未設定 |
| `appleApiKeyEnv` | `MACBUILD_APPLE_API_KEY_ENV` | App Store Connect の API key の id を持つ環境変数の名前（`APPLE_API_KEY`） | 未設定 |
| `appleApiIssuerEnv` | `MACBUILD_APPLE_API_ISSUER_ENV` | その issuer を持つ環境変数の名前（`APPLE_API_ISSUER`） | 未設定 |
| `appleApiKeyPathEnv` | `MACBUILD_APPLE_API_KEY_PATH_ENV` | API key の file の path を持つ環境変数の名前（`APPLE_API_KEY_PATH`） | 未設定 |
| `appleProviderShortNameEnv` | `MACBUILD_APPLE_PROVIDER_SHORT_NAME_ENV` | 複数の team に属する Apple ID で公証する時の provider の short name を持つ環境変数の名前（`APPLE_PROVIDER_SHORT_NAME`） | 未設定 |
| `lockDir` | `MACBUILD_LOCK_DIR` | build の lock を置く dir | `~/Library/Caches/superbash-macbuild` |
| `logDir` | `MACBUILD_LOG_DIR` | build の log を置く dir | `~/Library/Logs/superbash-macbuild` |

- 設定の file: 既定は `~/.config/superbash-macbuild/config.json`。`MACBUILD_CONFIG` で別の path を指せる（指した file が無ければ誤り。既定の file は無くてよい）。
- file の path の値は `~/` で始めてよい。相対 path は設定の file の dir から解く（環境変数の相対 path は cwd から）。
- 未知の key は無視し、stderr に警告を出して続ける（`macbuild-info` の `config.warnings` にも出る）。文字列でない値・環境変数の名前でない値・JSON でない file は誤り（終了 code 4）。
- この repo には値を入れない。host ごとに置く。

設定の file の例（値は架空）:

```json
{
  "identity": "Developer ID Application: Example Corp (EXAMPLE123)",
  "updaterKeyPath": "~/secrets/example-updater.key",
  "updaterKeyPasswordEnv": "EXAMPLE_UPDATER_KEY_PASSWORD",
  "appleIdEnv": "EXAMPLE_NOTARY_APPLE_ID",
  "applePasswordEnv": "EXAMPLE_NOTARY_PASSWORD",
  "appleTeamIdEnv": "EXAMPLE_NOTARY_TEAM_ID"
}
```

### 鍵と署名の扱い

- `macbuild-tauri` は Tauri の CLI の環境の `APPLE_SIGNING_IDENTITY` に identity（無ければ `-`）を入れ、署名は Tauri の bundler に任せる。build の後に `.app` を `codesign --verify --deep --strict` で確かめ、`codesign -dv` で署名の種類（adhoc / certificate）を読む。
- 親の環境の生の `APPLE_*`（`APPLE_SIGNING_IDENTITY`・`APPLE_CERTIFICATE*`・公証の `APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`・`APPLE_API_*` など）と `TAURI_SIGNING_*`（と Tauri v1 の `TAURI_PRIVATE_KEY`・`TAURI_KEY_PASSWORD`）は、**どの子 process にも渡さない**（Tauri の CLI・codesign・`macbuild-info` の版の照会）。設定が名前で指す元の変数（password・公証の資格）も渡さない。署名の扱いは host の設定だけで決め、証明書の keychain への import はさせない。
- 公証: identity の時だけ、`apple*Env` で名前を指した環境変数の値を、Tauri の期待する名前（`APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`・`APPLE_API_KEY`・`APPLE_API_ISSUER`・`APPLE_API_KEY_PATH`・`APPLE_PROVIDER_SHORT_NAME`）で Tauri に渡す。指した変数が無ければ終了 code 4。ad-hoc の時は公証しない（渡さず、変数が無くても誤りにしない）。
- updater の鍵は **path を** `TAURI_SIGNING_PRIVATE_KEY` に渡すだけ。macbuild は鍵の中身を読まない・写さない・出力しない（file が有るかだけ見る）。password は `updaterKeyPasswordEnv` の名前の環境変数から引いて `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に入れる（鍵の path が無い時は password も渡さない）。
- 伏せ: build の出力は行ごとに、log の file に書く前に伏せる（stderr に写す log の末尾も同じ）。`macbuild-sign` の codesign の失敗の message、成果物の `verifyError` も伏せる。伏せる物は identity の文字列（`-` を除く）と、その末尾の `(XXXXXXXXXX)` の team id、伏せた identity の直後の `(XXXXXXXXXX)`（identity を team id 抜きの前方一致の名前で設定した時、codesign の ambiguous の message に並ぶ候補の team id）、updater の鍵の path、設定が名前で指す変数の値（4 文字以上）、keychain の path（`…/Keychains/…`・`*.keychain`・`*.keychain-db`）。`<identity>`・`<team-id>`・`<updater-key>`・`<secret>`・`<keychain>` に置き換わる。成果物の path は伏せる前の出力から拾う（秘密の値が path の一部と一致しても path は壊れない。log の中の path は伏せる）。
- `macbuild-info` は署名の設定の有無だけを出す（値は出さない）。
- `macbuild-sign` は元の署名の entitlements・flag（hardened runtime など）・runtime の版を引き継ぐ（`--preserve-metadata=entitlements,flags,runtime`。`entitlements` を渡せばそちらが優先）。hardened runtime を無条件には付けない。identity の時は `--timestamp` を付け、`noTimestamp: true`（`--no-timestamp`）なら `--timestamp=none`（offline の署名用。ad-hoc は元から timestamp を付けない）。bundle の中の入れ子の code（frameworks・sidecar）は署名し直さない（外側だけ）。

## 排他（macbuild-tauri）

- build は host で同時に 1 本。`lockDir` の下の file `macbuild-tauri.lock` に、kernel の排他 lock を取る（open(2) の `O_EXLOCK`。flock と同じ lock）。
- **取れない時は待たない**。stderr に持ち主（pid・開始時刻・project）を出し、stdout に `{"ok": false, "error": "lock-busy", "lock": {...}}`、終了 code 3 で終わる。後で呼び直す。
- lock は macbuild の process に付き、build が成功しても失敗しても、signal でも、SIGKILL（superbash の時間切れなど）で止められても、process が終われば kernel が外す。古い lock を見分けて外す処理は無い（その競合も、pid の使い回しで古い lock が生きて見える事も起きない）。
- lock の file の中身（pid・開始時刻・project）は持ち主の表示のためだけ。file は消さない。
- lock の状態は `macbuild-info` の `lock` で見られる。

## MCP の設定（host の側）

superbash の MCP の設定の 1 件として書く。toolset は package の名前@版・git の repo・手元の dir のどれでも npm に渡せる物（値は架空）:

```json
{
  "mcpServers": {
    "macbuild": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "--package=superbash@0.1.0", "--", "superbash", "superbash-macbuild@0.1.1"],
      "env": {
        "MACBUILD_CONFIG": "/path/to/macbuild-config.json",
        "EXAMPLE_UPDATER_KEY_PASSWORD": "<password の置き場から入れる>",
        "EXAMPLE_NOTARY_APPLE_ID": "<置き場から入れる>",
        "EXAMPLE_NOTARY_PASSWORD": "<置き場から入れる>",
        "EXAMPLE_NOTARY_TEAM_ID": "<置き場から入れる>"
      }
    }
  }
}
```

`--allow-cmd macbuild-info,macbuild-tauri` のように、出す command を絞れる。

toolset を変えたら `package.json` の `version` を上げる。superbash 0.1.0 は起動のたびに package を生成し直すが、npx は生成した tarball の path と名前@版が同じだと、前に展開した写し（npm の cache の `_npx/`）を使い続ける（この Mac で確かめた）。

## 前提

- macOS、node 18 以上、`codesign`（OS に有る）。
- Tauri の build には Rust の toolchain（`cargo`）と、project の `node_modules/.bin/tauri`（`@tauri-apps/cli`）か PATH の `cargo-tauri`。Tauri の CLI は project の dir から上へ `node_modules/.bin/tauri` を探す。
- Xcode は要らない（Command Line Tools で Tauri の `.app` は作れる）。`xcodebuild` の有無は `macbuild-info` で見られる。

## 既知の制限

- `-` で始まる positional（`project`・`path`）: superbash の wrapper は positional の前に `--` を入れないので、`-` で始まる値は option と読まれ、使い方の誤り（終了 code 2）になる。`./-name` か絶対 path で渡す。
- 伏せは文字列の一致による。4 文字未満の秘密の値は伏せない（log 全体を壊すため）。

## test

```
npm test
```

node:test で、spec と help の整合、argv の組み立て（superbash の spec.in の規則 → CLI）、設定の読み込み（環境変数と file の優先・未知の key の警告）、排他の振る舞い（SIGKILL の後に取れる事を含む）、子の環境から秘密の変数を外す事と出力・log での伏せ（偽の identity と偽の `APPLE_*` の値で）、偽の Tauri の CLI と ad-hoc の codesign による build・署名の流れを確かめる。偽の identity では本物の codesign を呼ばない（keychain を引かせない）。一時の dir は `os.tmpdir()`（`TMPDIR`）の下に作って消す。

`tests/fixtures/tauri-min` は画面 1 つの Tauri の最小の雛形（実際の build の確かめ用。test からは使わない）。

## License

MIT
