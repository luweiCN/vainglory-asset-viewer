const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit,
  exportProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_static_pfx_runtime_field_bridge_audit");

const nativeEffectRuntimeSchema = {
  items: [
    {
      typeName: "StaticPfx",
      fieldIndex: 0,
      fieldOffset: "0x0",
      nextFieldOffset: "0x28",
      fieldSpan: "0x28",
      typePointerSymbol: "PTR_DAT_101872c98",
    },
    {
      typeName: "StaticPfx",
      fieldIndex: 1,
      fieldOffset: "0x28",
      nextFieldOffset: "0x30",
      fieldSpan: "0x8",
      typePointerSymbol: "PTR_DAT_101873138",
    },
    {
      typeName: "StaticPfx",
      fieldIndex: 2,
      fieldOffset: "0x30",
      nextFieldOffset: "0x38",
      fieldSpan: "0x8",
      typePointerSymbol: "PTR_DAT_101873138",
    },
    {
      typeName: "LevelVisuals",
      fieldIndex: 10,
      fieldOffset: "0x50",
      nextFieldOffset: "0x58",
      fieldSpan: "0x8",
      typePointerSymbol: "PTR_DAT_101873138",
    },
  ],
};

const currentLevelVisualsSchemaAudit = {
  fields: [
    { fieldOffsetHex: "0x20", typeName: "StaticPfx**" },
    { fieldOffsetHex: "0x50", typeName: "char*" },
  ],
};

const staticPfxOwnerAudit = {
  summary: {
    x19StaticPfxResolvedRows: 3,
    managerEntryOwnerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
  },
  items: [
    {
      levelVisualsFieldOffsetHex: "0x20",
      levelVisualsFieldTypeName: "StaticPfx**",
      x19StaticPfxResolved: true,
    },
  ],
};

const staticPfxHandlerDisassembly = `
  8ccd14: sub sp, sp, #0xd0
  8ccd50: mov x19, x1
  8ccd60: mov x20, x0
  8ccef4: bl 0x188b8b8
  8ccef8: mov x20, x0
  8ccf00: ldr x1, [x19, #0x28]
  8ccf04: mov x0, x20
  8ccf08: mov w2, wzr
  8ccf0c: bl 0x8d42b4
  8ccf28: ldr x0, [x19, #0x30]
  8ccf2c: bl 0xd6d6e0
  8ccf34: ldr x19, [x19, #0x30]
  8ccf50: bl 0x821104
  8ccf54: mov w1, w0
  8ccf58: mov x0, x20
  8ccf5c: bl 0x8d44e4
  8ccf60: mov x0, x20
  8ccf64: bl 0x8d44ec
  8ccf98: ret
`;

const resourceSetterDisassembly = `
  8d42b4: stp x20, x19, [sp, #-0x20]!
  8d42c0: mov x20, x1
  8d42c4: mov x19, x0
  8d435c: mov x0, x20
  8d4360: bl 0x8d4378
  8d4364: str x0, [x19, #0x50]
  8d4374: b 0x8d4198
`;

const parameterSetterDisassembly = `
  8d44e4: str w1, [x0, #0xb4]
  8d44e8: ret
`;

const activationDisassembly = `
  8d44ec: ldr x0, [x0, #0x50]
  8d44f0: cbz x0, 0x8d44f8
  8d44f4: b 0xe39570
  8d44f8: ret
`;

function disassembleFunction(addressHex) {
  if (addressHex === "0x8ccd14") return staticPfxHandlerDisassembly;
  if (addressHex === "0x8d42b4") return resourceSetterDisassembly;
  if (addressHex === "0x8d44e4") return parameterSetterDisassembly;
  if (addressHex === "0x8d44ec") return activationDisassembly;
  return "";
}

test("static pfx runtime field bridge proves char key routing into layout-B runtime fields without render promotion", () => {
  const audit = buildProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
    nativeEffectRuntimeSchema,
    currentLevelVisualsSchemaAudit,
    staticPfxOwnerAudit,
    disassembleFunction,
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 3);
  assert.equal(audit.summary.staticPfxCharFieldRows, 2);
  assert.equal(audit.summary.staticPfxOwnerResolvedRows, 1);
  assert.equal(audit.summary.resourceKeyToObject50ResolvedRows, 1);
  assert.equal(audit.summary.parameterKeyToObjectB4ResolvedRows, 1);
  assert.equal(audit.summary.object50ActivationRows, 1);
  assert.equal(audit.summary.managerEntryOwnerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const resourceRow = audit.items.find((item) => item.bridgeKind === "resource-key-to-object50");
  assert.equal(resourceRow.staticPfxFieldOffsetHex, "0x28");
  assert.equal(resourceRow.staticPfxFieldTypeName, "char*");
  assert.equal(resourceRow.runtimeObjectWriteOffsetHex, "0x50");
  assert.equal(resourceRow.bridgeResolved, true);

  const parameterRow = audit.items.find((item) => item.bridgeKind === "parameter-key-to-object-b4");
  assert.equal(parameterRow.staticPfxFieldOffsetHex, "0x30");
  assert.equal(parameterRow.staticPfxFieldTypeName, "char*");
  assert.equal(parameterRow.runtimeObjectWriteOffsetHex, "0xb4");
  assert.equal(parameterRow.bridgeResolved, true);

  const activationRow = audit.items.find((item) => item.bridgeKind === "object50-activation-only");
  assert.equal(activationRow.runtimeObjectReadOffsetHex, "0x50");
  assert.equal(activationRow.activationTargetHex, "0xe39570");
  assert.equal(activationRow.renderPromotionAllowed, false);
});

test("static pfx runtime field bridge exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-pfx-runtime-field-bridge-"));
  const nativeEffectRuntimeSchemaPath = path.join(tempDir, "native-effect-runtime-schema.json");
  const currentLevelVisualsSchemaAuditPath = path.join(tempDir, "current-native-levelvisuals-schema.json");
  const staticPfxOwnerAuditPath = path.join(tempDir, "static-pfx-owner.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const reportOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  fs.writeFileSync(nativeEffectRuntimeSchemaPath, JSON.stringify(nativeEffectRuntimeSchema));
  fs.writeFileSync(currentLevelVisualsSchemaAuditPath, JSON.stringify(currentLevelVisualsSchemaAudit));
  fs.writeFileSync(staticPfxOwnerAuditPath, JSON.stringify(staticPfxOwnerAudit));

  const audit = exportProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
    nativeEffectRuntimeSchemaPath,
    currentLevelVisualsSchemaAuditPath,
    staticPfxOwnerAuditPath,
    disassembleFunction,
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 3);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /resource-key-to-object50/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /parameter-key-to-object-b4/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].renderPromotionAllowed, "false");
}
);
