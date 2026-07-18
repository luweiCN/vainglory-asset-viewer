const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeParticleCallbackSemanticsManifest,
  classifyCallbackSource,
  classifyCallbackDisassembly,
  reportRowsForManifest,
  summarizeCallbackSemantics,
} = require("../tools/native_particle_callback_semantics");

function fakeElf64WithLoadSegment({ virtualAddress, fileOffset, bytes }) {
  const segmentSize = Math.max(0x800, bytes.length + 0x500);
  const buffer = Buffer.alloc(fileOffset + segmentSize);
  buffer.write("\x7fELF", 0, "binary");
  buffer[4] = 2; // ELF64
  buffer[5] = 1; // little-endian
  buffer.writeBigUInt64LE(0x40n, 0x20);
  buffer.writeUInt16LE(56, 0x36);
  buffer.writeUInt16LE(1, 0x38);

  const ph = 0x40;
  buffer.writeUInt32LE(1, ph); // PT_LOAD
  buffer.writeBigUInt64LE(BigInt(fileOffset), ph + 8);
  buffer.writeBigUInt64LE(BigInt(virtualAddress), ph + 16);
  buffer.writeBigUInt64LE(BigInt(segmentSize), ph + 32);
  buffer.writeBigUInt64LE(BigInt(segmentSize), ph + 40);
  bytes.copy(buffer, fileOffset + 0x490);
  return buffer;
}

function fakeFatMachO64WithLoadSegment({ virtualAddress, bytes, encrypted = false }) {
  const sliceOffset = 0x1000;
  const segmentVirtualAddress = Math.floor(virtualAddress / 0x1000) * 0x1000;
  const dataOffset = virtualAddress - segmentVirtualAddress;
  const segmentSize = Math.max(0x8000, dataOffset + bytes.length + 0x100);
  const buffer = Buffer.alloc(sliceOffset + segmentSize);

  buffer.writeUInt32BE(0xcafebabe, 0);
  buffer.writeUInt32BE(1, 4);
  buffer.writeUInt32BE(0x0100000c, 8); // arm64
  buffer.writeUInt32BE(0, 12);
  buffer.writeUInt32BE(sliceOffset, 16);
  buffer.writeUInt32BE(segmentSize, 20);
  buffer.writeUInt32BE(12, 24);

  buffer.writeUInt32LE(0xfeedfacf, sliceOffset);
  buffer.writeUInt32LE(0x0100000c, sliceOffset + 4);
  buffer.writeUInt32LE(0, sliceOffset + 8);
  buffer.writeUInt32LE(2, sliceOffset + 12);
  buffer.writeUInt32LE(encrypted ? 2 : 1, sliceOffset + 16);
  buffer.writeUInt32LE(encrypted ? 96 : 72, sliceOffset + 20);

  const lc = sliceOffset + 32;
  buffer.writeUInt32LE(0x19, lc); // LC_SEGMENT_64
  buffer.writeUInt32LE(72, lc + 4);
  buffer.write("__DATA", lc + 8, "ascii");
  buffer.writeBigUInt64LE(BigInt(segmentVirtualAddress), lc + 24);
  buffer.writeBigUInt64LE(BigInt(segmentSize), lc + 32);
  buffer.writeBigUInt64LE(0n, lc + 40);
  buffer.writeBigUInt64LE(BigInt(segmentSize), lc + 48);

  if (encrypted) {
    const encryptionCommand = lc + 72;
    buffer.writeUInt32LE(0x2c, encryptionCommand); // LC_ENCRYPTION_INFO_64
    buffer.writeUInt32LE(24, encryptionCommand + 4);
    buffer.writeUInt32LE(0, encryptionCommand + 8);
    buffer.writeUInt32LE(segmentSize, encryptionCommand + 12);
    buffer.writeUInt32LE(1, encryptionCommand + 16);
  }

  bytes.copy(buffer, sliceOffset + dataOffset);
  return buffer;
}

test("classifyCallbackDisassembly detects scalar constant stores", () => {
  const classification = classifyCallbackDisassembly([
    "114a87c: 320203e8     orr w8, wzr, #0x40000000",
    "114a880: 320003e0     orr w0, wzr, #0x1",
    "114a884: b9000028     str w8, [x1]",
    "114a888: d65f03c0     ret",
  ]);

  assert.deepEqual(classification, {
    semanticClass: "constant-scalar-store",
    returnValue: 1,
    outputStore: "w8-to-x1",
    immediateBits: "0x40000000",
  });
});

test("classifyCallbackDisassembly detects zero vector stores", () => {
  const classification = classifyCallbackDisassembly([
    "114a898: 320003e0     orr w0, wzr, #0x1",
    "114a89c: f900003f     str xzr, [x1]",
    "114a8a0: b900083f     str wzr, [x1, #0x8]",
    "114a8a4: d65f03c0     ret",
  ]);

  assert.equal(classification.semanticClass, "constant-zero-vector3-store");
  assert.equal(classification.outputStore, "zero-to-x1-12");
});

