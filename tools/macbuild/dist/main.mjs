var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
function parseRawArgs(args3 = [], opts = {}) {
  const booleans = new Set(opts.boolean || []);
  const strings = new Set(opts.string || []);
  const aliasMap = opts.alias || {};
  const defaults2 = opts.default || {};
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
    ...Object.keys(defaults2)
  ]);
  for (const name of allOptions) if (!options[name]) options[name] = {
    type: getType(name),
    default: defaults2[name]
  };
  for (const [alias, main2] of aliasToMain.entries()) if (alias.length === 1 && options[main2] && !options[main2].short) options[main2].short = alias;
  const processedArgs = [];
  const negatedFlags = {};
  for (let i = 0; i < args3.length; i++) {
    const arg = args3[i];
    if (arg === "--") {
      processedArgs.push(...args3.slice(i));
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
    if (out[alias] !== out[main2] && defaults2[main2] === out[main2]) out[main2] = out[alias];
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
  const args3 = resolveArgs(argsDef);
  for (const arg of args3) {
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
  for (const [, arg] of args3.entries()) if (arg.type === "positional") {
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
  const args3 = [];
  for (const [name, argDef] of Object.entries(argsDef || {})) args3.push({
    ...argDef,
    name,
    alias: toArray(argDef.alias)
  });
  return args3;
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

// tools/macbuild/src/lib/errors.ts
var EXIT = Object.freeze({
  OK: 0,
  FAIL: 1,
  // build・署名・確かめの失敗
  USAGE: 2,
  // 使い方の誤り
  BUSY: 3,
  // 別の build が lock を持っている
  ENV: 4
  // host の設定の誤り・道具の不足
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

// tools/macbuild/src/lib/argv.ts
var isNegated = (def) => def.type === "boolean" && def.default === true;
var kebab = (key) => key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
var manifestKey = (key, def) => isNegated(def) ? "no" + key[0].toUpperCase() + key.slice(1) : key;
function normalizeArgv(args3, rest) {
  const flags = /* @__PURE__ */ new Map();
  const positionals = [];
  for (const [key, def] of Object.entries(args3 ?? {})) {
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
function valuesOf(defs, args3) {
  const values = {};
  for (const [key, def] of Object.entries(defs ?? {})) {
    const k = manifestKey(key, def);
    if (def.type === "boolean") {
      values[k] = isNegated(def) ? args3[key] === false : Boolean(args3[key]);
    } else if (args3[key] !== void 0) {
      values[k] = args3[key];
    }
  }
  return values;
}

// tools/macbuild/src/lib/output.ts
function writeJson(value, stream = process.stdout) {
  stream.write(JSON.stringify(value, null, 2) + "\n");
}

// tools/macbuild/src/lib/manifest.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var TOOL = "macbuild";
function findManifest() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (; ; ) {
    const candidate = path.join(dir, ".manifest", "toolconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(".manifest/toolconfig.json \u304C\u898B\u3064\u304B\u3089\u306A\u3044");
    dir = parent;
  }
}
function loadManifest(file = findManifest()) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
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

// tools/macbuild/src/lib/help.ts
function runHelp(words) {
  const commands = toolCommands();
  if (words.length === 0) {
    writeJson({ tool: TOOL, usage: "macbuild <subcommand> ... | macbuild help [<\u4E26\u3073>]", commands });
    return EXIT.OK;
  }
  const c = findElement(commands, words);
  if (!c) {
    process.stderr.write(`macbuild: \u672A\u77E5\u306E command: ${words.join(" ")}
`);
    return EXIT.USAGE;
  }
  writeJson(c);
  return EXIT.OK;
}

// tools/macbuild/src/command/help.ts
var help = defineCommand({
  meta: { name: "help", description: "\u5B9A\u7FA9\uFF08.manifest/toolconfig.json\uFF09\u306E\u5185\u5BB9\u3092\u51FA\u3059\u3002\u5F15\u6570\u306F\u4E26\u3073\u306E\u540D\u524D\uFF08\u7701\u7565\u3059\u308B\u3068\u5168\u4F53\uFF09" },
  args: {
    words: { type: "positional", required: false, description: "\u4E26\u3073\u306E\u540D\u524D" }
  },
  run({ rawArgs }) {
    process.exitCode = runHelp(rawArgs);
  }
});

// tools/macbuild/src/lib/info.ts
import fs5 from "node:fs";
import os2 from "node:os";

// tools/macbuild/src/lib/config.ts
import fs2 from "node:fs";
import os from "node:os";
import path2 from "node:path";
var CONFIG_ENV = "MACBUILD_CONFIG";
var FIELDS = Object.freeze({
  identity: { env: "MACBUILD_IDENTITY", kind: "string" },
  updaterKeyPath: { env: "MACBUILD_UPDATER_KEY_PATH", kind: "path" },
  updaterKeyPasswordEnv: { env: "MACBUILD_UPDATER_KEY_PASSWORD_ENV", kind: "envName" },
  appleIdEnv: { env: "MACBUILD_APPLE_ID_ENV", kind: "envName", passAs: "APPLE_ID" },
  applePasswordEnv: { env: "MACBUILD_APPLE_PASSWORD_ENV", kind: "envName", passAs: "APPLE_PASSWORD" },
  appleTeamIdEnv: { env: "MACBUILD_APPLE_TEAM_ID_ENV", kind: "envName", passAs: "APPLE_TEAM_ID" },
  appleApiKeyEnv: { env: "MACBUILD_APPLE_API_KEY_ENV", kind: "envName", passAs: "APPLE_API_KEY" },
  appleApiIssuerEnv: { env: "MACBUILD_APPLE_API_ISSUER_ENV", kind: "envName", passAs: "APPLE_API_ISSUER" },
  appleApiKeyPathEnv: { env: "MACBUILD_APPLE_API_KEY_PATH_ENV", kind: "envName", passAs: "APPLE_API_KEY_PATH" },
  appleProviderShortNameEnv: {
    env: "MACBUILD_APPLE_PROVIDER_SHORT_NAME_ENV",
    kind: "envName",
    passAs: "APPLE_PROVIDER_SHORT_NAME"
    // 複数の team に属する Apple ID で公証する時
  },
  lockDir: { env: "MACBUILD_LOCK_DIR", kind: "path" },
  logDir: { env: "MACBUILD_LOG_DIR", kind: "path" }
});
var NOTARIZE_FIELDS = Object.freeze(
  Object.entries(FIELDS).filter(([, f]) => f.passAs).map(([key, f]) => [key, f.passAs])
);
var ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function defaultConfigPath(home) {
  return path2.join(home, ".config", "superbash-bantou", "config.json");
}
function defaults(home) {
  const d = {};
  for (const key of Object.keys(FIELDS)) d[key] = null;
  d.lockDir = path2.join(home, "Library", "Caches", "superbash-bantou");
  d.logDir = path2.join(home, "Library", "Logs", "superbash-bantou");
  return d;
}
function expandPath(value, home, base) {
  let v = value;
  if (v === "~") v = home;
  else if (v.startsWith("~/")) v = path2.join(home, v.slice(2));
  return path2.resolve(base, v);
}
function normalize(key, value, { home, base, where }) {
  const field = FIELDS[key];
  if (typeof value !== "string") throw new EnvError(`${where} \u306E ${key} \u306F\u6587\u5B57\u5217\u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044`);
  if (field.kind === "path") return expandPath(value, home, base);
  if (field.kind === "envName" && !ENV_NAME_RE.test(value)) {
    throw new EnvError(`${where} \u306E ${key} \u306F\u74B0\u5883\u5909\u6570\u306E\u540D\u524D\u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044`);
  }
  return value;
}
function readFile(file, explicit) {
  let text;
  try {
    text = fs2.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT" && !explicit) return null;
    if (e.code === "ENOENT") throw new EnvError(`${CONFIG_ENV} \u306E\u8A2D\u5B9A\u306E file \u304C\u7121\u3044: ${file}`);
    throw new EnvError(`\u8A2D\u5B9A\u306E file \u3092\u8AAD\u3081\u306A\u3044: ${file}: ${e.code || e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new EnvError(`\u8A2D\u5B9A\u306E file \u304C JSON \u3067\u306A\u3044: ${file}: ${e.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new EnvError(`\u8A2D\u5B9A\u306E file \u306F JSON \u306E object \u3067\u306A\u3051\u308C\u3070\u306A\u3089\u306A\u3044: ${file}`);
  }
  return data;
}
function loadConfig({ env = process.env, home = os.homedir(), cwd = process.cwd() } = {}) {
  const explicit = typeof env[CONFIG_ENV] === "string" && env[CONFIG_ENV] !== "";
  const filePath = explicit ? expandPath(env[CONFIG_ENV], home, cwd) : defaultConfigPath(home);
  const data = readFile(filePath, explicit);
  const result = defaults(home);
  const sources = {};
  const warnings = [];
  for (const key of Object.keys(FIELDS)) {
    sources[key] = result[key] === null ? "unset" : "default";
  }
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === "$schema") continue;
      if (!Object.prototype.hasOwnProperty.call(FIELDS, key)) {
        warnings.push(`\u8A2D\u5B9A\u306E file \u306E\u672A\u77E5\u306E key \u3092\u7121\u8996\u3059\u308B: ${key}`);
        continue;
      }
      if (value === null) continue;
      result[key] = normalize(key, value, { home, base: path2.dirname(filePath), where: "\u8A2D\u5B9A\u306E file" });
      sources[key] = "file";
    }
  }
  for (const [key, field] of Object.entries(FIELDS)) {
    const v = env[field.env];
    if (typeof v !== "string" || v === "") continue;
    result[key] = normalize(key, v, { home, base: cwd, where: field.env });
    sources[key] = "env";
  }
  const signingMode = result.identity && result.identity !== "-" ? "identity" : "adhoc";
  return {
    ...result,
    signingMode,
    sources,
    warnings,
    file: { path: filePath, explicit, found: data !== null }
  };
}
function reportWarnings(config, stderr) {
  for (const w of config.warnings || []) stderr.write(`macbuild: \u8B66\u544A: ${w}
`);
}
function codesignIdentity(config) {
  return config.signingMode === "identity" ? config.identity : "-";
}

// tools/macbuild/src/lib/lock.ts
import fs3 from "node:fs";
import path3 from "node:path";
var LOCK_NAME = "macbuild-tauri.lock";
var O_SHLOCK = fs3.constants.O_SHLOCK || 16;
var O_EXLOCK = fs3.constants.O_EXLOCK || 32;
function openLocked(lockPath, lockFlag, create) {
  const c = fs3.constants;
  return fs3.openSync(lockPath, c.O_RDWR | c.O_NONBLOCK | lockFlag | (create ? c.O_CREAT : 0), 420);
}
function isBusy(e) {
  return e.code === "EAGAIN" || e.code === "EWOULDBLOCK";
}
function readOwner(lockPath) {
  try {
    const text = fs3.readFileSync(lockPath, "utf8").trim();
    const owner = text ? JSON.parse(text) : null;
    return owner && typeof owner === "object" ? owner : null;
  } catch {
    return null;
  }
}
function publicOwner(owner) {
  if (!owner) return null;
  return { pid: owner.pid ?? null, startedAt: owner.startedAt ?? null, project: owner.project ?? null };
}
function acquire(lockDir, meta = {}) {
  fs3.mkdirSync(lockDir, { recursive: true });
  const lockPath = path3.join(lockDir, LOCK_NAME);
  let fd;
  try {
    fd = openLocked(lockPath, O_EXLOCK, true);
  } catch (e) {
    if (isBusy(e)) return { acquired: false, path: lockPath, owner: readOwner(lockPath) };
    throw e;
  }
  const owner = { pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString(), ...meta };
  fs3.ftruncateSync(fd, 0);
  fs3.writeSync(fd, JSON.stringify(owner) + "\n", 0);
  let released = false;
  return {
    acquired: true,
    path: lockPath,
    owner,
    release() {
      if (released) return;
      released = true;
      try {
        fs3.ftruncateSync(fd, 0);
      } finally {
        fs3.closeSync(fd);
      }
    }
  };
}
function inspect(lockDir) {
  const lockPath = path3.join(lockDir, LOCK_NAME);
  const owner = readOwner(lockPath);
  if (!owner) return { path: lockPath, held: false };
  let fd;
  try {
    fd = openLocked(lockPath, O_SHLOCK, false);
  } catch (e) {
    if (isBusy(e)) return { path: lockPath, held: true, ...publicOwner(owner) };
    if (e.code === "ENOENT") return { path: lockPath, held: false };
    throw e;
  }
  fs3.closeSync(fd);
  return { path: lockPath, held: false };
}

// tools/macbuild/src/lib/proc.ts
import { spawn, spawnSync } from "node:child_process";
import fs4 from "node:fs";
import path4 from "node:path";
function isExecutableFile(p) {
  try {
    if (!fs4.statSync(p).isFile()) return false;
    fs4.accessSync(p, fs4.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function which(cmd, env = process.env) {
  if (cmd.includes("/")) return isExecutableFile(cmd) ? path4.resolve(cmd) : null;
  for (const dir of (env.PATH || "").split(path4.delimiter)) {
    if (!dir) continue;
    const p = path4.join(dir, cmd);
    if (isExecutableFile(p)) return p;
  }
  return null;
}
function runSync(cmd, args3, { cwd, env, timeout = 6e4 } = {}) {
  const r = spawnSync(cmd, args3, {
    cwd,
    env,
    timeout,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error || null
  };
}
var MAX_PENDING = 256 * 1024;
function runToLog(cmd, args3, { cwd, env, fd, redact = (s) => s, tap = () => {
}, onSpawn } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const child = spawn(cmd, args3, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    if (onSpawn) onSpawn(child);
    const drained = [
      ["stdout", child.stdout],
      ["stderr", child.stderr]
    ].map(
      ([name, stream]) => new Promise((res) => {
        let pending = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          pending += chunk;
          const cut = pending.length > MAX_PENDING ? pending.length : pending.lastIndexOf("\n") + 1;
          if (cut > 0) {
            const raw = pending.slice(0, cut);
            tap(raw, name);
            fs4.writeSync(fd, redact(raw));
            pending = pending.slice(cut);
          }
        });
        stream.on("end", () => {
          if (pending) {
            tap(pending, name);
            fs4.writeSync(fd, redact(pending));
          }
          res();
        });
        stream.on("error", res);
      })
    );
    child.on("error", (error) => finish({ status: null, signal: null, error }));
    child.on("close", (status, signal) => {
      Promise.all(drained).then(() => finish({ status, signal, error: null }));
    });
  });
}
function firstLine(text) {
  const line = String(text || "").split("\n").map((s) => s.trim()).find((s) => s !== "");
  return line ? line.slice(0, 300) : null;
}

// tools/macbuild/src/lib/secrets.ts
var SECRET_PREFIXES = ["APPLE_", "TAURI_SIGNING_"];
var SECRET_NAMES = /* @__PURE__ */ new Set(["TAURI_PRIVATE_KEY", "TAURI_KEY_PASSWORD"]);
var MIN_SECRET_LENGTH = 4;
var KEYCHAINS_DIR_RE = /[^\s'"`()]*\/Keychains(?:\/[^\s'"`()]*)?/g;
var KEYCHAIN_FILE_RE = /[^\s'"`()]*\.keychain(?:-db)?(?![\w.-])/g;
var TEAM_ID_RE = /\(([A-Z0-9]{10})\)\s*$/;
var TEAM_AFTER_IDENTITY_RE = /<identity>(\s*)\([A-Z0-9]{10}\)/g;
var AMBIGUOUS_LINE_RE = /^.*\bambiguous\b.*$/gm;
var IDENTITY_CANDIDATE_RE = /"<identity>[^"\n]*"/g;
function isSecretName(name) {
  return SECRET_NAMES.has(name) || SECRET_PREFIXES.some((p) => name.startsWith(p));
}
function namedEnvs(config) {
  if (!config) return [];
  return Object.entries(FIELDS).filter(([, f]) => f.kind === "envName").map(([key]) => config[key]).filter(Boolean);
}
function scrubEnv(baseEnv, config) {
  const drop = new Set(namedEnvs(config));
  const env = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (drop.has(k) || isSecretName(k)) continue;
    env[k] = v;
  }
  return env;
}
function secretsOf(config, baseEnv = {}) {
  const list = [];
  if (config) {
    if (config.signingMode === "identity") {
      list.push([config.identity, "<identity>"]);
      const team = config.identity.match(TEAM_ID_RE);
      if (team) list.push([team[1], "<team-id>"]);
    }
    if (config.updaterKeyPath) list.push([config.updaterKeyPath, "<updater-key>"]);
    for (const name of namedEnvs(config)) {
      if (typeof baseEnv[name] === "string") list.push([baseEnv[name], "<secret>"]);
    }
  }
  return list.filter(([v]) => typeof v === "string" && v.length >= MIN_SECRET_LENGTH);
}
function makeRedactor(secrets) {
  const sorted = [...secrets].sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let s = String(text);
    for (const [value, mark] of sorted) s = s.split(value).join(mark);
    return s.replace(AMBIGUOUS_LINE_RE, (line) => line.replace(IDENTITY_CANDIDATE_RE, '"<identity-candidate>"')).replace(TEAM_AFTER_IDENTITY_RE, "<identity>$1(<team-id>)").replace(KEYCHAINS_DIR_RE, "<keychain>").replace(KEYCHAIN_FILE_RE, "<keychain>");
  };
}

// tools/macbuild/src/lib/info.ts
var PROBES = Object.freeze([
  ["xcodebuild", ["-version"]],
  ["codesign", null],
  ["sccache", ["--version"]],
  ["cargo", ["--version"]],
  ["rustc", ["--version"]],
  ["node", ["--version"]],
  ["cargo-tauri", ["--version"]]
]);
function tildify(p, home = os2.homedir()) {
  if (!p) return p;
  if (p === home) return "~";
  return p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;
}
function probe(name, versionArgs, env) {
  const p = which(name, env);
  if (!p) return { available: false, version: null, path: null };
  if (!versionArgs) return { available: true, version: null, path: tildify(p) };
  const r = runSync(p, versionArgs, { env, timeout: 2e4 });
  if (!r.ok) {
    return {
      available: false,
      version: null,
      path: tildify(p),
      note: firstLine(r.stderr) || firstLine(r.stdout) || firstLine(r.error && r.error.message)
    };
  }
  const version = (r.stdout.trim() || r.stderr.trim()).split("\n").map((s) => s.trim()).filter(Boolean).join("; ");
  return { available: true, version: version || null, path: tildify(p) };
}
function fileExists(p) {
  try {
    return fs5.statSync(p).isFile();
  } catch {
    return false;
  }
}
function collect({ env = process.env, stderr = process.stderr } = {}) {
  let config = null;
  let configError = null;
  try {
    config = loadConfig({ env });
  } catch (e) {
    configError = e.message;
  }
  if (config) reportWarnings(config, stderr);
  const childEnv = scrubEnv(env, config);
  const tools = {};
  for (const [name, args3] of PROBES) tools[name] = probe(name, args3, childEnv);
  const swVers = runSync("sw_vers", ["-productVersion"], { env: childEnv, timeout: 1e4 });
  const devDir = runSync("xcode-select", ["-p"], { env: childEnv, timeout: 1e4 });
  const report = {
    host: { platform: process.platform, arch: process.arch, macos: swVers.ok ? swVers.stdout.trim() : null },
    developerDir: devDir.ok ? devDir.stdout.trim() : null,
    tools
  };
  if (!config) {
    report.signing = null;
    report.config = { error: configError };
    return { report, exitCode: EXIT.ENV };
  }
  const pwEnv = config.updaterKeyPasswordEnv;
  const notarizeNames = NOTARIZE_FIELDS.map(([key]) => config[key]).filter(Boolean);
  report.signing = {
    mode: config.signingMode,
    identity: config.signingMode === "identity",
    updaterKey: Boolean(config.updaterKeyPath),
    updaterKeyFound: config.updaterKeyPath ? fileExists(config.updaterKeyPath) : null,
    updaterKeyPassword: Boolean(pwEnv),
    updaterKeyPasswordSet: pwEnv ? typeof env[pwEnv] === "string" : null,
    notarize: notarizeNames.length > 0,
    notarizeSet: notarizeNames.length ? notarizeNames.every((n) => typeof env[n] === "string") : null
  };
  report.config = {
    file: tildify(config.file.path),
    found: config.file.found,
    sources: config.sources,
    warnings: config.warnings
  };
  const st = inspect(config.lockDir);
  report.lock = {
    dir: tildify(config.lockDir),
    held: st.held,
    ...st.held ? { pid: st.pid, startedAt: st.startedAt, project: st.project } : {}
  };
  report.logDir = tildify(config.logDir);
  return { report, exitCode: EXIT.OK };
}

// tools/macbuild/src/command/info.ts
var info = defineCommand({
  meta: { name: "info", description: "\u3053\u306E host \u3067\u4F7F\u3048\u308B build \u306E\u9053\u5177\uFF08xcodebuild\u30FBcodesign\u30FBsccache\u30FBcargo\u30FBrustc\u30FBnode\u30FBcargo-tauri\uFF09\u306E\u6709\u7121\u3068\u7248\u3001\u7F72\u540D\u306E\u8A2D\u5B9A\u304C\u6709\u308B\u304B\u7121\u3044\u304B\uFF08\u5024\u306F\u51FA\u3055\u306A\u3044\uFF09\u3001build \u306E lock \u306E\u72B6\u614B\u3092\u51FA\u3059\u3002" },
  run() {
    const { report, exitCode } = collect({ env: process.env, stderr: process.stderr });
    writeJson(report);
    process.exitCode = exitCode;
  }
});

// tools/macbuild/src/lib/sign.ts
import fs7 from "node:fs";
import path5 from "node:path";

// tools/macbuild/src/lib/codesign.ts
var codesign_exports = {};
__export(codesign_exports, {
  CODESIGN: () => CODESIGN,
  PRESERVE: () => PRESERVE,
  describe: () => describe,
  parseDescribe: () => parseDescribe,
  sign: () => sign,
  signArgs: () => signArgs,
  verify: () => verify,
  verifyArgs: () => verifyArgs
});
import fs6 from "node:fs";
var CODESIGN = "codesign";
var TIMEOUT = 10 * 6e4;
var PRESERVE = "--preserve-metadata=entitlements,flags,runtime";
function failure(r) {
  const lines = String(r.stderr || "").split("\n").map((s) => s.trim()).filter((s) => s !== "" && !/: replacing existing signature$/.test(s));
  if (lines.length) return lines.slice(-3).join("; ").slice(0, 600);
  return firstLine(r.error && r.error.message) || `\u7D42\u4E86 code ${r.status}`;
}
function isDir(p) {
  try {
    return fs6.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function signArgs(target, { identity, entitlements, noTimestamp } = {}) {
  const id = identity || "-";
  const args3 = ["--force", "--sign", id, PRESERVE];
  if (id !== "-") args3.push(noTimestamp ? "--timestamp=none" : "--timestamp");
  if (entitlements) args3.push("--entitlements", entitlements);
  args3.push(target);
  return args3;
}
function sign(target, opts = {}) {
  const r = runSync(CODESIGN, signArgs(target, opts), { env: opts.env, timeout: TIMEOUT });
  return { ok: r.ok, message: r.ok ? null : failure(r) };
}
function verifyArgs(target) {
  const args3 = ["--verify", "--strict", "--verbose=2"];
  if (isDir(target)) args3.splice(1, 0, "--deep");
  args3.push(target);
  return args3;
}
function verify(target, { env } = {}) {
  const r = runSync(CODESIGN, verifyArgs(target), { env, timeout: TIMEOUT });
  return { ok: r.ok, message: r.ok ? null : failure(r) };
}
function parseDescribe(text) {
  const out = { kind: "unknown", identifier: null, format: null, runtime: false };
  if (/code object is not signed at all/.test(text)) {
    out.kind = "unsigned";
    return out;
  }
  const field = (name) => {
    const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  out.identifier = field("Identifier");
  out.format = field("Format");
  const flags = (text.match(/^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m) || [])[1] || "";
  out.runtime = flags.split(",").includes("runtime");
  if (field("Signature") === "adhoc" || flags.split(",").includes("adhoc")) out.kind = "adhoc";
  else if (/^Authority=/m.test(text)) out.kind = "certificate";
  return out;
}
function describe(target, { env } = {}) {
  const r = runSync(CODESIGN, ["-dv", "--verbose=2", target], { env, timeout: 6e4 });
  return parseDescribe(`${r.stderr}
${r.stdout}`);
}

// tools/macbuild/src/lib/sign.ts
function signArtifact(values, { env = process.env, cwd = process.cwd(), stderr = process.stderr, tool = codesign_exports } = {}) {
  if (process.platform !== "darwin") throw new EnvError("mac\uFF08darwin\uFF09\u3067\u3057\u304B\u52D5\u304B\u306A\u3044");
  const target = path5.resolve(cwd, values.path);
  if (!fs7.existsSync(target)) throw new UsageError(`\u7F72\u540D\u3059\u308B\u7269\u304C\u7121\u3044: ${target}`);
  let entitlements = null;
  if (values.entitlements) {
    entitlements = path5.resolve(cwd, values.entitlements);
    if (!fs7.existsSync(entitlements)) throw new UsageError(`entitlements \u306E file \u304C\u7121\u3044: ${entitlements}`);
  }
  const config = loadConfig({ env, cwd });
  reportWarnings(config, stderr);
  if (!which("codesign", env)) throw new EnvError("codesign \u304C\u7121\u3044");
  const toolEnv = scrubEnv(env, config);
  const redact = makeRedactor(secretsOf(config, env));
  const base = { path: target, signing: config.signingMode };
  const s = tool.sign(target, {
    identity: codesignIdentity(config),
    entitlements,
    noTimestamp: Boolean(values.noTimestamp),
    env: toolEnv
  });
  if (!s.ok) {
    return { exitCode: EXIT.FAIL, result: { ok: false, ...base, error: redact(`\u7F72\u540D\u304C\u5931\u6557: ${s.message}`) } };
  }
  const v = tool.verify(target, { env: toolEnv });
  const signature = tool.describe(target, { env: toolEnv });
  const expected = config.signingMode === "identity" ? "certificate" : "adhoc";
  let error = null;
  if (!v.ok) error = redact(`\u7F72\u540D\u306E\u78BA\u304B\u3081\u304C\u901A\u3089\u306A\u3044: ${v.message}`);
  else if (signature.kind !== expected) error = `\u7F72\u540D\u304C ${expected} \u3067\u306A\u3044\uFF08${signature.kind}\uFF09`;
  return {
    exitCode: error ? EXIT.FAIL : EXIT.OK,
    result: { ok: error === null, ...base, verified: v.ok, signature, ...error ? { error } : {} }
  };
}

// tools/macbuild/src/command/sign.ts
var args = {
  entitlements: { type: "string", description: "\u7F72\u540D\u306B\u4ED8\u3051\u308B entitlements \u306E plist \u306E path\uFF08\u7701\u7565\u6642\u306F\u5143\u306E\u7F72\u540D\u306E entitlements \u3092\u5F15\u304D\u7D99\u3050\uFF09" },
  timestamp: { type: "boolean", default: true, description: "identity \u306E\u7F72\u540D\u306B timestamp \u3092\u4ED8\u3051\u306A\u3044\uFF08offline \u3067\u7F72\u540D\u3059\u308B\u6642\uFF09\u3002ad-hoc \u3067\u306F\u5143\u304B\u3089\u4ED8\u3051\u306A\u3044" },
  path: { type: "positional", required: true, description: "\u7F72\u540D\u3057\u76F4\u3059\u6210\u679C\u7269\u306E path\u3002\u76F8\u5BFE path \u306F\u8D77\u52D5\u3057\u305F cwd \u304B\u3089" }
};
var sign2 = defineCommand({
  meta: { name: "sign", description: "\u6307\u5B9A\u306E\u6210\u679C\u7269\uFF08.app\u30FB.dmg\u30FB\u5B9F\u884C file\uFF09\u3092 host \u306E\u8A2D\u5B9A\u306E identity \u3067\u7F72\u540D\u3057\u76F4\u3059\uFF08identity \u304C\u7121\u3051\u308C\u3070 ad-hoc\uFF09\u3002\u5143\u306E\u7F72\u540D\u306E entitlements \u3068 hardened runtime \u306A\u3069\u306E flag \u306F\u5F15\u304D\u7D99\u3050\uFF08--entitlements \u3092\u6E21\u305B\u3070\u305D\u3061\u3089\uFF09\u3002identity \u306E\u6642\u306F timestamp \u3092\u4ED8\u3051\u308B\uFF08no-timestamp \u3067\u5916\u305B\u308B\uFF09\u3002\u7F72\u540D\u306E\u5F8C\u306B codesign --verify --strict\uFF08bundle \u306F --deep \u3082\uFF09\u3067\u78BA\u304B\u3081\u3001\u7F72\u540D\u306E\u7A2E\u985E\u3092\u51FA\u3059\u3002bundle \u306E\u4E2D\u306E\u5165\u308C\u5B50\u306E code \u306F\u7F72\u540D\u3057\u76F4\u3055\u306A\u3044\uFF08\u5916\u5074\u3060\u3051\uFF09\u3002" },
  args,
  async run({ args: parsed }) {
    const { exitCode, result } = signArtifact(valuesOf(args, parsed), { env: process.env, stderr: process.stderr });
    if (!result.ok) process.stderr.write(`macbuild: ${result.error}
`);
    writeJson(result);
    process.exitCode = exitCode;
  }
});

// tools/macbuild/src/lib/tauri.ts
import fs8 from "node:fs";
import os3 from "node:os";
import path6 from "node:path";
var LOG_TAIL_LINES = 40;
function findTauriCli(project, env = process.env) {
  let dir = project;
  for (; ; ) {
    const bin = path6.join(dir, "node_modules", ".bin", "tauri");
    if (isExecutableFile(bin)) return { cmd: bin, args: [], label: path6.relative(project, bin) || bin };
    const parent = path6.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (which("cargo-tauri", env)) return { cmd: "cargo", args: ["tauri"], label: "cargo tauri" };
  return null;
}
function tauriArgs({ target, bundles, debug } = {}) {
  const args3 = ["build", "--ci"];
  if (target) args3.push("--target", target);
  if (bundles) args3.push("--bundles", bundles);
  if (debug) args3.push("--debug");
  return args3;
}
function namedValue(baseEnv, name, what) {
  const v = baseEnv[name];
  if (typeof v !== "string") throw new EnvError(`${what}\u306E\u74B0\u5883\u5909\u6570\u304C\u7121\u3044: ${name}`);
  return v;
}
function tauriEnv(config, { baseEnv = process.env, targetDir } = {}) {
  const env = scrubEnv(baseEnv, config);
  env.APPLE_SIGNING_IDENTITY = codesignIdentity(config);
  if (config.updaterKeyPath) {
    env.TAURI_SIGNING_PRIVATE_KEY = config.updaterKeyPath;
    if (config.updaterKeyPasswordEnv) {
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = namedValue(baseEnv, config.updaterKeyPasswordEnv, "updater \u306E\u9375\u306E password ");
    }
  }
  if (config.signingMode === "identity") {
    for (const [key, passAs] of NOTARIZE_FIELDS) {
      if (config[key]) env[passAs] = namedValue(baseEnv, config[key], "\u516C\u8A3C\u306E\u8CC7\u683C\uFF08" + passAs + "\uFF09");
    }
  }
  if (targetDir) env.CARGO_TARGET_DIR = targetDir;
  return env;
}
function artifactKind(p) {
  if (p.endsWith(".app.tar.gz")) return "updater";
  if (p.endsWith(".sig")) return "updater-signature";
  if (p.endsWith(".app")) return "app";
  if (p.endsWith(".dmg")) return "dmg";
  return "other";
}
var ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
var FINISHED_RE = /Finished \d+ .* at:\s*$/;
var MAX_LINE = 64 * 1024;
function finishedCollector() {
  const found = /* @__PURE__ */ new Set();
  const streams = /* @__PURE__ */ new Map();
  const onLine = (st, text) => {
    const s = text.replace(ANSI_RE, "");
    if (st.inBlock) {
      const t = s.trim();
      if (t.startsWith("/")) {
        found.add(t);
        return;
      }
      st.inBlock = false;
    }
    if (FINISHED_RE.test(s)) st.inBlock = true;
  };
  return {
    feed(text, name = "out") {
      let st = streams.get(name);
      if (!st) {
        st = { partial: "", inBlock: false, skipping: false };
        streams.set(name, st);
      }
      let rest = text;
      if (st.skipping) {
        const nl = rest.indexOf("\n");
        if (nl < 0) return;
        rest = rest.slice(nl + 1);
        st.skipping = false;
      }
      const parts = (st.partial + rest).split("\n");
      st.partial = parts.pop();
      for (const p of parts) onLine(st, p);
      if (st.partial.length > MAX_LINE) {
        st.partial = "";
        st.inBlock = false;
        st.skipping = true;
      }
    },
    /** 拾った path（出た順、重複なし）。stream の最後の改行の無い行も読む。 */
    paths() {
      for (const st of streams.values()) {
        if (st.partial && !st.skipping) onLine(st, st.partial);
        st.partial = "";
      }
      return [...found];
    }
  };
}
function scanBundleDir({ project, targetDir, target, debug, since }) {
  const base = targetDir || path6.join(project, "src-tauri", "target");
  const root = path6.join(base, ...target ? [target] : [], debug ? "debug" : "release", "bundle");
  const found = [];
  for (const sub of ["macos", "dmg"]) {
    const dir = path6.join(root, sub);
    let names = [];
    try {
      names = fs8.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const p = path6.join(dir, name);
      try {
        if (fs8.statSync(p).mtimeMs >= since - 1e3) found.push(p);
      } catch {
      }
    }
  }
  return found;
}
function readTail(file, lines = LOG_TAIL_LINES) {
  try {
    const text = fs8.readFileSync(file, "utf8").replace(ANSI_RE, "");
    return text.split("\n").slice(-lines - 1).join("\n");
  } catch {
    return "";
  }
}
function stamp(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().replace(/[:.]/g, "-");
}
async function build(values, { stderr = process.stderr, env = process.env, cwd = process.cwd() } = {}) {
  const say = (msg) => stderr.write(`macbuild: ${msg}
`);
  const started = Date.now();
  if (process.platform !== "darwin") throw new EnvError("mac\uFF08darwin\uFF09\u3067\u3057\u304B\u52D5\u304B\u306A\u3044");
  const project = path6.resolve(cwd, values.project);
  if (!fs8.existsSync(project) || !fs8.statSync(project).isDirectory()) {
    throw new UsageError(`project \u306E dir \u304C\u7121\u3044: ${project}`);
  }
  const config = loadConfig({ env, cwd });
  reportWarnings(config, stderr);
  const redact = makeRedactor(secretsOf(config, env));
  const toolEnv = scrubEnv(env, config);
  if (!which("codesign", env)) throw new EnvError("codesign \u304C\u7121\u3044");
  if (!which("cargo", env)) throw new EnvError("cargo \u304C\u7121\u3044\uFF08Rust \u306E toolchain \u304C\u8981\u308B\uFF09");
  const cli = findTauriCli(project, env);
  if (!cli) {
    throw new EnvError("Tauri \u306E CLI \u304C\u7121\u3044\uFF08project \u306E node_modules/.bin/tauri \u304B\u3001PATH \u306E cargo-tauri \u304C\u8981\u308B\uFF09");
  }
  if (config.updaterKeyPath) {
    let st = null;
    try {
      st = fs8.statSync(config.updaterKeyPath);
    } catch {
    }
    if (!st || !st.isFile()) throw new EnvError("\u8A2D\u5B9A\u306E updater \u306E\u9375\u306E file \u304C\u7121\u3044");
  }
  const targetDir = values.targetDir ? path6.resolve(cwd, values.targetDir) : env.CARGO_TARGET_DIR || null;
  const childEnv = tauriEnv(config, { baseEnv: env, targetDir });
  const args3 = tauriArgs(values);
  try {
    fs8.mkdirSync(config.logDir, { recursive: true });
  } catch (e) {
    throw new EnvError(`log \u306E dir \u3092\u4F5C\u308C\u306A\u3044: ${config.logDir}: ${e.code || e.message}`);
  }
  let held;
  try {
    held = acquire(config.lockDir, { project, command: "tauri" });
  } catch (e) {
    throw new EnvError(`lock \u3092\u53D6\u308C\u306A\u3044\uFF08lock \u306E dir \u306E\u8AA4\u308A\uFF09: ${config.lockDir}: ${e.code || e.message}`);
  }
  if (!held.acquired) {
    const owner = publicOwner(held.owner);
    say(
      `\u5225\u306E build \u304C lock \u3092\u6301\u3063\u3066\u3044\u308B\uFF08\u5F85\u305F\u305A\u306B\u7D42\u308F\u308B\uFF09: ${held.path}` + (owner ? ` pid=${owner.pid} startedAt=${owner.startedAt} project=${owner.project}` : "")
    );
    return {
      exitCode: EXIT.BUSY,
      result: { ok: false, error: "lock-busy", project, lock: { path: held.path, owner } }
    };
  }
  let child = null;
  const onSignal = (sig) => {
    if (child && child.exitCode === null) child.kill(sig);
    held.release();
    process.exit(128 + (os3.constants.signals[sig] || 0));
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const s of signals) process.on(s, onSignal);
  process.on("exit", held.release);
  const logPath = path6.join(config.logDir, `tauri-${stamp(new Date(started))}-${process.pid}.log`);
  const finished = finishedCollector();
  try {
    say(`lock \u3092\u53D6\u3063\u305F: ${held.path}`);
    const fd = fs8.openSync(logPath, "a");
    try {
      fs8.writeSync(
        fd,
        redact(
          [
            `# macbuild tauri ${new Date(started).toISOString()}`,
            `# project: ${project}`,
            `# cli: ${cli.label} ${[...cli.args, ...args3].join(" ")}`,
            `# signing: ${config.signingMode}${config.updaterKeyPath ? " (updater key: set)" : ""}`,
            `# target dir: ${targetDir || "(cargo \u306E\u65E2\u5B9A)"}`,
            ""
          ].join("\n") + "\n"
        )
      );
      say(`build \u3092\u59CB\u3081\u305F: log ${logPath}`);
      const r = await runToLog(cli.cmd, [...cli.args, ...args3], {
        cwd: project,
        env: childEnv,
        fd,
        redact,
        tap: (raw, name) => finished.feed(raw, name),
        onSpawn: (c) => {
          child = c;
        }
      });
      child = null;
      if (r.error || r.status !== 0) {
        const why = r.error ? `Tauri \u306E CLI \u3092\u8D77\u52D5\u3067\u304D\u306A\u3044: ${r.error.message}` : r.signal ? `Tauri \u306E build \u304C signal ${r.signal} \u3067\u6B62\u307E\u3063\u305F` : `Tauri \u306E build \u304C\u5931\u6557\u3057\u305F\uFF08\u7D42\u4E86 code ${r.status}\uFF09`;
        say(why);
        const tail = redact(readTail(logPath));
        if (tail) stderr.write(`--- log \u306E\u672B\u5C3E\uFF08${logPath}\uFF09---
${tail}
--- \u3053\u3053\u307E\u3067 ---
`);
        return {
          exitCode: EXIT.FAIL,
          result: { ok: false, error: why, project, log: logPath, durationMs: Date.now() - started }
        };
      }
    } finally {
      fs8.closeSync(fd);
    }
    let paths = finished.paths().filter((p) => fs8.existsSync(p));
    if (paths.length === 0) {
      paths = scanBundleDir({ project, targetDir, target: values.target, debug: values.debug, since: started });
    }
    const artifacts = paths.map((p) => {
      const a = { kind: artifactKind(p), path: p };
      if (a.kind === "app" || a.kind === "dmg") {
        a.signature = describe(p, { env: toolEnv });
        if (a.signature.kind !== "unsigned") {
          const v = verify(p, { env: toolEnv });
          a.verified = v.ok;
          if (!v.ok) a.verifyError = redact(v.message);
        } else {
          a.verified = false;
        }
      }
      return a;
    });
    const expected = config.signingMode === "identity" ? "certificate" : "adhoc";
    const apps = artifacts.filter((a) => a.kind === "app");
    let error = null;
    if (apps.length === 0) error = "\u6210\u679C\u7269\u306E .app \u304C\u898B\u3064\u304B\u3089\u306A\u3044";
    else if (apps.some((a) => !a.verified)) error = ".app \u306E\u7F72\u540D\u306E\u78BA\u304B\u3081\u304C\u901A\u3089\u306A\u3044";
    else if (apps.some((a) => a.signature.kind !== expected)) error = `.app \u306E\u7F72\u540D\u304C ${expected} \u3067\u306A\u3044`;
    const result = {
      ok: error === null,
      ...error ? { error } : {},
      project,
      signing: config.signingMode,
      updaterKey: Boolean(config.updaterKeyPath),
      cli: cli.label,
      tauriArgs: [...cli.args, ...args3],
      targetDir,
      log: logPath,
      artifacts,
      durationMs: Date.now() - started
    };
    say(error ? `\u7D42\u308F\u3063\u305F\uFF08\u5931\u6557: ${error}\uFF09` : `\u7D42\u308F\u3063\u305F: \u6210\u679C\u7269 ${artifacts.length} \u4EF6`);
    return { exitCode: error ? EXIT.FAIL : EXIT.OK, result };
  } finally {
    for (const s of signals) process.removeListener(s, onSignal);
    process.removeListener("exit", held.release);
    held.release();
  }
}

// tools/macbuild/src/command/tauri.ts
var args2 = {
  target: { type: "string", description: "Rust \u306E target triple\uFF08aarch64-apple-darwin\u30FBx86_64-apple-darwin\u30FBuniversal-apple-darwin\uFF09\u3002\u7701\u7565\u6642\u306F host \u306E target" },
  bundles: { type: "string", description: "\u4F5C\u308B bundle \u306E\u7A2E\u985E\u3092 , \u3067\u533A\u5207\u308B\uFF08app\u30FBdmg\uFF09\u3002\u7701\u7565\u6642\u306F Tauri \u306E\u8A2D\u5B9A\u306E bundle.targets" },
  debug: { type: "boolean", description: "debug \u306E build \u306B\u3059\u308B" },
  targetDir: { type: "string", description: "cargo \u306E target \u306E dir\uFF08CARGO_TARGET_DIR \u3068\u3057\u3066\u6E21\u3059\uFF09\u3002\u7701\u7565\u6642\u306F\u74B0\u5883\u306E CARGO_TARGET_DIR \u304B cargo \u306E\u65E2\u5B9A" },
  project: { type: "positional", required: true, description: "Tauri \u306E CLI \u3092\u8D77\u52D5\u3059\u308B dir\uFF08Tauri \u306E project \u306E dir\uFF09\u3002conf \u306E\u5834\u6240\u306F Tauri \u306E CLI \u304C\u63A2\u3059\u3002\u76F8\u5BFE path \u306F\u8D77\u52D5\u3057\u305F cwd \u304B\u3089" }
};
var tauri = defineCommand({
  meta: { name: "tauri", description: "\u6307\u5B9A\u306E project \u306E dir \u3067 Tauri \u306E build\uFF08tauri build --ci\uFF09\u3092\u884C\u3044\u3001host \u306E\u8A2D\u5B9A\u306E identity \u3067\u7F72\u540D\u3059\u308B\uFF08identity \u304C\u7121\u3051\u308C\u3070 ad-hoc\uFF09\u3002identity \u306E\u6642\u3060\u3051\u3001host \u306E\u8A2D\u5B9A\u304C\u540D\u524D\u3067\u6307\u3059\u74B0\u5883\u5909\u6570\u304B\u3089\u516C\u8A3C\u306E\u8CC7\u683C\uFF08APPLE_ID\u30FBAPPLE_PASSWORD\u30FBAPPLE_TEAM_ID\u30FBAPPLE_API_KEY\u30FBAPPLE_API_ISSUER\u30FBAPPLE_API_KEY_PATH\u30FBAPPLE_PROVIDER_SHORT_NAME\uFF09\u3092 Tauri \u306B\u6E21\u3059\uFF08\u89AA\u306E\u74B0\u5883\u306E APPLE_* \u306F\u6E21\u3055\u306A\u3044\uFF09\u3002\u540C\u6642\u306B\u8D70\u308B build \u306F 1 \u672C\u3060\u3051\u3067\u3001lock \u304C\u53D6\u308C\u306A\u3051\u308C\u3070\u5F85\u305F\u305A\u306B\u7D42\u308F\u308B\uFF08\u7D42\u4E86 code 3\uFF09\u3002build \u306E\u30ED\u30B0\u306F\u79D8\u5BC6\u3092\u4F0F\u305B\u3066 file \u306B\u66F8\u304D\u3001\u305D\u306E path \u3068\u6210\u679C\u7269\u306E path\uFF08\u4F0F\u305B\u308B\u524D\u306E\u51FA\u529B\u304B\u3089\u62FE\u3046\uFF09\u30FB\u7F72\u540D\u306E\u78BA\u304B\u3081\u306E\u7D50\u679C\u3092\u51FA\u3059\u3002\u9577\u3044\u306E\u3067 superbash \u306E run_in_background \u3067\u547C\u3073\u3001\u51FA\u529B\u306E file \u3092\u5F8C\u304B\u3089\u8AAD\u3080\u3002" },
  args: args2,
  async run({ args: parsed }) {
    const { exitCode, result } = await build(valuesOf(args2, parsed), { stderr: process.stderr, env: process.env });
    writeJson(result);
    process.exitCode = exitCode;
  }
});

// tools/macbuild/src/main.ts
var main = defineCommand({
  meta: {
    name: "macbuild",
    version: "0.6.2",
    description: "mac \u3067\u3057\u304B\u51FA\u6765\u306A\u3044 build\uFF08Tauri\uFF09\u3068 codesign \u306E\u7F72\u540D\u306E\u7A93\u53E3\u3002\u7F72\u540D\u306E identity\u30FBupdater \u306E\u9375\u30FB\u516C\u8A3C\u306E\u8CC7\u683C\u306F host \u306E\u8A2D\u5B9A\u304B\u3089\u8AAD\u307F\u3001\u9053\u5177\u306E\u5F15\u6570\u306B\u3082\u51FA\u529B\u306B\u3082\u51FA\u3055\u306A\u3044\u3002"
  },
  subCommands: { help, info, tauri, sign: sign2 }
});

// tools/macbuild/src/module.ts
function toRawArgs(argv) {
  const [first] = argv;
  if (first === void 0 || first === "-h" || first === "--help") return ["help"];
  if (first === "help") return argv;
  const { names, cmd, rest } = findLeaf(main, argv, "macbuild help \u3067\u4E00\u89A7");
  return [...names, ...normalizeArgv(cmd.args, rest)];
}
async function run(rawArgs) {
  const before = process.exitCode;
  process.exitCode = void 0;
  try {
    await runCommand(main, { rawArgs: toRawArgs(rawArgs) });
    return Number(process.exitCode ?? EXIT.OK);
  } catch (e) {
    const code = typeof e?.exitCode === "number" ? e.exitCode : e?.name === "CLIError" ? EXIT.USAGE : EXIT.FAIL;
    const message = String(e?.message ?? e);
    process.stderr.write(`macbuild: ${message}
`);
    if (code !== EXIT.USAGE) writeJson({ ok: false, error: message });
    return code;
  } finally {
    process.exitCode = before;
  }
}
export {
  main,
  run
};
