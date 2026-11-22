// node_modules/citty/dist/_chunks/libs/scule.mjs
var NUMBER_CHAR_RE = /\d/;
var STR_SPLITTERS = [
  "-",
  "_",
  "/",
  "."
];
function isUppercase(char = "") {
  if (NUMBER_CHAR_RE.test(char)) return;
  return char !== char.toLowerCase();
}
function splitByCase(str, separators) {
  const splitters = separators ?? STR_SPLITTERS;
  const parts = [];
  if (!str || typeof str !== "string") return parts;
  let buff = "";
  let previousUpper;
  let previousSplitter;
  for (const char of str) {
    const isSplitter = splitters.includes(char);
    if (isSplitter === true) {
      parts.push(buff);
      buff = "";
      previousUpper = void 0;
      continue;
    }
    const isUpper = isUppercase(char);
    if (previousSplitter === false) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buff);
        buff = char;
        previousUpper = isUpper;
        continue;
      }
      if (previousUpper === true && isUpper === false && buff.length > 1) {
        const lastChar = buff.at(-1);
        parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
        buff = lastChar + char;
        previousUpper = isUpper;
        continue;
      }
    }
    buff += char;
    previousUpper = isUpper;
    previousSplitter = isSplitter;
  }
  parts.push(buff);
  return parts;
}
function upperFirst(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : "";
}
function lowerFirst(str) {
  return str ? str[0].toLowerCase() + str.slice(1) : "";
}
function pascalCase(str, opts) {
  return str ? (Array.isArray(str) ? str : splitByCase(str)).map((p) => upperFirst(opts?.normalize ? p.toLowerCase() : p)).join("") : "";
}
function camelCase(str, opts) {
  return lowerFirst(pascalCase(str || "", opts));
}
function kebabCase(str, joiner) {
  return str ? (Array.isArray(str) ? str : splitByCase(str)).map((p) => p.toLowerCase()).join(joiner ?? "-") : "";
}

// node_modules/citty/dist/index.mjs
import { parseArgs as parseArgs$1 } from "node:util";
function toArray(val) {
  if (Array.isArray(val)) return val;
  return val === void 0 ? [] : [val];
}
function resolveValue(input) {
  return typeof input === "function" ? input() : input;
}
var CLIError = class extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "CLIError";
    this.code = code;
  }
};
function parseRawArgs(args6 = [], opts = {}) {
  const booleans = new Set(opts.boolean || []);
  const strings = new Set(opts.string || []);
  const aliasMap = opts.alias || {};
  const defaults = opts.default || {};
  const aliasToMain = /* @__PURE__ */ new Map();
  const mainToAliases = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(aliasMap)) {
    const targets = value;
    for (const target of targets) {
      aliasToMain.set(key, target);
      if (!mainToAliases.has(target)) mainToAliases.set(target, []);
      mainToAliases.get(target).push(key);
      aliasToMain.set(target, key);
      if (!mainToAliases.has(key)) mainToAliases.set(key, []);
      mainToAliases.get(key).push(target);
    }
  }
  const options = {};
  function getType(name) {
    if (booleans.has(name)) return "boolean";
    const aliases = mainToAliases.get(name) || [];
    for (const alias of aliases) if (booleans.has(alias)) return "boolean";
    return "string";
  }
  function isStringType(name) {
    if (strings.has(name)) return true;
    const aliases = mainToAliases.get(name) || [];
    for (const alias of aliases) if (strings.has(alias)) return true;
    return false;
  }
  const allOptions = /* @__PURE__ */ new Set([
    ...booleans,
    ...strings,
    ...Object.keys(aliasMap),
    ...Object.values(aliasMap).flat(),
    ...Object.keys(defaults)
  ]);
  for (const name of allOptions) if (!options[name]) options[name] = {
    type: getType(name),
    default: defaults[name]
  };
  for (const [alias, main2] of aliasToMain.entries()) if (alias.length === 1 && options[main2] && !options[main2].short) options[main2].short = alias;
  const processedArgs = [];
  const negatedFlags = {};
  for (let i = 0; i < args6.length; i++) {
    const arg = args6[i];
    if (arg === "--") {
      processedArgs.push(...args6.slice(i));
      break;
    }
    if (arg.startsWith("--no-")) {
      const flagName = arg.slice(5);
      negatedFlags[flagName] = true;
      continue;
    }
    processedArgs.push(arg);
  }
  let parsed;
  try {
    parsed = parseArgs$1({
      args: processedArgs,
      options: Object.keys(options).length > 0 ? options : void 0,
      allowPositionals: true,
      strict: false
    });
  } catch {
    parsed = {
      values: {},
      positionals: processedArgs
    };
  }
  const out = { _: [] };
  out._ = parsed.positionals;
  for (const [key, value] of Object.entries(parsed.values)) {
    let coerced = value;
    if (getType(key) === "boolean" && typeof value === "string") coerced = value !== "false";
    else if (isStringType(key) && typeof value === "boolean") coerced = "";
    out[key] = coerced;
  }
  for (const [name] of Object.entries(negatedFlags)) {
    out[name] = false;
    const mainName = aliasToMain.get(name);
    if (mainName) out[mainName] = false;
    const aliases = mainToAliases.get(name);
    if (aliases) for (const alias of aliases) out[alias] = false;
  }
  for (const [alias, main2] of aliasToMain.entries()) {
    if (out[alias] !== void 0 && out[main2] === void 0) out[main2] = out[alias];
    if (out[main2] !== void 0 && out[alias] === void 0) out[alias] = out[main2];
    if (out[alias] !== out[main2] && defaults[main2] === out[main2]) out[main2] = out[alias];
  }
  return out;
}
var noColor = /* @__PURE__ */ (() => {
  const env = globalThis.process?.env ?? {};
  return env.NO_COLOR === "1" || env.TERM === "dumb" || env.TEST || env.CI;
})();
var _c = (c, r = 39) => (t) => noColor ? t : `\x1B[${c}m${t}\x1B[${r}m`;
var cyan = /* @__PURE__ */ _c(36);
function parseArgs(rawArgs, argsDef) {
  const parseOptions = {
    boolean: [],
    string: [],
    alias: {},
    default: {}
  };
  const args6 = resolveArgs(argsDef);
  for (const arg of args6) {
    if (arg.type === "positional") continue;
    if (arg.type === "string" || arg.type === "enum") parseOptions.string.push(arg.name);
    else if (arg.type === "boolean") parseOptions.boolean.push(arg.name);
    if (arg.default !== void 0) parseOptions.default[arg.name] = arg.default;
    if (arg.alias) parseOptions.alias[arg.name] = arg.alias;
    const camelName = camelCase(arg.name);
    const kebabName = kebabCase(arg.name);
    if (camelName !== arg.name || kebabName !== arg.name) {
      const existingAliases = toArray(parseOptions.alias[arg.name] || []);
      if (camelName !== arg.name && !existingAliases.includes(camelName)) existingAliases.push(camelName);
      if (kebabName !== arg.name && !existingAliases.includes(kebabName)) existingAliases.push(kebabName);
      if (existingAliases.length > 0) parseOptions.alias[arg.name] = existingAliases;
    }
  }
  const parsed = parseRawArgs(rawArgs, parseOptions);
  const [...positionalArguments] = parsed._;
  const parsedArgsProxy = new Proxy(parsed, { get(target, prop) {
    return target[prop] ?? target[camelCase(prop)] ?? target[kebabCase(prop)];
  } });
  for (const [, arg] of args6.entries()) if (arg.type === "positional") {
    const nextPositionalArgument = positionalArguments.shift();
    if (nextPositionalArgument !== void 0) parsedArgsProxy[arg.name] = nextPositionalArgument;
    else if (arg.default === void 0 && arg.required !== false) throw new CLIError(`Missing required positional argument: ${arg.name.toUpperCase()}`, "EARG");
    else parsedArgsProxy[arg.name] = arg.default;
  } else if (arg.type === "enum") {
    const argument = parsedArgsProxy[arg.name];
    const options = arg.options || [];
    if (argument !== void 0 && options.length > 0 && !options.includes(argument)) throw new CLIError(`Invalid value for argument: ${cyan(`--${arg.name}`)} (${cyan(argument)}). Expected one of: ${options.map((o) => cyan(o)).join(", ")}.`, "EARG");
  } else if (arg.required && parsedArgsProxy[arg.name] === void 0) throw new CLIError(`Missing required argument: --${arg.name}`, "EARG");
  return parsedArgsProxy;
}
function resolveArgs(argsDef) {
  const args6 = [];
  for (const [name, argDef] of Object.entries(argsDef || {})) args6.push({
    ...argDef,
    name,
    alias: toArray(argDef.alias)
  });
  return args6;
}
async function resolvePlugins(plugins) {
  return Promise.all(plugins.map((p) => resolveValue(p)));
}
function defineCommand(def) {
  return def;
}
async function runCommand(cmd, opts) {
  const cmdArgs = await resolveValue(cmd.args || {});
  const parsedArgs = parseArgs(opts.rawArgs, cmdArgs);
  const context = {
    rawArgs: opts.rawArgs,
    args: parsedArgs,
    data: opts.data,
    cmd
  };
  const plugins = await resolvePlugins(cmd.plugins ?? []);
  let result;
  let runError;
  try {
    for (const plugin of plugins) await plugin.setup?.(context);
    if (typeof cmd.setup === "function") await cmd.setup(context);
    const subCommands = await resolveValue(cmd.subCommands);
    if (subCommands && Object.keys(subCommands).length > 0) {
      const subCommandArgIndex = findSubCommandIndex(opts.rawArgs, cmdArgs);
      const explicitName = opts.rawArgs[subCommandArgIndex];
      if (explicitName) {
        const subCommand = await _findSubCommand(subCommands, explicitName);
        if (!subCommand) throw new CLIError(`Unknown command ${cyan(explicitName)}`, "E_UNKNOWN_COMMAND");
        await runCommand(subCommand, { rawArgs: opts.rawArgs.slice(subCommandArgIndex + 1) });
      } else {
        const defaultSubCommand = await resolveValue(cmd.default);
        if (defaultSubCommand) {
          if (cmd.run) throw new CLIError(`Cannot specify both 'run' and 'default' on the same command.`, "E_DEFAULT_CONFLICT");
          const subCommand = await _findSubCommand(subCommands, defaultSubCommand);
          if (!subCommand) throw new CLIError(`Default sub command ${cyan(defaultSubCommand)} not found in subCommands.`, "E_UNKNOWN_COMMAND");
          await runCommand(subCommand, { rawArgs: opts.rawArgs });
        } else if (!cmd.run) throw new CLIError(`No command specified.`, "E_NO_COMMAND");
      }
    }
    if (typeof cmd.run === "function") result = await cmd.run(context);
  } catch (error) {
    runError = error;
  }
  const cleanupErrors = [];
  if (typeof cmd.cleanup === "function") try {
    await cmd.cleanup(context);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const plugin of [...plugins].reverse()) try {
    await plugin.cleanup?.(context);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (runError) throw runError;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1) throw new Error("Multiple cleanup errors", { cause: cleanupErrors });
  return { result };
}
async function _findSubCommand(subCommands, name) {
  if (name in subCommands) return resolveValue(subCommands[name]);
  for (const sub of Object.values(subCommands)) {
    const resolved = await resolveValue(sub);
    const meta = await resolveValue(resolved?.meta);
    if (meta?.alias) {
      if (toArray(meta.alias).includes(name)) return resolved;
    }
  }
}
function findSubCommandIndex(rawArgs, argsDef) {
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--") return -1;
    if (arg.startsWith("-")) {
      if (!arg.includes("=") && _isValueFlag(arg, argsDef)) i++;
      continue;
    }
    return i;
  }
  return -1;
}
function _isValueFlag(flag, argsDef) {
  const name = flag.replace(/^-{1,2}/, "");
  const normalized = camelCase(name);
  for (const [key, def] of Object.entries(argsDef)) {
    if (def.type !== "string" && def.type !== "enum") continue;
    if (normalized === camelCase(key)) return true;
    if ((Array.isArray(def.alias) ? def.alias : def.alias ? [def.alias] : []).includes(name)) return true;
  }
  return false;
}

