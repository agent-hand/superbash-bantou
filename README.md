# superbash-bantou

[superbash](https://github.com/agent-hand/superbash) の toolset（0.6.0）。mac でしか出来ない build（Tauri）と codesign の署名（`macbuild` の下に `info`・`tauri`・`sign`）、npm の package の公開と GitHub・Gitea の repo・release の作成（`npm`・`github`・`gitea` の下のサブコマンド）を、MCP の道具 `superbash-command` の command として出す。

**使える superbash の版: 0.2.0 以上。** 0.3.0 以降の manifest は入れ子のサブコマンド（superbash 0.2.0 で対応）で書いてあり、0.1.x は読めない（群に `spec` が無いので「形が不正」で止まるか、`subcommands` を黙って捨てる）。呼ぶ名前は `macbuild info` のように空白で区切った並び。

0.6.0 は、superbash 0.4.0 の `--sandbox` 用の方針を manifest に足した版（下の「sandbox」）。呼ぶ名前・引数・出力・終了 code は 0.5.0 と同じ。

0.5.0 は、busybox 化の module 対応を足した版（toolset の作法 5.4）。各 tool は `dist/cli.mjs`（入口）に加え、読み込んでも走らない module `dist/main.mjs` を出し、manifest の `tools.<名前>.module` が指す。module は `main`（citty の command）と `run(rawArgs: string[]): Promise<number>`（`runCommand` で呼び、使い方の誤りは 2・その他の誤りは 1 などの終了 code を返す）を export する。`cli.mjs` は `run(process.argv.slice(2))` の結果を終了 code にするだけ。呼ぶ名前・引数・出力・終了 code は 0.4.0 と同じ。module を知らない superbash（0.2.0）は今までどおり entry（`cli.mjs`）で動く。1 つの実行 file にはまとめない。

0.4.0 は、command を TypeScript（[citty](https://github.com/unjs/citty)）で書き直し、配る前に 1 つの JS にまとめた版。呼ぶ名前・引数・出力・終了 code は 0.3.0 と同じ（entry が `main.js` から `dist/cli.mjs` に変わっただけ）。

署名の identity・updater の鍵・その password・公証の資格は **host の設定** から読む。道具の引数にも出力にも log にも出さない。command と toolset の host の設定は、ネットワークの宛先・アドレス（registry・Gitea の URL など）を持たない。宛先が要る command は、呼ぶ時の引数（`--registry`・`--url`）で受ける。

## 0.2.x からの移行

- 名前は 1 組だけで、古い名前は残していない: `macbuild-info`・`macbuild-tauri`・`macbuild-sign` は `macbuild info`・`macbuild tauri`・`macbuild sign`。`npm-publish` は `npm publish`、`github-repo-create` などは `github repo create`・`github release create`・`gitea repo create`・`gitea release create`。`verdaccio-publish` は無く、`npm publish` の `registry` で registry を指す。
- 起動の `--allow-cmd`（MCP の設定・launchd の plist）に古い名前が残ると、superbash は警告を出すだけでその command 無しで起動する。新しい名前（`macbuild`・`npm`・`github repo` など。群の名前も書ける）に同時に直す。
- host の設定の `verdaccioRegistry`・`giteaUrl`・`giteaUsername` と環境変数 `PUBLISH_VERDACCIO_REGISTRY`・`PUBLISH_GITEA_URL`・`PUBLISH_GITEA_USERNAME`・`PUBLISH_CONFIG` は読まない。設定の file に残っていれば、未知の key の警告が出る。
- `npm publish` は、`registry` が無ければ npm 自身の設定のまま publish する（以前は npmjs を `--registry` で明示していた）。
- `github repo create`・`github release create` の `url` は gh が返した物だけ（無ければ `null`。`https://github.com/<repo>` を組まない）。

## 構成

```
.manifest/toolconfig.json   定義（正本。入れ子）。上の要素 4 つ（macbuild・npm・github・gitea）、呼べる葉 8 つの spec
tools/<名前>/src/main.ts    citty の定義（`export const main`。定義だけで、読み込んでも走らない）
tools/<名前>/src/module.ts  module（`export { main }` と `export async function run(rawArgs)`。`runCommand` で呼び、終了 code を返す。使い方の誤りは 2。`-h` を値として紛れさせない）
tools/<名前>/src/cli.ts     入口（`run(process.argv.slice(2))` の結果を終了 code にするだけ）
tools/<名前>/src/command/   サブコマンド 1 つ 1 file（群は dir の index.ts。群は run を持たない）
tools/<名前>/src/lib/       中身（伏せ・lock・codesign・gh・Gitea の REST・npm の呼び出し・到達の確かめ・引数の検査）
tools/<名前>/dist/cli.mjs   build の結果（citty も入れた 1 file。shebang つき・実行の権限つき）← manifest の entry が指す
tools/<名前>/dist/main.mjs  build の結果（citty も入れた 1 file。読み込んでも走らない。shebang なし）← manifest の module が指す
scripts/build.mjs          src/cli.ts を dist/cli.mjs に、src/module.ts を dist/main.mjs にまとめる（esbuild）
tests/                      node:test の test と、Tauri の最小の雛形（tests/fixtures/tauri-min）
```

## command

呼ぶ名前は葉の並び。argv は上の要素の `spec.subcommand`（`macbuild` には無い）とサブコマンドの名前を頭に、options、`--`、positionals の順。

| command（呼ぶ名前） | CLI の argv の頭 | 引数（superbash の `args`） | すること |
|---|---|---|---|
| `macbuild info` | `info` | 無し | xcodebuild・codesign・sccache・cargo・rustc・node・cargo-tauri の有無と版、署名の設定の有無（値は出さない）、lock の状態を JSON で出す |
| `macbuild tauri` | `tauri` | `project`（必須）、`target`、`bundles`、`debug`、`targetDir` | project の dir で `tauri build --ci` を行い、host の identity（無ければ ad-hoc）で署名させ、codesign で確かめる。conf の場所は Tauri の CLI が探す |
| `macbuild sign` | `sign` | `path`（必須）、`entitlements`、`noTimestamp` | 成果物を host の identity（無ければ ad-hoc）で署名し直し、codesign で確かめる |

すべて stdout に JSON を 1 つ出す。終了 code は 0 成功、1 build・署名・確かめの失敗、2 使い方の誤り、3 lock が取れない（`macbuild tauri` だけ）、4 host の設定の誤り・道具の不足。

spec の全体は `macbuild help`、1 つは `macbuild help macbuild tauri`（`macbuild help tauri` でも同じ。群 `macbuild help macbuild` も引ける）で出る。help は bin の直後だけ（`<bin> help [<並び>]`）。

### superbash から呼ぶ例

```json
{ "name": "macbuild info", "args": {} }
{ "name": "macbuild tauri", "args": { "project": "/path/to/app", "bundles": "app" }, "run_in_background": true }
{ "name": "macbuild sign", "args": { "path": "/path/to/app/src-tauri/target/release/bundle/macos/Example.app" } }
```

wrapper が組む argv の例: `macbuild tauri --bundles app -- /path/to/app`。CLI は `--` の前を option、後を positional として読む（`-` で始まる値も渡せる）。

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
| `lockDir` | `MACBUILD_LOCK_DIR` | build の lock を置く dir | `~/Library/Caches/superbash-bantou` |
| `logDir` | `MACBUILD_LOG_DIR` | build の log を置く dir | `~/Library/Logs/superbash-bantou` |

- 設定の file: 既定は `~/.config/superbash-bantou/config.json`。`MACBUILD_CONFIG` で別の path を指せる（指した file が無ければ誤り。既定の file は無くてよい）。
- file の path の値は `~/` で始めてよい。相対 path は設定の file の dir から解く（環境変数の相対 path は cwd から）。
- 未知の key は無視し、stderr に警告を出して続ける（`macbuild info` の `config.warnings` にも出る）。文字列でない値・環境変数の名前でない値・JSON でない file は誤り（終了 code 4）。
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

- `macbuild tauri` は Tauri の CLI の環境の `APPLE_SIGNING_IDENTITY` に identity（無ければ `-`）を入れ、署名は Tauri の bundler に任せる。build の後に `.app` を `codesign --verify --deep --strict` で確かめ、`codesign -dv` で署名の種類（adhoc / certificate）を読む。
- 親の環境の生の `APPLE_*`（`APPLE_SIGNING_IDENTITY`・`APPLE_CERTIFICATE*`・公証の `APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`・`APPLE_API_*` など）と `TAURI_SIGNING_*`（と Tauri v1 の `TAURI_PRIVATE_KEY`・`TAURI_KEY_PASSWORD`）は、**どの子 process にも渡さない**（Tauri の CLI・codesign・`macbuild info` の版の照会）。設定が名前で指す元の変数（password・公証の資格）も渡さない。署名の扱いは host の設定だけで決め、証明書の keychain への import はさせない。
- 公証: identity の時だけ、`apple*Env` で名前を指した環境変数の値を、Tauri の期待する名前（`APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`・`APPLE_API_KEY`・`APPLE_API_ISSUER`・`APPLE_API_KEY_PATH`・`APPLE_PROVIDER_SHORT_NAME`）で Tauri に渡す。指した変数が無ければ終了 code 4。ad-hoc の時は公証しない（渡さず、変数が無くても誤りにしない）。
- updater の鍵は **path を** `TAURI_SIGNING_PRIVATE_KEY` に渡すだけ。macbuild は鍵の中身を読まない・写さない・出力しない（file が有るかだけ見る）。password は `updaterKeyPasswordEnv` の名前の環境変数から引いて `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に入れる（鍵の path が無い時は password も渡さない）。
- 伏せ: build の出力は行ごとに、log の file に書く前に伏せる（stderr に写す log の末尾も同じ）。`macbuild sign` の codesign の失敗の message、成果物の `verifyError` も伏せる。伏せる物は identity の文字列（`-` を除く）と、その末尾の `(XXXXXXXXXX)` の team id、伏せた identity の直後の `(XXXXXXXXXX)`、codesign の ambiguous の行で `"<identity>…"` と引用符の中に並ぶ候補の全体（identity を team id 抜きや短い前方一致の名前で設定した時に出る、候補の名前の残りと team id。`<identity-candidate>` になる）、updater の鍵の path、設定が名前で指す変数の値（4 文字以上）、keychain の path（`…/Keychains/…`・`*.keychain`・`*.keychain-db`）。`<identity>`・`<team-id>`・`<updater-key>`・`<secret>`・`<keychain>` に置き換わる。成果物の path は伏せる前の出力から、流しながら拾う（秘密の値が path の一部と一致しても path は壊れない。log の中の path は伏せる。出力の全体は memory に溜めず、「Finished … at:」の後の path の行だけを持つ）。
- `macbuild info` は署名の設定の有無だけを出す（値は出さない）。
- `macbuild sign` は元の署名の entitlements・flag（hardened runtime など）・runtime の版を引き継ぐ（`--preserve-metadata=entitlements,flags,runtime`。`entitlements` を渡せばそちらが優先）。hardened runtime を無条件には付けない。identity の時は `--timestamp` を付け、`noTimestamp: true`（`--no-timestamp`）なら `--timestamp=none`（offline の署名用。ad-hoc は元から timestamp を付けない）。bundle の中の入れ子の code（frameworks・sidecar）は署名し直さない（外側だけ）。

## 排他（macbuild tauri）

- build は host で同時に 1 本。`lockDir` の下の file `macbuild-tauri.lock` に、kernel の排他 lock を取る（open(2) の `O_EXLOCK`。flock と同じ lock）。
- **取れない時は待たない**。stderr に持ち主（pid・開始時刻・project）を出し、stdout に `{"ok": false, "error": "lock-busy", "lock": {...}}`、終了 code 3 で終わる。後で呼び直す。
- lock は macbuild の process に付き、build が成功しても失敗しても、signal でも、SIGKILL（superbash の時間切れなど）で止められても、process が終われば kernel が外す。古い lock を見分けて外す処理は無い（その競合も、pid の使い回しで古い lock が生きて見える事も起きない）。
- lock の file の中身（pid・開始時刻・project）は持ち主の表示のためだけ。file は消さない。
- lock の状態は `macbuild info` の `lock` で見られる。

## 公開操作（npm・github・gitea）

`tools/publish/`（CLI は `publish`）。npm の package の公開と、GitHub・Gitea の repo・release の作成。**実際に公開・作成される**ので、使う前に対象を確かめる（npm は `dryRun` がある）。PR の作成・merge・CI の状態を見る command は無い。任意の command 文字列は受けず、gh や Gitea の API を丸ごと通す事もしない。子 process は引数の配列で起動し、shell を通さない。

上の要素は `npm`・`github`・`gitea`（各々 `spec.subcommand` に同じ語。bin の直後の語）。呼ぶ名前は葉の並び:

| command（呼ぶ名前） | 引数（superbash の `args`） | すること |
|---|---|---|
| `npm publish` | `target`（必須。tarball か dir）、`registry`、`tag`、`access`（public・restricted）、`dryRun` | `npm publish <target> [--registry <registry>] --json`。`registry` が無ければ npm 自身の設定のまま |
| `github repo create` | `repo`（必須。owner/name）、`visibility`（public・private・internal。既定 private）、`description` | host の gh で `gh repo create` |
| `github release create` | `repo`・`tag`（必須）、`title`（既定は tag）、`notesFile`、`target`、`draft`、`prerelease`、`assets`（`,` 区切りの file の path） | host の gh で `gh release create`（asset を添付） |
| `gitea repo create` | `url`（Gitea の URL）、`repo`（必須）、`visibility`（public・private。既定 private）、`description` | Gitea の REST API。token の持ち主（`GET /api/v1/user` の login）が owner と同じなら `POST /api/v1/user/repos`、違えば `/api/v1/orgs/<owner>/repos` |
| `gitea release create` | `url`（Gitea の URL）に加えて GitHub の release と同じ | `POST /api/v1/repos/<owner>/<name>/releases` の後、asset ごとに `.../releases/<id>/assets`（multipart）。API は node の fetch で呼ぶ（curl は使わない） |

`gitea` の 2 つの `url`（`--url`）は必須で、Gitea の URL（http・https。API は `<URL>/api/v1`。認証情報・query・fragment を入れない）。無い・不正なら使い方の誤り（終了 code 2）。**注意**: `http` も受けるが、token を `Authorization` で送るので、http の宛先には token が平文で送られる（本番は https を使う）。API の redirect は追わない。

argv は `<上の要素の語> <サブコマンド…> <options> -- <positionals>`（例: `publish github release create --title v1.0.0 --draft -- example/app v1.0.0`）。help は bin の直後だけ: `publish help`（全体）、`publish help github release create`（葉）、`publish help github`（群）。群は呼べず、`publish github` のように群で止まると使い方の誤り。

すべて stdout に JSON を 1 つ出す（作った repo・release の `url`、公開した `name`・`version`・`registry` など）。終了 code は 0 成功、1 失敗（失敗の message は秘密を伏せてから返す）、2 使い方の誤り、4 host の設定の誤り・道具（npm・gh・git）や認証の不足。

```json
{ "name": "npm publish", "args": { "target": "/path/to/pkg-1.0.0.tgz", "tag": "next", "dryRun": true } }
{ "name": "npm publish", "args": { "target": "/path/to/pkg-1.0.0.tgz", "registry": "https://registry.example.invalid/" } }
{ "name": "github release create", "args": { "repo": "example/app", "tag": "v1.0.0", "notesFile": "/path/to/notes.md", "assets": "/path/to/app.zip,/path/to/app.dmg" } }
{ "name": "gitea repo create", "args": { "url": "https://git.example.invalid", "repo": "example-org/app", "visibility": "private" } }
```

### 宛先

command と toolset の host の設定は、ネットワークの宛先・アドレスを持たない。

- `npm publish` の registry は `registry`（`--registry`）で受ける。http・https の URL で、認証情報・query・fragment は誤り。省略時は `--registry` も scope の registry も渡さず、npm 自身の設定（host の npm の設定）に任せる（出力の `registry` は `null`）。`registry` を付けた時だけ、package の `publishConfig.registry` が違えば publish せず終了 code 1。
- Gitea の URL は `url`（`--url`）で受ける。host の設定の file・環境変数には持たない。
- URL は、gh や API が返した物だけを出す（`github …` の `url` は gh の出力に無ければ `null`。`gitea …` の `url` は API の `html_url` が無ければ `null`）。自分で組まない。

### 認証

- npm: host の npm の設定（`npm login`）をそのまま使う。wrapper は token を読まない・渡さない。`registry` を付けた時は scope の package に `--@scope:registry=` も付ける。
- GitHub: host の gh の認証をそのまま使う。
- Gitea: token は実行時に `git credential fill`（stdin に protocol・host を `url` から）で取り出して API の `Authorization` に渡す。host の git の credential helper に token が入っている必要がある。token は stdout・stderr・error message に出さない（`src/lib/secrets.ts` が値と形で伏せる）。API の redirect は追わない。
- 伏せ: 環境の名前が token・password・secret・credential・auth らしい変数の値、npm・GitHub の token の形、`_authToken=`、`Authorization:`、URL の `user:pass@`、取り出した Gitea の token。

### registry に届く事の確かめ・長い呼び出し（npm publish）

- launchd 常駐の superbash から動く npm は、macOS のローカルネットワーク制限で社内の registry に届かない事がある（`EHOSTUNREACH`）。npm は 3 回試して約 70 秒かかり、dry-run では失敗を握りつぶして終了 0 を返す。つまり **dry-run の成功は、registry に届く事も認証も保証しない**。
- 手当て: `npm publish` は、publish（dry-run 含む）の前に、`registry` を付けた時、または scope も `publishConfig.registry` も無い package の時は、その registry（`registry`、無ければ npm の既定の registry）に対して `npm ping [--registry <url>] --fetch-retries=0 --fetch-timeout=10000` で届くかを確かめる。`registry` が無く、package が scope 付きか `publishConfig.registry` を持つ時は、`npm ping` が scope や publishConfig の registry を見ず別の registry を叩いて誤判定するので、ping を省いて publish 自身に任せる（出力の `pingSkipped` が `true`。stderr にも出る）。届かなければ publish を走らせず、すぐ `{ "ok": false, "error": ... }`（届かない事と、ローカルネットワーク制限の可能性）を返して終了 code 1。届く時は今のまま publish する（publish 本体の retry 設定は変えない）。この確かめが保証するのは「届く事」だけで、認証は保証しない。
- Claude Code は http の MCP の 1 回の呼び出しを既定 60 秒で打ち切る（mcp の設定の `timeout` で延ばせる。進み具合の通知では延びない）。長くなりうる command は `run_in_background: true` で呼ぶ。
- 打ち切られても command は最後まで走り続ける。「時間切れ」と出ても公開済みの事があるので、**本番 publish を呼び直す前に、結果（registry に出たか）を確かめる**（二重の publish を避ける）。

### host の設定（公開操作）

公開操作に host の設定は無い（設定の file・環境変数を読まない）。認証は host の npm・gh・git の credential helper に任せる。

### 既知の制限（公開操作）

- `assets` の path に `,` と `#` は使えない（区切りと gh の label の記法のため）。
- Gitea の asset は file 全体を memory に読んで送る。
- tarball の `publishConfig.registry` の確かめは `tar` が PATH に有る時だけ（無ければ名前・版も空になる）。
- Gitea の asset の添付が途中で失敗した時、release は作られたまま残る（`url`・`uploaded`・`failedAsset` を返す）。
- Gitea の token は、URL の protocol と host（port 付き）だけで `git credential fill` を引く（path は渡さない）。`credential.useHttpPath` で path ごとに token を持つ構成では取れない。
- Gitea の repo の owner が token の持ち主と違えば organization の repo として作る（`GET /user` が取れない時は失敗として返す）。

## sandbox（superbash 0.4.0 の `--sandbox`）

superbash 0.4.0 は `--sandbox` で command を閉じた環境で動かせる。各 tool の方針は manifest の `tools.<名前>.sandbox = { "write": [path...], "network": true|false }` に書く。path は `~`・`$TMPDIR`・`.` で始められる。宛先・アドレスは書かない（この toolset の方針と同じ。宛先は呼ぶ時の引数で受ける）。`sandbox` の項が無い tool の既定は、network なし・write は superbash の置き場と一時の dir だけ。

| tool（command） | write | network | 理由 |
|---|---|---|---|
| `macbuild`（`macbuild info`・`tauri`・`sign`） | `~`・`$TMPDIR` | true | project の build が home の下に書く。crate の取得 |
| `publish`（`npm`・`github`・`gitea`） | `~/.npm`・`~/.config/gh`・`$TMPDIR` | true | npm の cache、gh の設定の dir、一時の dir。公開先への通信 |

`--sandbox` を使わない時は、この項は効かない（読まれるだけ）。

## MCP の設定（host の側）

superbash の MCP の設定の 1 件として書く。toolset は npm に渡せる物なら何でもよい: GitHub の repo（`github:agent-hand/superbash-bantou`。既定の branch）・package の名前@版・手元の dir（env の値は架空）:

```json
{
  "mcpServers": {
    "macbuild": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "--package=superbash@0.2.0", "--", "superbash", "github:agent-hand/superbash-bantou"],
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

`--allow-cmd 'macbuild info,macbuild tauri'` のように、並びの名前（葉）か群の名前（`macbuild`・`github`・`github repo` など。その下の全部）で、出す command を絞れる（並びは空白を含むので quote する。公開操作を出さないなら `npm`・`github`・`gitea` を含めない）。古い名前（`macbuild-info`・`npm-publish` など）は知らない名前として警告だけが出て、その command 無しで起動する。

toolset を変えたら `package.json` の `version` を上げる。superbash は起動のたびに package を生成し直すが、npx は生成した tarball の path と名前@版が同じだと、前に展開した写し（npm の cache の `_npx/`）を使い続ける（この Mac で確かめた）。

## 作り方（build）

command は TypeScript で書き、配る前に `tools/<名前>/dist/cli.mjs` の 1 file にまとめる（superbash の toolset の作法 6.5 (c)）。node は `node_modules` の下の TS を動かせず、node 18 は型を除けないので、entry は build の結果の JS を指す。

```
npm ci
npm run build    # tools/<macbuild・publish>/dist/cli.mjs と dist/main.mjs を作る
npm test
```

- まとめる道具は esbuild、定義と引数の読みは citty。どちらも `devDependencies`（superbash は `dependencies` だけを生成した package に写す）。citty は `dist/cli.mjs` と `dist/main.mjs` の中にそれぞれ入っているので、実行の時は何も取りに行かない。`dist/` は node 18 で動く形（`target: node18`、ESM）。
- **`dist/` は repo に commit する**（git の repo の名前で指す使い方があるため）。source（`src/`）を変えたら `npm run build` をして `dist/` も commit する。CI（`.github/workflows/ci.yml`）は build し直して `git diff --exit-code` で差分が無い事を確かめる。
- 構成は上の「構成」。manifest（`.manifest/toolconfig.json`）が正本で、citty の定義（名前・説明・引数）は手で同じに書き、`tests/citty.test.js` が `src/main.ts` を読み込んで `subCommands` を辿り、manifest と照合する（作法 6.2 (a)）。
- 入口（`run`。`module.ts`）は citty の `runMain` を使わない（引数のどこかに `-h` があると usage を出して終了 0 で抜け、誤りの終了 code が全部 1 になるため）。`run` が argv を厳しく検査し（知らない option・2 度の option・値の無い option・多すぎる／足りない positional は終了 2。options の後に `--`、その後が positional）、`runCommand` に渡す。
- test は、`src/lib/*.ts` を node の型の除去で直に読み込む（**node 22.18 以上**で test を回す）。command の実行の test は `dist/cli.mjs` を子 process で起動する。`tests/module.test.js` は `dist/main.mjs` を `import()` して `run` の返す数を確かめ、`cli.mjs` と同じ結果になる事も見る。配る物（`dist/cli.mjs`）の動く node は 18 以上。

## 前提

- macOS、node 18 以上、`codesign`（OS に有る）。
- Tauri の build には Rust の toolchain（`cargo`）と、project の `node_modules/.bin/tauri`（`@tauri-apps/cli`）か PATH の `cargo-tauri`。Tauri の CLI は project の dir から上へ `node_modules/.bin/tauri` を探す。
- Xcode は要らない（Command Line Tools で Tauri の `.app` は作れる）。`xcodebuild` の有無は `macbuild info` で見られる。

## 既知の制限

- `-` で始まる positional: superbash 0.2.0 以上の wrapper は positional の前に `--` を入れるので渡せる。`--` を入れない呼び方（手で `macbuild tauri -app` と打つなど）では、`-` で始まる値は option と読まれて使い方の誤り（終了 code 2）になる。
- 伏せは文字列の一致による。4 文字未満の秘密の値は伏せない（log 全体を壊すため）。

## test

```
npm test
```

node:test で、manifest（入れ子）と citty の定義の照合（`tests/citty.test.js`）・help の並びの整合、argv の組み立て（superbash の入れ子の規則と `--` → CLI）、宛先を持たない事（設定 key・環境変数・URL の定数・URL を組む code が `tools/` と manifest に無い事）、設定の読み込み（環境変数と file の優先・未知の key の警告）、排他の振る舞い（SIGKILL の後に取れる事を含む）、子の環境から秘密の変数を外す事と出力・log での伏せ（偽の identity と偽の `APPLE_*` の値で）、偽の Tauri の CLI と ad-hoc の codesign による build・署名の流れを確かめる。偽の identity では本物の codesign を呼ばない（keychain を引かせない）。一時の dir は `os.tmpdir()`（`TMPDIR`）の下に作って消す。

公開操作の test（`tests/publish.test.js`）は、偽の npm・gh（PATH の先に置く stub。argv を記録する）、`127.0.0.1` に立てる偽の Gitea API server、偽の HOME の使い捨ての git 設定（偽の credential helper）で、組み立てた argv・API の要求（asset の multipart を含む）・出力・秘密の伏せを確かめる。実際の npmjs・GitHub・Gitea には何も書かない。test は HOME を偽にし、npm は使い捨ての cache・prefix・userconfig（`NPM_CONFIG_CACHE`・`NPM_CONFIG_PREFIX`・`NPM_CONFIG_USERCONFIG`）で回すと、host の npm の設定に触れない。

`tests/fixtures/tauri-min` は画面 1 つの Tauri の最小の雛形（実際の build の確かめ用。test からは使わない）。

## License

MIT
