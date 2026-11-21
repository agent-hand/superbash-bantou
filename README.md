# superbash-macbuild

[superbash](https://github.com/unagents/superbash) の toolset。mac でしか出来ない build（Tauri）と codesign の署名を、MCP の道具 `superbash-command` の command として出す。

署名の identity・updater の鍵・その password は **host の設定** から読む。道具の引数にも出力にも出さない。

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
| `macbuild-tauri` | `tauri` | `project`（必須）、`target`、`bundles`、`debug`、`targetDir` | project の dir で `tauri build --ci` を行い、host の identity（無ければ ad-hoc）で署名させ、codesign で確かめる |
| `macbuild-sign` | `sign` | `path`（必須）、`entitlements` | 成果物を host の identity（無ければ ad-hoc）で署名し直し、codesign で確かめる |

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
| `lockDir` | `MACBUILD_LOCK_DIR` | build の lock を置く dir | `~/Library/Caches/superbash-macbuild` |
| `logDir` | `MACBUILD_LOG_DIR` | build の log を置く dir | `~/Library/Logs/superbash-macbuild` |

- 設定の file: 既定は `~/.config/superbash-macbuild/config.json`。`MACBUILD_CONFIG` で別の path を指せる（指した file が無ければ誤り。既定の file は無くてよい）。
- file の path の値は `~/` で始めてよい。相対 path は設定の file の dir から解く（環境変数の相対 path は cwd から）。
- 未知の key・文字列でない値・JSON でない file は誤り（終了 code 4）。打ち間違いで黙って ad-hoc になる事を避けるため。
- この repo には値を入れない。host ごとに置く。

設定の file の例（値は架空）:

```json
{
  "identity": "Developer ID Application: Example Corp (EXAMPLE123)",
  "updaterKeyPath": "~/secrets/example-updater.key",
  "updaterKeyPasswordEnv": "EXAMPLE_UPDATER_KEY_PASSWORD"
}
```

### 鍵と署名の扱い

- `macbuild-tauri` は Tauri の CLI の環境の `APPLE_SIGNING_IDENTITY` に identity（無ければ `-`）を入れ、署名は Tauri の bundler に任せる。build の後に `.app` を `codesign --verify --deep --strict` で確かめ、`codesign -dv` で署名の種類（adhoc / certificate）を読む。
- 親の環境の `APPLE_SIGNING_IDENTITY`・`APPLE_CERTIFICATE`・`APPLE_CERTIFICATE_PASSWORD`・`TAURI_SIGNING_PRIVATE_KEY*` は子に渡さない（署名の扱いは host の設定だけで決める。証明書の keychain への import はさせない）。ad-hoc の時は公証の資格（`APPLE_ID`・`APPLE_API_KEY` など）も外す。identity の時はそのまま渡す（公証は Tauri の振る舞いのまま）。
- updater の鍵は **path を** `TAURI_SIGNING_PRIVATE_KEY` に渡すだけ。macbuild は鍵の中身を読まない・写さない・出力しない（file が有るかだけ見る）。password は `updaterKeyPasswordEnv` の名前の環境変数から引いて `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に入れ、元の変数は子に渡さない。
- 出力（stdout・stderr・log）には identity の名前・鍵の path・password を出さない。`macbuild-info` は有無だけを出す。
- `macbuild-sign` は identity の時 `--options runtime --timestamp` を付ける。bundle の中の入れ子の code（frameworks・sidecar）は署名し直さない（外側だけ）。

## 排他（macbuild-tauri）

- build は host で同時に 1 本。`lockDir` の下に `macbuild-tauri.lock` を取る（owner.json に pid・開始時刻・project を書いた一時の dir を rename する。不可分）。
- **取れない時は待たない**。stderr に持ち主（pid・開始時刻・project）を出し、stdout に `{"ok": false, "error": "lock-busy", "lock": {...}}`、終了 code 3 で終わる。後で呼び直す。
- build が成功しても失敗しても、SIGINT・SIGTERM・SIGHUP で止められても lock を外す。
- SIGKILL（superbash の時間切れなど）で残った lock は、持ち主の pid が居なければ次の呼び出しが外して取る。
- lock の状態は `macbuild-info` の `lock` で見られる。

## MCP の設定（host の側）

superbash の MCP の設定の 1 件として書く。toolset は package の名前@版・git の repo・手元の dir のどれでも npm に渡せる物（値は架空）:

```json
{
  "mcpServers": {
    "macbuild": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "--package=superbash@0.1.0", "--", "superbash", "superbash-macbuild@0.1.0"],
      "env": {
        "MACBUILD_CONFIG": "/path/to/macbuild-config.json",
        "EXAMPLE_UPDATER_KEY_PASSWORD": "<password の置き場から入れる>"
      }
    }
  }
}
```

`--allow-cmd macbuild-info,macbuild-tauri` のように、出す command を絞れる。

## 前提

- macOS、node 18 以上、`codesign`（OS に有る）。
- Tauri の build には Rust の toolchain（`cargo`）と、project の `node_modules/.bin/tauri`（`@tauri-apps/cli`）か PATH の `cargo-tauri`。Tauri の CLI は project の dir から上へ `node_modules/.bin/tauri` を探す。
- Xcode は要らない（Command Line Tools で Tauri の `.app` は作れる）。`xcodebuild` の有無は `macbuild-info` で見られる。

## test

```
npm test
```

node:test で、spec と help の整合、argv の組み立て（superbash の spec.in の規則 → CLI）、設定の読み込み（環境変数と file の優先）、排他の振る舞い、偽の Tauri の CLI と ad-hoc の codesign による build・署名の流れを確かめる。一時の dir は `os.tmpdir()`（`TMPDIR`）の下に作って消す。

`tests/fixtures/tauri-min` は画面 1 つの Tauri の最小の雛形（実際の build の確かめ用。test からは使わない）。

## License

MIT