// tools/publish/src/lib/errors.ts
var EXIT = Object.freeze({
  OK: 0,
  FAIL: 1,
  // publish・作成の失敗
  USAGE: 2,
  // 使い方の誤り
  ENV: 4
  // host の設定の誤り・道具や認証の不足
});
var UsageError = class extends Error {
  get exitCode() {
    return EXIT.USAGE;
  }
};
var EnvError = class extends Error {
  get exitCode() {
    return EXIT.ENV;
  }
};
var FailError = class extends Error {
  get exitCode() {
    return EXIT.FAIL;
  }
};

// tools/publish/src/lib/argv.ts
var isNegated = (def) => def.type === "boolean" && def.default === true;
var kebab = (key) => key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
var manifestKey = (key, def) => isNegated(def) ? "no" + key[0].toUpperCase() + key.slice(1) : key;
function normalizeArgv(args6, rest) {
  const flags = /* @__PURE__ */ new Map();
  const positionals = [];
  for (const [key, def] of Object.entries(args6 ?? {})) {
    if (def.type === "positional") {
      positionals.push({ name: key, required: def.required === true });
    } else {
      const flag = isNegated(def) ? `--no-${kebab(key)}` : `--${kebab(key)}`;
      flags.set(flag, { key, boolean: def.type === "boolean" });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  let i = 0;
  for (; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === "--") {
      i++;
      break;
    }
    if (!tok.startsWith("-") || tok === "-") break;
    const opt = flags.get(tok);
    if (!opt) throw new UsageError(`\u672A\u77E5\u306E option: ${tok}`);
    if (seen.has(opt.key)) throw new UsageError(`option \u304C 2 \u5EA6\u3042\u308B: ${tok}`);
    seen.add(opt.key);
    if (opt.boolean) {
      out.push(tok);
    } else {
      if (i + 1 >= rest.length) throw new UsageError(`${tok} \u306B\u5024\u304C\u7121\u3044`);
      out.push(`${tok}=${rest[++i]}`);
    }
  }
  const pos = rest.slice(i);
  if (pos.length > positionals.length) {
    throw new UsageError(`\u5F15\u6570\u304C\u591A\u3044: ${pos.slice(positionals.length).join(" ")}`);
  }
  positionals.forEach((p, idx) => {
    if (idx >= pos.length && p.required) throw new UsageError(`\u5FC5\u9808\u306E\u5F15\u6570\u304C\u7121\u3044: <${p.name}>`);
  });
  return [...out, "--", ...pos];
}
function findLeaf(main2, argv, helpHint) {
  let node = main2;
  let i = 0;
  while (node.subCommands) {
    const word = argv[i];
    const next = word === void 0 || word === "help" ? void 0 : node.subCommands[word];
    if (!next || !Object.prototype.hasOwnProperty.call(node.subCommands, word)) {
      throw new UsageError(`\u672A\u77E5\u306E\u526F command: ${argv.slice(0, 3).join(" ")}\uFF08${helpHint}\uFF09`);
    }
    node = next;
    i++;
  }
  return { names: argv.slice(0, i), cmd: node, rest: argv.slice(i) };
}
function valuesOf(defs, args6) {
  const values = {};
  for (const [key, def] of Object.entries(defs ?? {})) {
    const k = manifestKey(key, def);
    if (def.type === "boolean") {
      values[k] = isNegated(def) ? args6[key] === false : Boolean(args6[key]);
    } else if (args6[key] !== void 0) {
      values[k] = args6[key];
    }
  }
  return values;
}

// tools/publish/src/lib/secrets.ts
var MIN_SECRET_LENGTH = 4;
var MIN_ENV_SECRET_LENGTH = 8;
var PLAIN_VALUE_RE = /^(true|false|null|undefined|\d+)$/i;
var SECRET_NAME_RE = /(TOKEN|PASSWORD|PASSWD|SECRET|CREDENTIAL|AUTH)/i;
var PATTERNS = [
  [/(_authToken|_auth|_password)(\s*=\s*)\S+/gi, "$1$2<secret>"],
  [/\bnpm_[A-Za-z0-9]{20,}/g, "<secret>"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "<secret>"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "<secret>"],
  [/(authorization\s*[:=]\s*)(bearer|token|basic)\s+\S+/gi, "$1$2 <secret>"],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, "$1<credentials>@"]
];
function envSecrets(env = process.env) {
  const out = [];
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_NAME_RE.test(k) && typeof v === "string" && v.length >= MIN_ENV_SECRET_LENGTH && !PLAIN_VALUE_RE.test(v)) out.push(v);
  }
  return out;
}
function makeRedactor(values = []) {
  const set = /* @__PURE__ */ new Set();
  const add = (v) => {
    if (typeof v === "string" && v.length >= MIN_SECRET_LENGTH) set.add(v);
  };
  values.forEach(add);
  const redact2 = (text) => {
    let s = String(text);
    for (const v of [...set].sort((a, b) => b.length - a.length)) s = s.split(v).join("<secret>");
    for (const [re, to] of PATTERNS) s = s.replace(re, to);
    return s;
  };
  const redactDeep2 = (value) => {
    if (typeof value === "string") return redact2(value);
    if (Array.isArray(value)) return value.map(redactDeep2);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep2(v)]));
    return value;
  };
  return { add, redact: redact2, redactDeep: redactDeep2 };
}