test("classifyCallbackDisassembly reads q0 vector constants from ELF load segments", () => {
  const vectorBytes = Buffer.alloc(16);
  vectorBytes.writeFloatLE(1, 0);
  vectorBytes.writeFloatLE(0, 4);
  vectorBytes.writeFloatLE(0, 8);
  vectorBytes.writeFloatLE(1, 12);
  const binaryBuffer = fakeElf64WithLoadSegment({
    virtualAddress: 0x1af9000,
    fileOffset: 0x200,
    bytes: vectorBytes,
  });

  const classification = classifyCallbackDisassembly(
    [
      "156b73c: d0002c68     adrp x8, 0x1af9000",
      "156b740: 3dc12500     ldr q0, [x8, #0x490]",
      "156b744: 320003e0     orr w0, wzr, #0x1",
      "156b748: 3d800020     str q0, [x1]",
      "156b74c: d65f03c0     ret",
    ],
    { binaryBuffer },
  );

  assert.deepEqual(classification, {
    semanticClass: "constant-vector4-load-store",
    returnValue: 1,
    outputStore: "q0-to-x1",
    vectorSourceAddress: "0x1af9490",
    vectorValues: [1, 0, 0, 1],
  });
});

test("classifyCallbackDisassembly reads d0 vector constants from fmov immediates", () => {
  const classification = classifyCallbackDisassembly([
    "f04000: 0f02f4c0     fmov v0.2s, #6.00000000",
    "f04004: 320003e0     orr w0, wzr, #0x1",
    "f04008: fd000020     str d0, [x1]",
    "f0400c: d65f03c0     ret",
  ]);

  assert.deepEqual(classification, {
    semanticClass: "constant-vector2-load-store",
    returnValue: 1,
    outputStore: "d0-to-x1",
    vectorValues: [6, 6],
  });
});

test("classifyCallbackDisassembly reads d0 vector constants from duplicated float bits", () => {
  const classification = classifyCallbackDisassembly([
    "10f6004: 52866668     mov w8, #0x3333             // =13107",
    "10f6008: 72a7f668     movk w8, #0x3fb3, lsl #16",
    "10f600c: 0e040d00     dup v0.2s, w8",
    "10f6010: 320003e0     orr w0, wzr, #0x1",
    "10f6014: fd000020     str d0, [x1]",
    "10f6018: d65f03c0     ret",
  ]);

  assert.deepEqual(classification, {
    semanticClass: "constant-vector2-load-store",
    returnValue: 1,
    outputStore: "d0-to-x1",
    vectorValues: [1.4, 1.4],
  });
});

test("classifyCallbackDisassembly reads d0 vector constants from shifted movi float bits", () => {
  const classification = classifyCallbackDisassembly([
    "1132f40: 0f04f400     movi v0.2s, #0x40, lsl #24",
    "1132f44: 320003e0     orr w0, wzr, #0x1",
    "1132f48: fd000020     str d0, [x1]",
    "1132f4c: d65f03c0     ret",
  ]);

  assert.deepEqual(classification, {
    semanticClass: "constant-vector2-load-store",
    returnValue: 1,
    outputStore: "d0-to-x1",
    vectorValues: [2, 2],
  });
});

test("classifyCallbackDisassembly reads d0 vector constants from ELF load segments", () => {
  const vectorBytes = Buffer.alloc(8);
  vectorBytes.writeFloatLE(1.25, 0);
  vectorBytes.writeFloatLE(3.5, 4);
  const binaryBuffer = fakeElf64WithLoadSegment({
    virtualAddress: 0x1afd000,
    fileOffset: 0x200,
    bytes: vectorBytes,
  });

  const classification = classifyCallbackDisassembly(
    [
      "1133048: 9002fe88     adrp x8, 0x1afd000",
      "113304c: fd436500     ldr d0, [x8, #0x490]",
      "1133050: 320003e0     orr w0, wzr, #0x1",
      "1133054: fd000020     str d0, [x1]",
      "1133058: d65f03c0     ret",
    ],
    { binaryBuffer },
  );

  assert.deepEqual(classification, {
    semanticClass: "constant-vector2-load-store",
    returnValue: 1,
    outputStore: "d0-to-x1",
    vectorSourceAddress: "0x1afd490",
    vectorValues: [1.25, 3.5],
  });
});

