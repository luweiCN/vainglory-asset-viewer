const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildAudit } = require("../tools/material_render_state_audit");

function writeRuntimeSortOwnerAudit(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        summary: {
          sceneEntityRuntimeParamSourceTableMountRecovered: true,
          sceneEntityRuntimeParamDynamicSourceTableProducerRecovered: true,
          sceneEntityRuntimeParamDynamicSourceTableUpstreamSelectionRecovered: true,
          sceneEntityRuntimeParamDynamicSourceTableSelectorCallsiteRecovered: true,
          sceneEntityRuntimeParamDynamicSourceTableSelectorTypeIndicesRecovered: true,
          sceneEntityRuntimeParamSourceTableProgramRecovered: true,
          sceneEntityRuntimeParamSortKeyFormulaRecovered: true,
          renderCommandQueueSortKeyRecovered: true,
        },
        sceneEntityRuntimeParamEvidence: {
          returnedObject: {
            sourceTableProgramPath: {
              constructorSourceTableLoadHex: "0x189f91c",
              constructorSourceEntryLoadHex: "0x189f930",
            },
          },
          queuedCommandSortKey: {
            sortAndReappendHex: "0x18a1698",
            keyLoadHex: "0x18a16e4",
            pairStoreHex: "0x18a16e8",
            sortCallHex: "0x18a1700",
            reappendCallHex: "0x18a1718",
            partitionFunctionHex: "0x18a1750",
          },
        },
      },
      null,
      2,
    ),
  );
}

test("material render-state audit keeps TCH0 word2 diagnostic when runtime queue sort key is recovered", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-render-state-"));
  const renderOwnerAuditPath = path.join(tempDir, "owner.json");
  writeRuntimeSortOwnerAudit(renderOwnerAuditPath);

  const audit = buildAudit(
    {
      items: [
        {
          rel: "Characters/HeroA/Art/hero_a.glb",
          modelLabel: "HeroA_DefaultSkin",
          character: "HeroA",
          materialIndex: "0",
          materialName: "body",
          shadergraphRel: "Characters/HeroA/Art/hero_a.body.shadergraph",
          shaderPassStateFamily: "state-9f003100",
          shaderPassStateSignatures: "9f003100/07000000/22000000/00010000",
          shaderPassStateWord0s: "9f003100",
          shaderPassStateWord1s: "07000000",
          shaderPassStateWord2s: "22000000",
          shaderPassStateWord3s: "00010000",
          shaderPassRenderState: JSON.stringify({ states: [{ cullModeIndex: 0, colorMask: { r: true, g: true, b: true, a: true } }] }),
        },
      ],
    },
    {
      currentAndroidBinary: path.join(tempDir, "missing.so"),
      renderOwnerAuditPath,
    },
  );

  assert.equal(audit.summary.rowsWithStaticWord2Values, 1);
  assert.equal(audit.summary.rowsWithUnresolvedRenderOrderWords, 0);
  assert.equal(audit.summary.rowsWhereRuntimeSortKeySupersedesStaticWord2, 1);
  assert.equal(
    audit.summary.staticWord2RenderOrderBoundary.status,
    "runtime-sort-key-recovered-static-word2-not-render-order-proof",
  );
  assert.equal(audit.summary.word2RenderOrderTakeoverAllowed, false);
  assert.equal(audit.items[0].renderOrderEvidenceStatus, "static-word2-not-proven-render-order-word3-parser-counts");
  assert.equal(audit.items[0].word2EvidenceStatus, "static-tch0-word2-no-draw-sort-consumer-in-pass-chain");
});