// tools/publish/src/lib/runtime.ts
var redactor = makeRedactor(envSecrets(process.env));
var { redact, redactDeep, add: addSecret } = redactor;
var stderr = { write: (s) => process.stderr.write(redact(s)) };
function writeJson(value, stream = process.stdout) {
  stream.write(JSON.stringify(redactDeep(value), null, 2) + "\n");
}
async function runLeaf(work) {
  const ctx = { env: process.env, cwd: process.cwd(), stderr, redact, addSecret };
  const { exitCode, result } = await work(ctx);
  if (!result.ok) stderr.write(`publish: ${result.error}
`);
  writeJson(result);
  process.exitCode = exitCode ?? EXIT.OK;
}

// tools/publish/src/lib/gitea.ts
import fs3 from "node:fs";
import path3 from "node:path";

// tools/publish/src/lib/common.ts
import fs from "node:fs";
import path from "node:path";
var REPO_RE = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)$/;
var TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._\/+-]*$/;
var TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._\/+-]*$/;
function normalizeUrl(value, where) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new UsageError(`${where} \u306F URL \u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UsageError(`${where} \u306F http \u304B https \u306E URL \u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044`);
  if (u.username || u.password) throw new UsageError(`${where} \u306B\u8A8D\u8A3C\u60C5\u5831\uFF08user:pass@\uFF09\u3092\u5165\u308C\u3066\u306F\u306A\u3089\u306A\u3044`);
  if (u.search || u.hash) throw new UsageError(`${where} \u306B query\u30FBfragment \u3092\u5165\u308C\u3066\u306F\u306A\u3089\u306A\u3044`);
  return u;
}
function parseRepo(repo3) {
  const m = repo3.match(REPO_RE);
  if (!m || m[2] === "." || m[2] === ".." || m[2].endsWith(".git")) throw new UsageError(`repo \u306F owner/name \u306E\u5F62: ${repo3}`);
  return { owner: m[1], name: m[2], full: `${m[1]}/${m[2]}` };
}
function checkTag(tag) {
  if (!TAG_RE.test(tag)) throw new UsageError(`tag \u306E\u5F62\u304C\u4E0D\u6B63: ${tag}`);
  return tag;
}
function checkTarget(target) {
  if (target !== void 0 && !TARGET_RE.test(target)) throw new UsageError(`target\uFF08branch \u304B commit\uFF09\u306E\u5F62\u304C\u4E0D\u6B63: ${target}`);
  return target;
}
function checkVisibility(value, allowed) {
  const v = value === void 0 ? "private" : value;
  if (!allowed.includes(v)) throw new UsageError(`visibility \u306F ${allowed.join(" \u304B ")}: ${v}`);
  return v;
}
function checkDescription(value) {
  if (value !== void 0 && /[\0]/.test(value)) throw new UsageError("description \u306B NUL \u306F\u4F7F\u3048\u306A\u3044");
  return value;
}
function readNotes(notesFile, cwd) {
  if (notesFile === void 0) return null;
  const abs = path.resolve(cwd, notesFile);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    throw new UsageError(`notes \u306E file \u304C\u7121\u3044: ${abs}`);
  }
  if (!st.isFile()) throw new UsageError(`notes \u306F file \u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044: ${abs}`);
  return { abs, text: fs.readFileSync(abs, "utf8") };
}
function resolveAssets(assets, cwd) {
  if (assets === void 0 || assets === "") return [];
  const out = [];
  for (const raw of assets.split(",")) {
    const p = raw.trim();
    if (p === "") continue;
    const abs = path.resolve(cwd, p);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      throw new UsageError(`asset \u304C\u7121\u3044: ${abs}`);
    }
    if (!st.isFile()) throw new UsageError(`asset \u306F file \u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044: ${abs}`);
    if (abs.includes("#")) throw new UsageError(`asset \u306E path \u306B # \u306F\u4F7F\u3048\u306A\u3044\uFF08gh \u306E label \u306E\u533A\u5207\u308A\u3068\u6DF7\u3056\u308B\uFF09: ${abs}`);
    out.push(abs);
  }
  return out;
}

// tools/publish/src/lib/proc.ts
import { spawn } from "node:child_process";
import fs2 from "node:fs";
import path2 from "node:path";
function isExecutableFile(p) {
  try {
    if (!fs2.statSync(p).isFile()) return false;
    fs2.accessSync(p, fs2.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function which(cmd, env = process.env) {
  for (const dir of (env.PATH || "").split(path2.delimiter)) {
    if (!dir) continue;
    const p = path2.join(dir, cmd);
    if (isExecutableFile(p)) return p;
  }
  return null;
}
var MAX_OUTPUT = 4 * 1024 * 1024;
function run(cmd, args6, { cwd, env, input, timeout = 9 * 6e4 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args6, { cwd, env, stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: "", stderr: "", error, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr2 = "";
    let timedOut = false;
    const take = (cur, chunk) => cur.length >= MAX_OUTPUT ? cur : (cur + chunk).slice(0, MAX_OUTPUT);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => stdout = take(stdout, c));
    child.stderr.on("data", (c) => stderr2 = take(stderr2, c));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);
    if (input !== void 0) {
      child.stdin.on("error", () => {
      });
      child.stdin.end(input);
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr: stderr2, error, timedOut });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr: stderr2, error: null, timedOut });
    });
  });
}
function firstLines(text, n = 5) {
  return String(text || "").split("\n").map((s) => s.trim()).filter((s) => s !== "").slice(0, n).join("\n").slice(0, 1e3);
}

