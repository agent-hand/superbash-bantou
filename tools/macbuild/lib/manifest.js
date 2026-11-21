'use strict';
// .manifest/toolconfig.json（定義の正本）を読む。
// toolset でも superbash が生成した package でも、tools/macbuild/ から見て ../../.manifest/ にある。

const fs = require('node:fs');
const path = require('node:path');

const TOOL = 'macbuild';
const MANIFEST_PATH = path.resolve(__dirname, '..', '..', '..', '.manifest', 'toolconfig.json');

function loadManifest(file = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** この tool（macbuild）の command だけを、定義の形のまま返す。 */
function toolCommands(manifest = loadManifest()) {
  return (manifest.commands || []).filter((c) => c.tool === TOOL);
}

module.exports = { TOOL, MANIFEST_PATH, loadManifest, toolCommands };
