const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeDefinitionShaderParamStaticStringAudit,
  exportCurrentNativeDefinitionShaderParamStaticStringAudit,
} = require("../tools/current_native_definition_shaderparam_static_string_audit");

function writeDefinitionStrings(tempDir) {
  const filePath = path.join(tempDir, "definition_instance_strings.tsv");
  const lines = [
    [
      "relativePath",
      "hash",
      "blockIndex",
      "definitionFormatByte",
      "definitionVersionByte",
      "payloadSize",
      "stringIndex",
      "payloadOffset",
      "semantic",
      "labelBefore",
      "value",
      "resourceCategory",
      "targetRelativePath",
      "targetBuildPath",
    ].join("\t"),
    [
      "Characters/Test/Test.def",
      "HASH",
      "0",
      "4",
      "8",
      "100",
      "0",
      "",
      "",
      "",
      "u_color",
      "",
      "",
      "",
    ].join("\t"),
    [
      "Characters/Test/Test.def",
      "HASH",
      "0",
      "4",
      "8",
      "100",
      "1",
      "",
      "resource",
      "MESH",
      "build://Characters/Test/Art/test.mesh",
      "mesh",
      "Characters/Test/Art/test.mesh",
      "build://Characters/Test/Art/test.mesh",
    ].join("\t"),
    [
      "Characters/Test/Test.def",
      "HASH",
      "0",
      "4",
      "8",
      "100",
      "2",
      "",
      "",
      "",
      "sampler12",
      "",
      "",
      "",
    ].join("\t"),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  return filePath;
}

test("definition shaderparam static string audit reports static candidates without ownership promotion", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-shaderparam-"));
  const definitionStringsPath = writeDefinitionStrings(tempDir);
  const manifest = buildCurrentNativeDefinitionShaderParamStaticStringAudit({ definitionStringsPath });

  assert.equal(manifest.summary.definitionStringRows, 3);
  assert.equal(manifest.summary.shaderUniformNameStringRows, 1);
  assert.equal(manifest.summary.uniqueShaderUniformNameRows, 1);
  assert.equal(manifest.summary.nativeSamplerNameStringRows, 1);
  assert.equal(manifest.summary.meshResourceRows, 1);
  assert.equal(manifest.summary.staticShaderUniformNamesRecovered, true);
  assert.equal(manifest.summary.structuredShaderParamsOwnershipRecovered, false);
  assert.equal(manifest.summary.sourceProgramStaticReplacementAllowed, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeDefinitionShaderParamStaticStringAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-shaderparam-out-"));
  const definitionStringsPath = writeDefinitionStrings(tempDir);
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  const summary = exportCurrentNativeDefinitionShaderParamStaticStringAudit({
    definitionStringsPath,
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.shaderUniformNameStringRows, 1);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.nativeSamplerNameStringRows, 1);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /u_color/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /sampler12/);
});