// tools/publish/src/lib/gitea.ts
var REQUEST_TIMEOUT_MS = 12e4;
function giteaTarget(values) {
  if (values.url === void 0 || values.url === "") throw new UsageError("--url\uFF08Gitea \u306E URL\uFF09\u304C\u8981\u308B");
  const u = normalizeUrl(values.url, "--url");
  return { baseUrl: (u.origin + u.pathname).replace(/\/+$/, ""), host: u.host, protocol: u.protocol.slice(0, -1) };
}
async function fetchToken(cfg, ctx) {
  const git = which("git", ctx.env);
  if (!git) throw new EnvError("git \u304C PATH \u306B\u7121\u3044");
  const input = `protocol=${cfg.protocol}
host=${cfg.host}

`;
  const env = { ...ctx.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  const r = await run(git, ["credential", "fill"], { env, input, timeout: 3e4 });
  const m = r.stdout.match(/^password=(.*)$/m);
  if (r.status !== 0 || !m || m[1] === "") {
    throw new EnvError(`git credential fill \u3067 ${cfg.host} \u306E token \u304C\u53D6\u308C\u306A\u3044`);
  }
  ctx.addSecret(m[1]);
  return m[1];
}
var GiteaError = class extends Error {
};
function client(cfg, token, ctx) {
  const apiBase = `${cfg.baseUrl}/api/v1`;
  return async function api(method, apiPath, { json, form } = {}) {
    const headers = { Authorization: `token ${token}`, Accept: "application/json" };
    let body;
    if (json !== void 0) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form !== void 0) {
      body = form;
    }
    let res;
    try {
      res = await fetch(apiBase + apiPath, {
        method,
        headers,
        body,
        redirect: "manual",
        // 別の host に token を持ち出さない
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (e) {
      throw new GiteaError(ctx.redact(`${method} ${apiPath}: \u63A5\u7D9A\u3067\u304D\u306A\u3044: ${e.cause && e.cause.code ? e.cause.code : e.name}`));
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
    }
    if (res.status >= 300) {
      const msg = data && typeof data.message === "string" ? data.message : text.slice(0, 200);
      const loc = res.status < 400 ? "\uFF08redirect \u306F\u8FFD\u308F\u306A\u3044\uFF09" : "";
      throw new GiteaError(ctx.redact(`${method} ${apiPath}: HTTP ${res.status}${loc} ${msg}`.trim()));
    }
    return data;
  };
}
async function prepare(cfg, ctx) {
  const token = await fetchToken(cfg, ctx);
  return { cfg, api: client(cfg, token, ctx) };
}
async function repoCreate(values, ctx) {
  const target = giteaTarget(values);
  const repo3 = parseRepo(values.repo);
  const visibility = checkVisibility(values.visibility, ["public", "private"]);
  checkDescription(values.description);
  const { api } = await prepare(target, ctx);
  const payload = { name: repo3.name, private: visibility === "private" };
  if (values.description !== void 0) payload.description = values.description;
  ctx.stderr.write(`publish: gitea repo create: ${repo3.full}\uFF08${visibility}\uFF09
`);
  try {
    const me = await api("GET", "/user");
    const own = me && typeof me.login === "string" && repo3.owner.toLowerCase() === me.login.toLowerCase();
    const apiPath = own ? "/user/repos" : `/orgs/${encodeURIComponent(repo3.owner)}/repos`;
    const data = await api("POST", apiPath, { json: payload });
    const url = data && typeof data.html_url === "string" ? ctx.redact(data.html_url) : null;
    return { exitCode: 0, result: { ok: true, repo: repo3.full, visibility, url } };
  } catch (e) {
    if (!(e instanceof GiteaError)) throw e;
    return { exitCode: 1, result: { ok: false, repo: repo3.full, visibility, error: e.message } };
  }
}
async function releaseCreate(values, ctx) {
  const target = giteaTarget(values);
  const repo3 = parseRepo(values.repo);
  const tag = checkTag(values.tag);
  checkTarget(values.target);
  const notes = readNotes(values.notesFile, ctx.cwd);
  const assets = resolveAssets(values.assets, ctx.cwd);
  const { api } = await prepare(target, ctx);
  const base = { repo: repo3.full, tag, draft: values.draft, prerelease: values.prerelease, assets };
  const rel = `/repos/${encodeURIComponent(repo3.owner)}/${encodeURIComponent(repo3.name)}/releases`;
  const payload = {
    tag_name: tag,
    name: values.title !== void 0 ? values.title : tag,
    body: notes ? notes.text : "",
    draft: values.draft,
    prerelease: values.prerelease
  };
  if (values.target !== void 0) payload.target_commitish = values.target;
  ctx.stderr.write(`publish: gitea release create: ${repo3.full} ${tag}\uFF08asset ${assets.length} \u4EF6\uFF09
`);
  let release3;
  try {
    release3 = await api("POST", rel, { json: payload });
  } catch (e) {
    if (!(e instanceof GiteaError)) throw e;
    return { exitCode: 1, result: { ok: false, ...base, error: e.message } };
  }
  const url = release3 && typeof release3.html_url === "string" ? ctx.redact(release3.html_url) : null;
  const uploaded = [];
  for (const file of assets) {
    try {
      const form = new FormData();
      form.append("attachment", new Blob([fs3.readFileSync(file)]), path3.basename(file));
      await api("POST", `${rel}/${encodeURIComponent(release3.id)}/assets?name=${encodeURIComponent(path3.basename(file))}`, { form });
      uploaded.push(file);
    } catch (e) {
      if (!(e instanceof GiteaError)) throw e;
      return { exitCode: 1, result: { ok: false, ...base, url, uploaded, failedAsset: file, error: `asset \u306E\u6DFB\u4ED8\u304C\u5931\u6557\uFF08release \u306F\u4F5C\u6210\u6E08\u307F\uFF09: ${e.message}` } };
    }
  }
  return { exitCode: 0, result: { ok: true, ...base, url, uploaded } };
}

// tools/publish/src/command/gitea/repo/create.ts
var args = {
  url: { type: "string", description: "Gitea \u306E URL\uFF08\u5FC5\u9808\u3002http \u304B https\u3002API \u306F <URL>/api/v1\u3002\u8A8D\u8A3C\u60C5\u5831\u3092\u5165\u308C\u306A\u3044\uFF09" },
  visibility: { type: "string", description: "\u516C\u958B\u7BC4\u56F2\uFF08public\u30FBprivate\uFF09\u3002\u7701\u7565\u6642\u306F private" },
  description: { type: "string", description: "repo \u306E\u8AAC\u660E" },
  repo: { type: "positional", required: true, description: "owner/name" }
};
var create = defineCommand({
  meta: { name: "create", description: "Gitea \u306E REST API\uFF08/api/v1\uFF09\u3092 node \u306E fetch \u304B\u3089\u547C\u3093\u3067 repo \u3092\u4F5C\u308B\uFF08curl \u306F\u4F7F\u308F\u306A\u3044\uFF09\u3002Gitea \u306E URL \u306F --url \u3067\u53D7\u3051\u308B\uFF08\u5FC5\u9808\uFF09\u3002token \u306F\u5B9F\u884C\u6642\u306B git credential fill\uFF08protocol\u30FBhost \u306F --url \u304B\u3089\uFF09\u3067\u53D6\u308A\u51FA\u3057\u3001\u51FA\u529B\u306B\u51FA\u3055\u306A\u3044\u3002token \u306E\u6301\u3061\u4E3B\uFF08GET /user \u306E login\uFF09\u304C owner \u3068\u540C\u3058\u306A\u3089 user \u306E repo\u3001\u9055\u3048\u3070 organization \u306E repo\u3002\u516C\u958B\u7BC4\u56F2\u306E\u65E2\u5B9A\u306F private\u3002" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => repoCreate(values, ctx));
  }
});

// tools/publish/src/command/gitea/repo/index.ts
var repo = defineCommand({
  meta: { name: "repo", description: "repo \u306E\u64CD\u4F5C" },
  subCommands: { create }
});

// tools/publish/src/command/gitea/release/create.ts
var args2 = {
  url: { type: "string", description: "Gitea \u306E URL\uFF08\u5FC5\u9808\u3002http \u304B https\u3002API \u306F <URL>/api/v1\u3002\u8A8D\u8A3C\u60C5\u5831\u3092\u5165\u308C\u306A\u3044\uFF09" },
  title: { type: "string", description: "release \u306E\u984C\u3002\u7701\u7565\u6642\u306F tag" },
  notesFile: { type: "string", description: "release \u306E\u672C\u6587\u306E file \u306E path\u3002\u7701\u7565\u6642\u306F\u7A7A" },
  target: { type: "string", description: "tag \u304C\u7121\u3044\u6642\u306B\u305D\u306E tag \u3092\u4F5C\u308B branch \u304B commit\u3002\u7701\u7565\u6642\u306F repo \u306E\u65E2\u5B9A" },
  draft: { type: "boolean", description: "\u4E0B\u66F8\u304D\u306E release \u306B\u3059\u308B" },
  prerelease: { type: "boolean", description: "prerelease \u306B\u3059\u308B" },
  assets: { type: "string", description: "\u6DFB\u4ED8\u3059\u308B file \u306E path \u3092 , \u3067\u533A\u5207\u308B\uFF08\u76F8\u5BFE path \u306F cwd \u304B\u3089\u3002path \u306B , \u3068 # \u306F\u4F7F\u3048\u306A\u3044\uFF09" },
  repo: { type: "positional", required: true, description: "owner/name" },
  tag: { type: "positional", required: true, description: "release \u306E tag\uFF08- \u3067\u59CB\u3081\u306A\u3044\uFF09" }
};
var create2 = defineCommand({
  meta: { name: "create", description: "Gitea \u306E REST API\uFF08/api/v1\uFF09\u3092 node \u306E fetch \u304B\u3089\u547C\u3093\u3067 release \u3092\u4F5C\u308A\u3001asset \u3092\u6DFB\u4ED8\u3059\u308B\uFF08curl \u306F\u4F7F\u308F\u306A\u3044\uFF09\u3002Gitea \u306E URL \u306F --url \u3067\u53D7\u3051\u308B\uFF08\u5FC5\u9808\uFF09\u3002token \u306F\u5B9F\u884C\u6642\u306B git credential fill\uFF08protocol\u30FBhost \u306F --url \u304B\u3089\uFF09\u3067\u53D6\u308A\u51FA\u3057\u3001\u51FA\u529B\u306B\u51FA\u3055\u306A\u3044\u3002asset \u306E\u6DFB\u4ED8\u304C\u9014\u4E2D\u3067\u5931\u6557\u3057\u305F\u6642\u306F\u3001release \u306F\u4F5C\u6210\u6E08\u307F\u306E\u307E\u307E\u3001url\u30FBuploaded\u30FBfailedAsset \u3092\u8FD4\u3059\u3002" },
  args: args2,
  async run({ args: parsed }) {
    const values = valuesOf(args2, parsed);
    await runLeaf((ctx) => releaseCreate(values, ctx));
  }
});

// tools/publish/src/command/gitea/release/index.ts
var release = defineCommand({
  meta: { name: "release", description: "release \u306E\u64CD\u4F5C" },
  subCommands: { create: create2 }
});

// tools/publish/src/command/gitea/index.ts
var gitea = defineCommand({
  meta: { name: "gitea", description: "Gitea \u306E repo \u3068 release \u3092\u4F5C\u308B\uFF08\u5B9F\u969B\u306B\u4F5C\u3089\u308C\u308B\uFF09\u3002Gitea \u306E URL \u306F\u547C\u3076\u6642\u306E --url \u3067\u53D7\u3051\u3001token \u306F git credential fill \u3067\u5F15\u304F\u3002" },
  subCommands: { repo, release }
});

// tools/publish/src/lib/github.ts
var URL_RE = /https?:\/\/[^\s'"<>]+/;
function ghEnv(env) {
  return { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1" };
}
async function runGh(args6, ctx) {
  const gh = which("gh", ctx.env);
  if (!gh) throw new EnvError("gh \u304C PATH \u306B\u7121\u3044");
  return run(gh, args6, { env: ghEnv(ctx.env), cwd: ctx.cwd });
}
function failure(r, what, ctx) {
  const why = r.timedOut ? "\u6642\u9593\u5207\u308C" : r.error ? r.error.code || r.error.message : `gh \u304C\u7D42\u4E86 code ${r.status}`;
  const detail = firstLines(ctx.redact(r.stderr || r.stdout));
  return ctx.redact(`${what}\u304C\u5931\u6557: ${why}${detail ? "\n" + detail : ""}`);
}
function findUrl(r, ctx) {
  const m = r.stdout.match(URL_RE) || r.stderr.match(URL_RE);
  return m ? ctx.redact(m[0]) : null;
}
async function repoCreate2(values, ctx) {
  const repo3 = parseRepo(values.repo);
  const visibility = checkVisibility(values.visibility, ["public", "private", "internal"]);
  checkDescription(values.description);
  const args6 = ["repo", "create", repo3.full, `--${visibility}`];
  if (values.description !== void 0) args6.push(`--description=${values.description}`);
  ctx.stderr.write(`publish: github repo create: ${repo3.full}\uFF08${visibility}\uFF09
`);
  const r = await runGh(args6, ctx);
  if (r.error || r.status !== 0 || r.timedOut) {
    return { exitCode: 1, result: { ok: false, repo: repo3.full, visibility, error: failure(r, "repo \u306E\u4F5C\u6210", ctx) } };
  }
  const url = findUrl(r, ctx);
  return { exitCode: 0, result: { ok: true, repo: repo3.full, visibility, url } };
}
async function releaseCreate2(values, ctx) {
  const repo3 = parseRepo(values.repo);
  const tag = checkTag(values.tag);
  checkTarget(values.target);
  const notes = readNotes(values.notesFile, ctx.cwd);
  const assets = resolveAssets(values.assets, ctx.cwd);
  const title = values.title !== void 0 ? values.title : tag;
  const args6 = ["release", "create", tag, ...assets, `--repo=${repo3.full}`, `--title=${title}`];
  args6.push(notes ? `--notes-file=${notes.abs}` : "--notes=");
  if (values.target !== void 0) args6.push(`--target=${values.target}`);
  if (values.draft) args6.push("--draft");
  if (values.prerelease) args6.push("--prerelease");
  ctx.stderr.write(`publish: github release create: ${repo3.full} ${tag}\uFF08asset ${assets.length} \u4EF6\uFF09
`);
  const r = await runGh(args6, ctx);
  const base = { repo: repo3.full, tag, draft: values.draft, prerelease: values.prerelease, assets };
  if (r.error || r.status !== 0 || r.timedOut) {
    return { exitCode: 1, result: { ok: false, ...base, error: failure(r, "release \u306E\u4F5C\u6210", ctx) } };
  }
  const url = findUrl(r, ctx);
  return { exitCode: 0, result: { ok: true, ...base, url } };
}

// tools/publish/src/command/github/repo/create.ts
var args3 = {
  visibility: { type: "string", description: "\u516C\u958B\u7BC4\u56F2\uFF08public\u30FBprivate\u30FBinternal\uFF09\u3002\u7701\u7565\u6642\u306F private" },
  description: { type: "string", description: "repo \u306E\u8AAC\u660E" },
  repo: { type: "positional", required: true, description: "owner/name" }
};
var create3 = defineCommand({
  meta: { name: "create", description: "host \u306E gh \u306E CLI\uFF08gh repo create\uFF09\u3067 GitHub \u306E repo \u3092\u4F5C\u308B\u3002\u8A8D\u8A3C\u306F host \u306E gh \u306E\u8A8D\u8A3C\u3092\u305D\u306E\u307E\u307E\u4F7F\u3046\u3002\u516C\u958B\u7BC4\u56F2\u306E\u65E2\u5B9A\u306F private\u3002" },
  args: args3,
  async run({ args: parsed }) {
    const values = valuesOf(args3, parsed);
    await runLeaf((ctx) => repoCreate2(values, ctx));
  }
});

// tools/publish/src/command/github/repo/index.ts
var repo2 = defineCommand({
  meta: { name: "repo", description: "repo \u306E\u64CD\u4F5C" },
  subCommands: { create: create3 }
});

// tools/publish/src/command/github/release/create.ts
var args4 = {
  title: { type: "string", description: "release \u306E\u984C\u3002\u7701\u7565\u6642\u306F tag" },
  notesFile: { type: "string", description: "release \u306E\u672C\u6587\u306E file \u306E path\u3002\u7701\u7565\u6642\u306F\u7A7A" },
  target: { type: "string", description: "tag \u304C\u7121\u3044\u6642\u306B\u305D\u306E tag \u3092\u4F5C\u308B branch \u304B commit\u3002\u7701\u7565\u6642\u306F repo \u306E\u65E2\u5B9A" },
  draft: { type: "boolean", description: "\u4E0B\u66F8\u304D\u306E release \u306B\u3059\u308B" },
  prerelease: { type: "boolean", description: "prerelease \u306B\u3059\u308B" },
  assets: { type: "string", description: "\u6DFB\u4ED8\u3059\u308B file \u306E path \u3092 , \u3067\u533A\u5207\u308B\uFF08\u76F8\u5BFE path \u306F cwd \u304B\u3089\u3002path \u306B , \u3068 # \u306F\u4F7F\u3048\u306A\u3044\uFF09" },
  repo: { type: "positional", required: true, description: "owner/name" },
  tag: { type: "positional", required: true, description: "release \u306E tag\uFF08- \u3067\u59CB\u3081\u306A\u3044\uFF09" }
};
var create4 = defineCommand({
  meta: { name: "create", description: "host \u306E gh \u306E CLI\uFF08gh release create\uFF09\u3067 GitHub \u306E release \u3092\u4F5C\u308B\uFF08tag\u30FB\u984C\u30FB\u672C\u6587\u306E file\u30FBtarget\u30FBdraft\u30FBprerelease\u30FBasset \u306E\u6DFB\u4ED8\uFF09\u3002\u8A8D\u8A3C\u306F host \u306E gh \u306E\u8A8D\u8A3C\u3092\u305D\u306E\u307E\u307E\u4F7F\u3046\u3002" },
  args: args4,
  async run({ args: parsed }) {
    const values = valuesOf(args4, parsed);
    await runLeaf((ctx) => releaseCreate2(values, ctx));
  }
});

// tools/publish/src/command/github/release/index.ts
var release2 = defineCommand({
  meta: { name: "release", description: "release \u306E\u64CD\u4F5C" },
  subCommands: { create: create4 }
});

// tools/publish/src/command/github/index.ts
var github = defineCommand({
  meta: { name: "github", description: "GitHub \u306E repo \u3068 release \u3092\u4F5C\u308B\uFF08\u5B9F\u969B\u306B\u4F5C\u3089\u308C\u308B\uFF09\u3002host \u306E gh \u306E\u8A8D\u8A3C\u3092\u4F7F\u3046\u3002" },
  subCommands: { repo: repo2, release: release2 }
});

// tools/publish/src/lib/manifest.ts
import fs4 from "node:fs";
import path4 from "node:path";
import { fileURLToPath } from "node:url";
var TOOL = "publish";
function findManifest() {
  let dir = path4.dirname(fileURLToPath(import.meta.url));
  for (; ; ) {
    const candidate = path4.join(dir, ".manifest", "toolconfig.json");
    if (fs4.existsSync(candidate)) return candidate;
    const parent = path4.dirname(dir);
    if (parent === dir) throw new Error(".manifest/toolconfig.json \u304C\u898B\u3064\u304B\u3089\u306A\u3044");
    dir = parent;
  }
}
function loadManifest(file = findManifest()) {
  return JSON.parse(fs4.readFileSync(file, "utf8"));
}
function toolCommands(manifest = loadManifest()) {
  return (manifest.commands || []).filter((c) => c.tool === TOOL);
}
function findElement(commands, words) {
  const ws = words.flatMap((w) => String(w).split(/\s+/)).filter((w) => w !== "");
  if (ws.length === 0) return null;
  const descend = (node, rest) => {
    for (const w of rest) {
      node = (node.subcommands || []).find((c) => c.name === w);
      if (!node) return null;
    }
    return node;
  };
  for (const top of commands) {
    if (top.name === ws[0] || top.spec && top.spec.subcommand === ws[0]) {
      const hit = descend(top, ws.slice(1));
      if (hit) return hit;
    }
  }
  for (const top of commands) {
    if (top.spec && top.spec.subcommand) continue;
    const hit = descend(top, ws);
    if (hit) return hit;
  }
  return null;
}

// tools/publish/src/lib/help.ts
function runHelp(words) {
  const commands = toolCommands();
  if (words.length === 0) {
    writeJson({ tool: TOOL, usage: "publish <\u4E26\u3073> ... | publish help [<\u4E26\u3073>]", commands });
    return EXIT.OK;
  }
  const c = findElement(commands, words);
  if (!c) {
    stderr.write(`publish: \u672A\u77E5\u306E command: ${words.join(" ")}
`);
    return EXIT.USAGE;
  }
  writeJson(c);
  return EXIT.OK;
}

// tools/publish/src/command/help.ts
var help = defineCommand({
  meta: { name: "help", description: "\u5B9A\u7FA9\uFF08.manifest/toolconfig.json\uFF09\u306E\u5185\u5BB9\u3092\u51FA\u3059\u3002\u5F15\u6570\u306F\u4E26\u3073\u306E\u540D\u524D\uFF08\u7701\u7565\u3059\u308B\u3068\u5168\u4F53\uFF09" },
  args: {
    words: { type: "positional", required: false, description: "\u4E26\u3073\u306E\u540D\u524D" }
  },
  run({ rawArgs }) {
    process.exitCode = runHelp(rawArgs);
  }
});

// tools/publish/src/lib/npm.ts
import fs5 from "node:fs";
import path5 from "node:path";
var ACCESS = /* @__PURE__ */ new Set(["public", "restricted"]);
var TAG_RE2 = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
var PING_FETCH_TIMEOUT_MS = 1e4;
var PING_PROCESS_TIMEOUT_MS = PING_FETCH_TIMEOUT_MS + 5e3;
function checkOptions(values) {
  if (values.tag !== void 0 && !TAG_RE2.test(values.tag)) throw new UsageError(`tag \u306E\u5F62\u304C\u4E0D\u6B63: ${values.tag}`);
  if (values.access !== void 0 && !ACCESS.has(values.access)) throw new UsageError("access \u306F public \u304B restricted");
}
function resolveTarget(target, cwd) {
  const abs = path5.resolve(cwd, target);
  let st;
  try {
    st = fs5.statSync(abs);
  } catch {
    throw new UsageError(`target \u304C\u7121\u3044: ${abs}`);
  }
  if (st.isDirectory()) return { abs, kind: "dir" };
  if (st.isFile() && /\.(tgz|tar\.gz)$/.test(abs)) return { abs, kind: "tarball" };
  throw new UsageError(`target \u306F dir \u304B tarball\uFF08.tgz\u30FB.tar.gz\uFF09\u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044: ${abs}`);
}
async function readManifest(t, env) {
  try {
    if (t.kind === "dir") return JSON.parse(fs5.readFileSync(path5.join(t.abs, "package.json"), "utf8"));
    const tar = which("tar", env);
    if (!tar) return null;
    const r = await run(tar, ["-xzOf", t.abs, "package/package.json"], { env, timeout: 3e4 });
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  }
}
function sameRegistry(a, b) {
  const norm = (u) => String(u).replace(/\/+$/, "");
  return norm(a) === norm(b);
}
function parseJson(text) {
  const s = String(text);
  const i = s.indexOf("{");
  if (i < 0) return null;
  try {
    return JSON.parse(s.slice(i));
  } catch {
    return null;
  }
}
async function checkReachable(npm2, registry, { env, cwd, redact: redact2 }) {
  const r = await run(
    npm2,
    ["ping", ...registry ? ["--registry", registry] : [], "--fetch-retries=0", `--fetch-timeout=${PING_FETCH_TIMEOUT_MS}`],
    { env, cwd, timeout: PING_PROCESS_TIMEOUT_MS }
  );
  if (!r.error && r.status === 0 && !r.timedOut) return null;
  const why = r.timedOut ? "\u6642\u9593\u5207\u308C" : r.error ? r.error.code || r.error.message : `npm ping \u304C\u7D42\u4E86 code ${r.status}`;
  const detail = firstLines(redact2(r.stderr || r.stdout));
  return redact2(
    `registry \u306B\u5C4A\u304B\u306A\u3044\uFF08${why}\uFF09${registry ? ": " + registry : "\uFF08npm \u81EA\u8EAB\u306E\u8A2D\u5B9A\u306E registry\uFF09"}\u3002publish \u306F\u8D70\u3089\u305B\u3066\u3044\u306A\u3044\u3002launchd \u5E38\u99D0\u306E process \u3067\u306F macOS \u306E\u30ED\u30FC\u30AB\u30EB\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u5236\u9650\u3067\u5C4A\u304B\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308B\u3002` + (detail ? "\n" + detail : "")
  );
}
async function publishPackage(values, ctx) {
  const { env, redact: redact2 } = ctx;
  checkOptions(values);
  const registry = values.registry === void 0 ? null : normalizeUrl(values.registry, "--registry").href;
  const t = resolveTarget(values.target, ctx.cwd || process.cwd());
  const npm2 = which("npm", env);
  if (!npm2) throw new EnvError("npm \u304C PATH \u306B\u7121\u3044");
  const pkg = await readManifest(t, env);
  const name = pkg && typeof pkg.name === "string" ? pkg.name : null;
  const version = pkg && typeof pkg.version === "string" ? pkg.version : null;
  const pcReg = pkg && pkg.publishConfig && pkg.publishConfig.registry;
  if (registry && typeof pcReg === "string" && !sameRegistry(pcReg, registry)) {
    throw new FailError("package \u306E publishConfig.registry \u304C\u6307\u5B9A\u306E registry \u3068\u9055\u3046\u306E\u3067 publish \u3057\u306A\u3044");
  }
  const args6 = ["publish", t.abs];
  if (registry) args6.push("--registry", registry);
  args6.push("--json");
  if (registry && name && name.startsWith("@")) args6.push(`--${name.split("/")[0]}:registry=${registry}`);
  if (values.tag !== void 0) args6.push("--tag", values.tag);
  if (values.access !== void 0) args6.push("--access", values.access);
  if (values.dryRun) args6.push("--dry-run");
  ctx.stderr.write(
    `publish: ${ctx.label}: ${name || path5.basename(t.abs)}${version ? "@" + version : ""} -> ${registry || "npm \u306E\u8A2D\u5B9A\u306E registry"}${values.dryRun ? "\uFF08dry-run\uFF09" : ""}
`
  );
  const cwd = t.kind === "dir" ? t.abs : path5.dirname(t.abs);
  const base = {
    registry,
    target: t.abs,
    targetKind: t.kind,
    name,
    version,
    tag: values.tag ?? null,
    access: values.access ?? null,
    dryRun: values.dryRun
  };
  base.pingSkipped = !registry && (name !== null && name.startsWith("@") || typeof pcReg === "string");
  if (base.pingSkipped) {
    ctx.stderr.write("publish: npm ping \u3092\u7701\u304F\uFF08scope \u304B publishConfig.registry \u306E registry \u306F ping \u3067\u78BA\u304B\u3081\u3089\u308C\u306A\u3044\uFF09\u3002publish \u306B\u4EFB\u305B\u308B\n");
  } else {
    const unreachable = await checkReachable(npm2, registry, { env, cwd, redact: redact2 });
    if (unreachable) return { exitCode: 1, result: { ok: false, ...base, error: unreachable } };
  }
  const r = await run(npm2, args6, { env, cwd });
  if (r.error || r.status !== 0 || r.timedOut) {
    const why = r.timedOut ? "\u6642\u9593\u5207\u308C" : r.error ? r.error.code || r.error.message : `npm \u304C\u7D42\u4E86 code ${r.status}`;
    const detail = firstLines(redact2(r.stderr || r.stdout));
    return { exitCode: 1, result: { ok: false, ...base, error: redact2(`npm publish \u304C\u5931\u6557: ${why}${detail ? "\n" + detail : ""}`) } };
  }
  const out = parseJson(r.stdout);
  if (out && typeof out.name === "string") base.name = out.name;
  if (out && typeof out.version === "string") base.version = out.version;
  return { exitCode: 0, result: { ok: true, ...base } };
}

// tools/publish/src/command/npm/publish.ts
var args5 = {
  registry: { type: "string", description: "publish \u3059\u308B registry \u306E URL\uFF08http \u304B https\u3002\u8A8D\u8A3C\u60C5\u5831\u3092\u5165\u308C\u306A\u3044\uFF09\u3002\u7701\u7565\u6642\u306F npm \u81EA\u8EAB\u306E\u8A2D\u5B9A\uFF08host \u306E npm \u306E\u8A2D\u5B9A\uFF09\u306E\u307E\u307E" },
  tag: { type: "string", description: "dist-tag\uFF08\u7701\u7565\u6642\u306F npm \u306E\u65E2\u5B9A\u306E latest\uFF09" },
  access: { type: "string", description: "public \u304B restricted\uFF08scope \u306E package \u306E\u516C\u958B\u7BC4\u56F2\u3002\u7701\u7565\u6642\u306F npm \u306E\u65E2\u5B9A\uFF09" },
  dryRun: { type: "boolean", description: "\u5B9F\u969B\u306B\u306F\u51FA\u3055\u305A\u3001npm \u306E dry-run \u3067\u78BA\u304B\u3081\u308B" },
  target: { type: "positional", required: true, description: "publish \u3059\u308B tarball\uFF08.tgz\u30FB.tar.gz\uFF09\u304B package \u306E dir\u3002\u76F8\u5BFE path \u306F\u8D77\u52D5\u3057\u305F cwd \u304B\u3089" }
};
var publish = defineCommand({
  meta: { name: "publish", description: "\u6307\u5B9A\u306E tarball \u304B dir \u3092 npm publish \u3067 registry \u306B publish \u3059\u308B\u3002registry \u306F --registry \u3067\u53D7\u3051\u3001\u7701\u7565\u6642\u306F npm \u81EA\u8EAB\u306E\u8A2D\u5B9A\u306E\u307E\u307E\uFF08wrapper \u306F\u5B9B\u5148\u3092\u6301\u305F\u306A\u3044\uFF09\u3002\u8A8D\u8A3C\u306F host \u306E npm login\uFF08host \u306E npm \u306E\u8A2D\u5B9A\uFF09\u3092\u305D\u306E\u307E\u307E\u4F7F\u3044\u3001wrapper \u306F token \u3092\u8AAD\u307E\u306A\u3044\u3002--registry \u3092\u4ED8\u3051\u305F\u6642\u3001package \u306E publishConfig.registry \u304C\u305D\u308C\u3068\u9055\u3048\u3070 publish \u3057\u306A\u3044\u3002publish\uFF08dry-run \u542B\u3080\uFF09\u306E\u524D\u306B\u3001--registry \u3092\u4ED8\u3051\u305F\u6642\u3001\u307E\u305F\u306F scope \u3082 publishConfig.registry \u3082\u7121\u3044 package \u306E\u6642\u306F\u3001\u305D\u306E registry\uFF08--registry \u304B npm \u306E\u65E2\u5B9A\u306E registry\uFF09\u306B\u77ED\u3044\u4E0A\u9650\uFF0810 \u79D2\u30FBretry \u7121\u3057\uFF09\u3067\u5C4A\u304F\u304B npm ping \u3067\u78BA\u304B\u3081\u3001\u5C4A\u304B\u306A\u3051\u308C\u3070 publish \u305B\u305A\u3059\u3050 ok:false\uFF08\u7D42\u4E86 code 1\uFF09\u3092\u8FD4\u3059\u3002--registry \u304C\u7121\u304F\u3001package \u304C scope \u4ED8\u304D\u304B publishConfig.registry \u3092\u6301\u3064\u6642\u306F\u3001npm ping \u304C\u5225\u306E registry \u3092\u78BA\u304B\u3081\u3066\u8AA4\u5224\u5B9A\u3059\u308B\u306E\u3067 ping \u3092\u7701\u304D\u3001publish \u81EA\u8EAB\u306B\u4EFB\u305B\u308B\uFF08\u51FA\u529B\u306E pingSkipped \u304C true\uFF09\uFF08launchd \u5E38\u99D0\u306E process \u306F macOS \u306E\u30ED\u30FC\u30AB\u30EB\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u5236\u9650\u3067\u5C4A\u304B\u306A\u3044\u4E8B\u304C\u3042\u308B\uFF09\u3002dry-run \u306E\u6210\u529F\u306F registry \u306B\u5C4A\u304F\u4E8B\u3068\u8A8D\u8A3C\u3092\u4FDD\u8A3C\u3057\u306A\u3044\uFF08\u3053\u306E\u78BA\u304B\u3081\u306F\u5C4A\u304F\u4E8B\u3060\u3051\u3092\u624B\u5F53\u3066\u3059\u308B\uFF09\u3002\u5B9F\u969B\u306B\u516C\u958B\u3055\u308C\u308B\u306E\u3067\u3001dry-run \u3067\u78BA\u304B\u3081\u3066\u304B\u3089\u4F7F\u3046\u3002\u9577\u304F\u306A\u308A\u3046\u308B\u306E\u3067 run_in_background \u3067\u547C\u3076\u3002Claude Code \u306E 1 \u56DE\u306E\u547C\u3073\u51FA\u3057\u306E\u4E0A\u9650\uFF08\u65E2\u5B9A 60 \u79D2\u3001mcp \u8A2D\u5B9A\u306E timeout \u3067\u5EF6\u3070\u3059\uFF09\u3067\u6253\u3061\u5207\u3089\u308C\u3066\u3082 command \u306F\u8D70\u308A\u7D9A\u3051\u308B\u306E\u3067\u3001\u672C\u756A publish \u3092\u547C\u3073\u76F4\u3059\u524D\u306B registry \u306B\u51FA\u305F\u304B\u3092\u78BA\u304B\u3081\u308B\u3002" },
  args: args5,
  async run({ args: parsed }) {
    const values = valuesOf(args5, parsed);
    await runLeaf((ctx) => publishPackage(values, { ...ctx, label: "npm publish" }));
  }
});

// tools/publish/src/command/npm/index.ts
var npm = defineCommand({
  meta: { name: "npm", description: "npm \u306E package \u3092 publish \u3059\u308B\uFF08\u5B9F\u969B\u306B\u516C\u958B\u3055\u308C\u308B\uFF09\u3002host \u306E npm \u306E\u8A2D\u5B9A\uFF08npm login\uFF09\u3092\u4F7F\u3046\u3002" },
  subCommands: { publish }
});

// tools/publish/src/main.ts
var main = defineCommand({
  meta: { name: "publish", version: "0.6.1", description: "\u516C\u958B\u306E\u64CD\u4F5C\uFF08npm \u306E publish\u3001GitHub\u30FBGitea \u306E repo \u3068 release \u306E\u4F5C\u6210\uFF09" },
  subCommands: { help, npm, github, gitea }
});

// tools/publish/src/module.ts
function toRawArgs(argv) {
  const [first] = argv;
  if (first === void 0 || first === "-h" || first === "--help") return ["help"];
  if (first === "help") return argv;
  const { names, cmd, rest } = findLeaf(main, argv, "help \u3067\u4E00\u89A7");
  return [...names, ...normalizeArgv(cmd.args, rest)];
}
async function run2(rawArgs) {
  const before = process.exitCode;
  process.exitCode = void 0;
  try {
    await runCommand(main, { rawArgs: toRawArgs(rawArgs) });
    return Number(process.exitCode ?? EXIT.OK);
  } catch (e) {
    const code = typeof e?.exitCode === "number" ? e.exitCode : e?.name === "CLIError" ? EXIT.USAGE : EXIT.FAIL;
    const message = redact(String(e?.message ?? e));
    process.stderr.write(`publish: ${message}
`);
    if (code !== EXIT.USAGE) writeJson({ ok: false, error: message });
    return code;
  } finally {
    process.exitCode = before;
  }
}
export {
  main,
  run2 as run
};