test("classifyCallbackSource detects scalar constants from Ghidra source", () => {
  const classification = classifyCallbackSource(`
undefined8 FUN_100bc0028(undefined8 param_1,undefined4 *param_2)

{
  *param_2 = 0x3f800000;
  return 1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "constant-scalar-store",
    returnValue: 1,
    outputStore: "source-immediate-to-param2",
    immediateBits: "0x3f800000",
  });
});

test("classifyCallbackSource detects Android memset zero scalar arrays from Ghidra source", () => {
  const classification = classifyCallbackSource(`
int FUN_0158dd40(int param_1,void *param_2)

{
  if (0 < (int)param_1) {
    memset(param_2,0,(ulong)param_1 << 2);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "constant-zero-scalar-store",
    returnValue: null,
    outputStore: "zero-to-param2-array",
  });
});

test("classifyCallbackSource detects iOS bzero zero scalar arrays from Ghidra source", () => {
  const classification = classifyCallbackSource(`
ulong FUN_100709d60(ulong param_1,void *param_2)

{
  if (0 < (int)param_1) {
    _bzero(param_2,(param_1 & 0xffffffff) << 2);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "constant-zero-scalar-store",
    returnValue: null,
    outputStore: "zero-to-param2-array",
  });
});

test("classifyCallbackSource extracts affine random scalar ranges from Ghidra source", () => {
  const classification = classifyCallbackSource(`
undefined8 FUN_100819040(uint param_1,float *param_2)

{
  int iVar2;
  uint uVar3;

  uVar3 = param_1;
  if (0 < (int)param_1) {
    do {
      iVar2 = _rand();
      *param_2 = (float)iVar2 * 1.1641532e-10 + 1.0;
      uVar3 = uVar3 - 1;
      param_2 = param_2 + 1;
    } while (uVar3 != 0);
  }
  return 1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: 1,
    outputStore: "random-affine-to-param2",
    dependencyFlags: ["random"],
    randomScale: 1.1641532e-10,
    randomBase: 1,
    randomMinValue: 1,
    randomMaxValue: 1.25,
  });
});

test("classifyCallbackSource extracts packed vector2 affine random ranges from Ghidra source", () => {
  const classification = classifyCallbackSource(`
int FUN_014d16ac(int param_1,undefined8 *param_2)

{
  int iVar1;
  int iVar2;
  int iVar3;
  undefined8 uVar4;

  iVar1 = param_1;
  if (0 < param_1) {
    do {
      iVar2 = rand();
      iVar3 = rand();
      uVar4 = NEON_scvtf(CONCAT44(iVar3,iVar2),4);
      iVar1 = iVar1 + -1;
      *param_2 = CONCAT44((float)((ulong)uVar4 >> 0x20) * 4.656613e-10 * 2.0 + 5.0,
                          (float)uVar4 * 4.656613e-10 * 0.4 + 0.1);
      param_2 = param_2 + 1;
    } while (iVar1 != 0);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "random-affine-vector2-to-param2",
    randomScale: 1.8626452e-10,
    randomBase: 0.1,
    randomMinValue: 0.1,
    randomMaxValue: 0.5,
    vectorRandomMinValues: [0.1, 5],
    vectorRandomMaxValues: [0.5, 7],
  });
});

test("classifyCallbackSource extracts scale-only random scalar ranges from Ghidra source", () => {
  const classification = classifyCallbackSource(`
ulong FUN_100b3c354(ulong param_1,float *param_2)

{
  uint uVar1;
  int iVar2;
  ulong uVar3;

  uVar3 = param_1;
  if (0 < (int)param_1) {
    do {
      iVar2 = _rand();
      *param_2 = (float)iVar2 * 1.8626451e-09;
      uVar1 = (int)uVar3 - 1;
      param_2 = param_2 + 1;
      uVar3 = (ulong)uVar1;
    } while (uVar1 != 0);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "random-affine-to-param2",
    dependencyFlags: ["random"],
    randomScale: 1.8626451e-9,
    randomBase: 0,
    randomMinValue: 0,
    randomMaxValue: 4,
  });
});

test("classifyCallbackSource extracts param3 random scalar ranges from Ghidra source", () => {
  const classification = classifyCallbackSource(`
void FUN_100f963c4(float param_1,uint param_2,float *param_3,ushort *param_4,long param_5)

{
  int iVar3;
  ulong uVar4;

  if (0 < (int)param_2) {
    uVar4 = param_2 & 0xffffffff;
    do {
      iVar3 = _rand();
      *param_3 = (float)iVar3 * 4.656613e-10;
      param_3[1] = 0.0;
      param_3[2] = 0.0;
      uVar4 = uVar4 - 1;
      param_3 = param_3 + 3;
    } while (uVar4 != 0);
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "random-affine-to-param3",
    dependencyFlags: ["random", "particle-index-array", "particle-source-array"],
    randomScale: 4.656613e-10,
    randomBase: 0,
    randomMinValue: 0,
    randomMaxValue: 1,
  });
});

test("classifyCallbackSource records computed scalar writes to param3 when range is not yet recoverable", () => {
  const classification = classifyCallbackSource(`
void FUN_1006c1610(float param_1,uint param_2,float *param_3,ushort *param_4,long param_5)

{
  uint uVar2;
  float fVar6;
  float fVar7;

  if (0 < (int)param_2) {
    do {
      fVar7 = 1.0;
      fVar6 = -1.0;
      *param_3 = fVar6 * 250.0 * fVar7;
      param_4 = param_4 + 1;
      uVar2 = param_2 - 1;
      param_3 = param_3 + 1;
    } while (uVar2 != 0);
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "computed-scalar-to-param3",
    dependencyFlags: ["particle-index-array", "particle-source-array"],
  });
});

test("classifyCallbackSource records half-float unpack vector writes without treating them as size ranges", () => {
  const classification = classifyCallbackSource(`
void FUN_1010aafb0(float *param_1,ushort *param_2)

{
  ushort uVar2;
  float fVar4;

  uVar2 = *param_2;
  fVar4 = (float)(uVar2 & 0x3ff);
  *param_1 = fVar4;
  uVar2 = param_2[1];
  fVar4 = (float)(uVar2 & 0x3ff);
  param_1[1] = fVar4;
  param_1[7] = 0.0;
  uVar2 = param_2[8];
  fVar4 = (float)(uVar2 & 0x3ff);
  param_1[8] = fVar4;
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "half-float-unpack-vector-to-param1",
  });
});

test("classifyCallbackSource records helper dispatch writes to strided param2 outputs", () => {
  const classification = classifyCallbackSource(`
void FUN_1010c25ac(short *param_1,long param_2)

{
  if (*param_1 != 0) {
    (*DAT_101dc1d48)(param_1,param_2);
  }
  if (param_1[0x10] != 0) {
    (*DAT_101dc1d48)(param_1 + 0x10,param_2 + 4);
  }
  if (param_1[0x20] != 0) {
    (*DAT_101dc1d48)(param_1 + 0x20,param_2 + 0x80);
  }
  if (param_1[0x30] != 0) {
    (*DAT_101dc1d48)(param_1 + 0x30,param_2 + 0x84);
    return;
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "helper-dispatch-to-param2-strided",
    dependencyFlags: ["data-symbol", "curve-or-table-data"],
  });
});

test("classifyCallbackSource orders random scalar ranges when scale is negative", () => {
  const classification = classifyCallbackSource(`
int FUN_1006c2dd0(int param_1,float *param_2)

{
  int iVar2;
  if (0 < param_1) {
    do {
      iVar2 = _rand();
      *param_2 = (float)iVar2 * -2.3283064e-10 + 0.3;
      param_1 = param_1 + -1;
      param_2 = param_2 + 1;
    } while (param_1 != 0);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "random-affine-to-param2",
    dependencyFlags: ["random"],
    randomScale: -2.3283064e-10,
    randomBase: 0.3,
    randomMinValue: -0.2,
    randomMaxValue: 0.3,
  });
});

test("classifyCallbackSource multiplies chained random scalar factors from Ghidra source", () => {
  const classification = classifyCallbackSource(`
int FUN_010000cc(int param_1,float *param_3)

{
  int iVar2;
  if (0 < param_1) {
    do {
      iVar2 = rand();
      *param_3 = (float)iVar2 * 4.656613e-10 * 0.5 + 0.5;
      param_1 = param_1 + -1;
      param_3 = param_3 + 1;
    } while (param_1 != 0);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "random-affine-to-param3",
    randomScale: 2.3283065e-10,
    randomBase: 0.5,
    randomMinValue: 0.5,
    randomMaxValue: 1,
  });
});

test("classifyCallbackSource extracts memset pattern16 references from Ghidra source", () => {
  const classification = classifyCallbackSource(`
ulong FUN_100bc0028(ulong param_1,void *param_2)

{
  if (0 < (int)param_1) {
    _memset_pattern16(param_2,&DAT_01af9490,(param_1 & 0xffffffff) << 2);
  }
  return param_1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "constant-pattern16-store",
    returnValue: null,
    outputStore: "pattern16-to-param2",
    dependencyFlags: ["data-symbol", "pattern16-data", "curve-or-table-data"],
    pattern16Symbol: "DAT_01af9490",
    pattern16SourceAddress: "0x1af9490",
  });
});

test("classifyCallbackSource detects NEON fmov vector constants from Ghidra source", () => {
  const classification = classifyCallbackSource(`
undefined8 FUN_100bc0028(undefined8 param_1,undefined8 *param_2)

{
  undefined1 auVar1 [16];

  auVar1 = NEON_fmov(0x3f800000,4);
  param_2[1] = auVar1._8_8_;
  *param_2 = auVar1._0_8_;
  return 1;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "constant-vector4-load-store",
    returnValue: 1,
    outputStore: "source-neon-fmov-to-param2",
    vectorValues: [1, 1, 1, 1],
  });
});

test("classifyCallbackSource keeps computed callbacks but records direct first component constants", () => {
  const classification = classifyCallbackSource(`
void FUN_100b3b1f0(float param_1,uint param_2,undefined8 *param_3,ushort *param_4,long param_5)

{
  if (0 < (int)param_2) {
    do {
      *param_3 = 0x3f800000;
      *(undefined4 *)(param_3 + 1) = 0;
      param_3 = param_3 + 2;
    } while (param_2 != 0);
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "source-first-component-constant-to-param3",
    dependencyFlags: ["particle-index-array", "particle-source-array"],
    firstComponentBits: "0x3f800000",
    firstComponentValue: 1,
  });
});

test("classifyCallbackSource keeps computed callbacks but records packed64 first component constants", () => {
  const classification = classifyCallbackSource(`
void FUN_100e237ec(int param_1,undefined8 *param_2)

{
  if (0 < param_1) {
    do {
      *param_2 = 0x4248000043160000;
      param_1 = param_1 + -1;
      param_2 = param_2 + 1;
    } while (param_1 != 0);
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "source-packed64-first-component-to-param2",
    firstComponentBits: "0x43160000",
    firstComponentValue: 150,
  });
});

test("classifyCallbackSource keeps computed callbacks but records NEON first component constants", () => {
  const classification = classifyCallbackSource(`
void FUN_100ecae20(float param_1,uint param_2,undefined8 *param_3,ushort *param_4,long param_5)

{
  undefined8 uVar4;
  uVar4 = NEON_fmov(0x3fc00000,4);
  if (0 < (int)param_2) {
    do {
      *param_3 = uVar4;
      *(undefined4 *)(param_3 + 1) = 0x3f800000;
      param_3 = param_3 + 2;
    } while (param_2 != 0);
  }
  return;
}
`);

  assert.deepEqual(classification, {
    semanticClass: "computed-callback",
    returnValue: null,
    outputStore: "source-neon-fmov-first-component-to-param3",
    dependencyFlags: ["particle-index-array", "particle-source-array"],
    firstComponentBits: "0x3fc00000",
    firstComponentValue: 1.5,
  });
});

test("buildNativeParticleCallbackSemanticsManifest classifies Mach-O callbacks from matching Ghidra source", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-source-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
void FUN_100bbffff(void)

{
  FUN_100bc0040(0,0);
  return;
}




undefined8 FUN_100bc0028(undefined8 param_1,undefined4 *param_2)

{
  *param_2 = 0x3f800000;
  return 1;
}
`,
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath: path.join(tempDir, "missing-mach-o"),
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0028" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.deepEqual(manifest.items, [
    {
      callbackAddress: "0x100bc0028",
      semanticClass: "constant-scalar-store",
      keyCount: 1,
      sampleKeys: ["0x20"],
      instructionSummary: "*param_2 = 0x3f800000; return 1;",
      returnValue: 1,
      outputStore: "source-immediate-to-param2",
      immediateBits: "0x3f800000",
      semanticEvidenceSource: "ghidra-source",
      sourceFunction: "FUN_100bc0028",
      sourcePath: path.join(sourceDir, "100bc.c"),
    },
  ]);
  assert.equal(manifest.summary.callbacks, 1);
  assert.deepEqual(manifest.summary.bySemanticClass, { "constant-scalar-store": 1 });
});

test("buildNativeParticleCallbackSemanticsManifest reads pattern16 floats from ELF load segments", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-pattern16-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
ulong FUN_100bc0028(ulong param_1,void *param_2)

{
  if (0 < (int)param_1) {
    _memset_pattern16(param_2,&DAT_01af9490,(param_1 & 0xffffffff) << 2);
  }
  return param_1;
}
`,
  );
  const patternBytes = Buffer.alloc(16);
  patternBytes.writeFloatLE(2.5, 0);
  patternBytes.writeFloatLE(2.5, 4);
  patternBytes.writeFloatLE(2.5, 8);
  patternBytes.writeFloatLE(2.5, 12);
  const binaryPath = path.join(tempDir, "libGameKindred.so");
  fs.writeFileSync(
    binaryPath,
    fakeElf64WithLoadSegment({
      virtualAddress: 0x1af9000,
      fileOffset: 0x200,
      bytes: patternBytes,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0028" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.deepEqual(manifest.items[0], {
    callbackAddress: "0x100bc0028",
    semanticClass: "constant-pattern16-store",
    keyCount: 1,
    sampleKeys: ["0x20"],
    instructionSummary:
      "if (0 < (int)param_1) { _memset_pattern16(param_2,&DAT_01af9490,(param_1 & 0xffffffff) << 2); return param_1;",
    outputStore: "pattern16-to-param2",
    dependencyFlags: ["data-symbol", "pattern16-data", "curve-or-table-data"],
    pattern16Symbol: "DAT_01af9490",
    pattern16SourceAddress: "0x1af9490",
    pattern16FloatValues: [2.5, 2.5, 2.5, 2.5],
    semanticEvidenceSource: "ghidra-source",
    sourceFunction: "FUN_100bc0028",
    sourcePath: path.join(sourceDir, "100bc.c"),
  });
});

test("buildNativeParticleCallbackSemanticsManifest derives curve table output ranges from ELF load segments", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-curve-table-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "012c7.c"),
    `
void FUN_012c7158(float param_1,int param_2,float *param_3)

{
  uint uVar1;
  bool bVar2;
  float fVar3;
  float fVar4;

  if (0 < param_2) {
    param_1 = param_1 - (float)(int)param_1;
    uVar1 = (int)(param_1 * 64.0) + 1;
    bVar2 = param_1 < 1.0;
    fVar3 = -0.0;
    if (bVar2) {
      fVar3 = 0.0;
    }
    if (bVar2 && 0.0 < param_1) {
      fVar3 = -0.0;
    }
    do {
      fVar4 = fVar3;
      if ((bVar2 && 0.0 < param_1) && uVar1 < 0x40) {
        fVar4 = *(float *)(&DAT_01af9490 + (ulong)(uint)(int)(param_1 * 64.0) * 4) +
                (param_1 * 64.0 - (float)(int)(param_1 * 64.0)) *
                (*(float *)(&DAT_01af9490 + (ulong)uVar1 * 4) -
                *(float *)(&DAT_01af9490 + (ulong)(uint)(int)(param_1 * 64.0) * 4));
      }
      param_2 = param_2 + -1;
      *param_3 = fVar4 * 250.0;
      param_3 = param_3 + 1;
    } while (param_2 != 0);
  }
  return;
}
`,
  );
  const curveBytes = Buffer.alloc(64 * 4);
  const curveValues = Array.from({ length: 64 }, (_, index) => (index === 0 ? 0.2 : index === 63 ? 0.6 : 0.4));
  curveValues.forEach((value, index) => curveBytes.writeFloatLE(value, index * 4));
  const binaryPath = path.join(tempDir, "libGameKindred.so");
  fs.writeFileSync(
    binaryPath,
    fakeElf64WithLoadSegment({
      virtualAddress: 0x1af9000,
      fileOffset: 0x200,
      bytes: curveBytes,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x57a2c74307d83be4", callback: "0x12c7158" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].semanticClass, "computed-callback");
  assert.equal(manifest.items[0].outputStore, "curve-table-range-to-param3");
  assert.equal(manifest.items[0].curveTableSymbol, "DAT_01af9490");
  assert.equal(manifest.items[0].curveTableSourceAddress, "0x1af9490");
  assert.equal(manifest.items[0].curveTableSampleCount, 64);
  assert.equal(manifest.items[0].curveTableMultiplier, 250);
  assert.equal(manifest.items[0].curveMinValue, 0);
  assert.equal(manifest.items[0].curveMaxValue, 150);
});

test("buildNativeParticleCallbackSemanticsManifest derives curve ranges from reversed table bounds", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-reversed-curve-bound-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "1008f.c"),
    `
void FUN_1008f787c(float param_1,uint param_2,float *param_3,ushort *param_4,long param_5)

{
  uint uVar1;
  long lVar2;
  ulong uVar3;
  float fVar4;
  float fVar5;

  if (0 < (int)param_2) {
    uVar3 = (ulong)param_2;
    do {
      lVar2 = param_5 + (ulong)*param_4 * 4;
      fVar5 = (param_1 - *(float *)(lVar2 + 0x48000)) / *(float *)(lVar2 + 0x50000);
      if (0.5 <= fVar5) {
LAB_1008f7914:
        fVar4 = -0.0;
      }
      else {
        fVar4 = 1.0;
        if (0.3 < fVar5) {
          fVar5 = fVar5 * 320.00003 + -96.000015;
          uVar1 = (int)fVar5 + 1;
          if (0x3f < uVar1) goto LAB_1008f7914;
          fVar4 = *(float *)(&DAT_01af9490 + (ulong)(uint)(int)fVar5 * 4) +
                  (fVar5 - (float)(int)fVar5) *
                  (*(float *)(&DAT_01af9490 + (ulong)uVar1 * 4) -
                  *(float *)(&DAT_01af9490 + (ulong)(uint)(int)fVar5 * 4));
        }
      }
      *param_3 = fVar4 * 250.0;
      param_4 = param_4 + 1;
      uVar3 = uVar3 - 1;
      param_3 = param_3 + 1;
    } while (uVar3 != 0);
  }
  return;
}
`,
  );
  const curveBytes = Buffer.alloc(64 * 4);
  const curveValues = Array.from({ length: 64 }, (_, index) => (index === 0 ? 0.2 : index === 63 ? 0.6 : 0.4));
  curveValues.forEach((value, index) => curveBytes.writeFloatLE(value, index * 4));
  const binaryPath = path.join(tempDir, "libGameKindred.so");
  fs.writeFileSync(
    binaryPath,
    fakeElf64WithLoadSegment({
      virtualAddress: 0x1af9000,
      fileOffset: 0x200,
      bytes: curveBytes,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0xaaa864f56c2dcbd7", callback: "0x1008f789c" }],
        },
      ],
    },
    generatedAt: "2026-06-30T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].semanticClass, "computed-callback");
  assert.equal(manifest.items[0].outputStore, "curve-table-range-to-param3");
  assert.equal(manifest.items[0].curveTableSymbol, "DAT_01af9490");
  assert.equal(manifest.items[0].curveTableSourceAddress, "0x1af9490");
  assert.equal(manifest.items[0].curveTableSampleCount, 64);
  assert.equal(manifest.items[0].curveTableMultiplier, 250);
  assert.equal(manifest.items[0].curveMinValue, 0);
  assert.equal(manifest.items[0].curveMaxValue, 250);
});

test("buildNativeParticleCallbackSemanticsManifest records encrypted curve table ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-encrypted-curve-table-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
void FUN_100bc0028(float param_1,int param_2,float *param_3)

{
  uint uVar1;
  bool bVar2;
  float fVar3;
  float fVar4;

  if (0 < param_2) {
    param_1 = param_1 - (float)(int)param_1;
    uVar1 = (int)(param_1 * 64.0) + 1;
    bVar2 = param_1 < 1.0;
    fVar3 = -0.0;
    if (bVar2) {
      fVar3 = 0.0;
    }
    if (bVar2 && 0.0 < param_1) {
      fVar3 = -0.0;
    }
    do {
      fVar4 = fVar3;
      if ((bVar2 && 0.0 < param_1) && uVar1 < 0x40) {
        fVar4 = *(float *)(&DAT_100004100 + (ulong)(uint)(int)(param_1 * 64.0) * 4) +
                (param_1 * 64.0 - (float)(int)(param_1 * 64.0)) *
                (*(float *)(&DAT_100004100 + (ulong)uVar1 * 4) -
                *(float *)(&DAT_100004100 + (ulong)(uint)(int)(param_1 * 64.0) * 4));
      }
      param_2 = param_2 + -1;
      *param_3 = fVar4 * 250.0;
      param_3 = param_3 + 1;
    } while (param_2 != 0);
  }
  return;
}
`,
  );
  const curveBytes = Buffer.alloc(64 * 4);
  const binaryPath = path.join(tempDir, "GameKindred");
  fs.writeFileSync(
    binaryPath,
    fakeFatMachO64WithLoadSegment({
      virtualAddress: 0x100004100,
      bytes: curveBytes,
      encrypted: true,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0028" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].curveTableSourceAddress, "0x100004100");
  assert.equal(manifest.items[0].curveMinValue, undefined);
  assert.equal(manifest.items[0].curveTableReadStatus, "encrypted-range");
});

test("buildNativeParticleCallbackSemanticsManifest derives first output curve ranges when a callback uses multiple curve tables", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-multi-curve-table-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "01145.c"),
    `
void FUN_01145b44(float param_1,uint param_2,float *param_3,ushort *param_4,long param_5)

{
  uint uVar1;
  ulong uVar2;
  float fVar3;
  float fVar4;

  if (0 < (int)param_2) {
    uVar2 = (ulong)param_2;
    do {
      fVar3 = (param_1 - *(float *)(param_5 + 0x48000 + (ulong)*param_4 * 4)) /
              *(float *)(param_5 + 0x50000 + (ulong)*param_4 * 4);
      fVar4 = 1.0;
      if ((fVar3 < 1.0) && (fVar4 = 0.0, 0.0 < fVar3)) {
        uVar1 = (int)(fVar3 * 64.0) + 1;
        fVar4 = 1.0;
        if (uVar1 < 0x40) {
          fVar4 = *(float *)(&DAT_01c63704 + (ulong)(uint)(int)(fVar3 * 64.0) * 4) +
                  (fVar3 * 64.0 - (float)(int)(fVar3 * 64.0)) *
                  (*(float *)(&DAT_01c63704 + (ulong)uVar1 * 4) -
                  *(float *)(&DAT_01c63704 + (ulong)(uint)(int)(fVar3 * 64.0) * 4));
        }
      }
      *param_3 = fVar4;
      param_3[1] = 0.0;
      param_3[2] = 0.0;
      fVar4 = (param_1 - *(float *)(param_5 + 0x48000 + (ulong)*param_4 * 4)) /
              *(float *)(param_5 + 0x50000 + (ulong)*param_4 * 4);
      fVar3 = 0.0;
      if ((fVar4 < 1.0) && (fVar3 = 1.0, 0.0 < fVar4)) {
        uVar1 = (int)(fVar4 * 64.0) + 1;
        fVar3 = 0.0;
        if (uVar1 < 0x40) {
          fVar3 = *(float *)(&DAT_01c7fd04 + (ulong)(uint)(int)(fVar4 * 64.0) * 4) +
                  (fVar4 * 64.0 - (float)(int)(fVar4 * 64.0)) *
                  (*(float *)(&DAT_01c7fd04 + (ulong)uVar1 * 4) -
                  *(float *)(&DAT_01c7fd04 + (ulong)(uint)(int)(fVar4 * 64.0) * 4));
        }
      }
      param_3[3] = fVar3;
      param_4 = param_4 + 1;
      uVar2 = uVar2 - 1;
      param_3 = param_3 + 4;
    } while (uVar2 != 0);
  }
  return;
}
`,
  );
  const curveBytes = Buffer.alloc(64 * 4);
  const curveValues = Array.from({ length: 64 }, (_, index) => (index === 0 ? 0.25 : index === 63 ? 0.75 : 0.5));
  curveValues.forEach((value, index) => curveBytes.writeFloatLE(value, index * 4));
  const binaryPath = path.join(tempDir, "libGameKindred.so");
  fs.writeFileSync(
    binaryPath,
    fakeElf64WithLoadSegment({
      virtualAddress: 0x1c63274,
      fileOffset: 0x200,
      bytes: curveBytes,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0xf39ce2307a203734", callback: "0x1145bf8" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].semanticClass, "computed-callback");
  assert.equal(manifest.items[0].outputStore, "curve-table-range-to-param3");
  assert.equal(manifest.items[0].curveOutputComponentIndex, 0);
  assert.equal(manifest.items[0].curveTableSymbol, "DAT_01c63704");
  assert.equal(manifest.items[0].curveTableSourceAddress, "0x1c63704");
  assert.equal(manifest.items[0].curveTableSampleCount, 64);
  assert.equal(manifest.items[0].curveTableMultiplier, 1);
  assert.equal(manifest.items[0].curveTableMinValue, 0);
  assert.equal(manifest.items[0].curveTableMaxValue, 1);
  assert.equal(manifest.items[0].curveMinValue, 0);
  assert.equal(manifest.items[0].curveMaxValue, 1);
});

test("buildNativeParticleCallbackSemanticsManifest reads pattern16 floats from Fat Mach-O arm64 segments", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-macho-pattern16-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
ulong FUN_100bc0028(ulong param_1,void *param_2)

{
  if (0 < (int)param_1) {
    _memset_pattern16(param_2,&DAT_100004100,(param_1 & 0xffffffff) << 2);
  }
  return param_1;
}
`,
  );
  const patternBytes = Buffer.alloc(16);
  patternBytes.writeFloatLE(1.25, 0);
  patternBytes.writeFloatLE(1.25, 4);
  patternBytes.writeFloatLE(1.25, 8);
  patternBytes.writeFloatLE(1.25, 12);
  const binaryPath = path.join(tempDir, "GameKindred");
  fs.writeFileSync(
    binaryPath,
    fakeFatMachO64WithLoadSegment({
      virtualAddress: 0x100004100,
      bytes: patternBytes,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0028" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].pattern16SourceAddress, "0x100004100");
  assert.deepEqual(manifest.items[0].pattern16FloatValues, [1.25, 1.25, 1.25, 1.25]);
});

test("buildNativeParticleCallbackSemanticsManifest ignores pattern16 floats inside encrypted Fat Mach-O ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-encrypted-macho-pattern16-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
ulong FUN_100bc0028(ulong param_1,void *param_2)

{
  if (0 < (int)param_1) {
    _memset_pattern16(param_2,&DAT_100004100,(param_1 & 0xffffffff) << 2);
  }
  return param_1;
}
`,
  );
  const patternBytes = Buffer.alloc(16);
  patternBytes.writeFloatLE(1.25, 0);
  patternBytes.writeFloatLE(1.25, 4);
  patternBytes.writeFloatLE(1.25, 8);
  patternBytes.writeFloatLE(1.25, 12);
  const binaryPath = path.join(tempDir, "GameKindred");
  fs.writeFileSync(
    binaryPath,
    fakeFatMachO64WithLoadSegment({
      virtualAddress: 0x100004100,
      bytes: patternBytes,
      encrypted: true,
    }),
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0028" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].pattern16SourceAddress, "0x100004100");
  assert.equal(manifest.items[0].pattern16FloatValues, undefined);
  assert.equal(manifest.items[0].pattern16ReadStatus, "encrypted-range");
});

test("buildNativeParticleCallbackSemanticsManifest classifies callbacks that point inside a Ghidra source function", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-containing-source-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "100bc.c"),
    `
undefined8 FUN_100bc0028(undefined8 param_1,undefined4 *param_2)

{
  *param_2 = 0x3f800000;
  return 1;
}




undefined8 FUN_100bc0040(undefined8 param_1,undefined4 *param_2)

{
  *param_2 = 0;
  return 1;
}
`,
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath: path.join(tempDir, "missing-mach-o"),
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x100bc0030" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.deepEqual(manifest.items, [
    {
      callbackAddress: "0x100bc0030",
      semanticClass: "constant-scalar-store",
      keyCount: 1,
      sampleKeys: ["0x20"],
      instructionSummary: "*param_2 = 0x3f800000; return 1;",
      returnValue: 1,
      outputStore: "source-immediate-to-param2",
      immediateBits: "0x3f800000",
      semanticEvidenceSource: "ghidra-source-containing",
      sourceFunction: "FUN_100bc0028",
      sourceFunctionOffset: "0x8",
      sourcePath: path.join(sourceDir, "100bc.c"),
    },
  ]);
});

test("buildNativeParticleCallbackSemanticsManifest marks callbacks unresolved when Mach-O source is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-missing-source-"));
  const sourceDir = path.join(tempDir, "functions");
  const binaryPath = path.join(tempDir, "GameKindred");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(binaryPath, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath,
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0x1006caf54" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.deepEqual(manifest.items, [
    {
      callbackAddress: "0x1006caf54",
      semanticClass: "unresolved-callback",
      keyCount: 1,
      sampleKeys: ["0x20"],
      instructionSummary: "",
      semanticEvidenceSource: "missing-source",
    },
  ]);
});

test("buildNativeParticleCallbackSemanticsManifest locates zero-padded Android Ghidra source files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-particle-callback-android-source-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(
    path.join(sourceDir, "00e43.c"),
    `
undefined8 FUN_00e43320(undefined8 param_1,undefined4 *param_2)

{
  *param_2 = 0x40000000;
  return 1;
}
`,
  );

  const manifest = buildNativeParticleCallbackSemanticsManifest({
    binaryPath: path.join(tempDir, "missing-elf"),
    sourceDir,
    callbackTableScan: {
      items: [
        {
          matchedEntries: [{ key: "0x20", callback: "0xe43320" }],
        },
      ],
    },
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.equal(manifest.items[0].semanticClass, "constant-scalar-store");
  assert.equal(manifest.items[0].sourceFunction, "FUN_00e43320");
  assert.equal(manifest.items[0].sourcePath, path.join(sourceDir, "00e43.c"));
});

test("summarizeCallbackSemantics counts classes and report rows preserve samples", () => {
  const items = [
    {
      callbackAddress: "0x1000",
      semanticClass: "constant-scalar-store",
      keyCount: 2,
      sampleKeys: ["0x10", "0x20"],
      instructionSummary: "orr w8, wzr, #0x40000000; str w8, [x1]; ret",
    },
    {
      callbackAddress: "0x2000",
      semanticClass: "computed-callback",
      keyCount: 1,
      sampleKeys: ["0x30"],
      instructionSummary: "stp x29, x30, [sp, #-0x10]!",
    },
  ];
  const manifest = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    summary: summarizeCallbackSemantics(items),
    items,
  };

  assert.deepEqual(manifest.summary, {
    callbacks: 2,
    linkedKeys: 3,
    bySemanticClass: {
      "constant-scalar-store": 1,
      "computed-callback": 1,
    },
  });
  assert.deepEqual(reportRowsForManifest(manifest)[0], {
    callbackAddress: "0x1000",
    semanticClass: "constant-scalar-store",
    semanticEvidenceSource: "",
    keyCount: 2,
    sampleKeys: "0x10|0x20",
    instructionSummary: "orr w8, wzr, #0x40000000; str w8, [x1]; ret",
    dependencyFlags: "",
    randomScale: "",
    randomBase: "",
    randomMinValue: "",
    randomMaxValue: "",
    firstComponentBits: "",
    firstComponentValue: "",
    pattern16Symbol: "",
    pattern16SourceAddress: "",
    pattern16FloatValues: "",
    pattern16ReadStatus: "",
    curveTableSymbol: "",
    curveOutputComponentIndex: "",
    curveTableSourceAddress: "",
    curveTableReadStatus: "",
    curveTableSampleCount: "",
    curveTableMultiplier: "",
    curveTableMinValue: "",
    curveTableMaxValue: "",
    curveMinValue: "",
    curveMaxValue: "",
  });
});
