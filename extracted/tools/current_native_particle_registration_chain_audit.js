#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-particle-registration-chain-audit.json";
const defaultJsonOut = "extracted/reports/current_native_particle_registration_chain_audit.json";
const defaultTsvOut = "extracted/reports/current_native_particle_registration_chain_audit.tsv";

const particleMask = 0x200;

const layoutAExplicitRefreshCallsiteSpecs = [
  {
    address: 0x8abf54,
    target: "0xd7ffdc",
    refreshAction: "explicit-non-particle-flags",
    conditionClass: "resource-state-low-flags",
    expectedOpcodeHex: "94135022",
    primaryValueAddress: 0x8abf50,
    primaryValueExpectedOpcodeHex: "528000a1",
    fallbackValueAddress: 0x8ac984,
    fallbackValueExpectedOpcodeHex: "320003e1",
    fallbackBranchAddress: 0x8ac988,
    fallbackBranchExpectedOpcodeHex: "17fffd73",
    flagValues: ["0x5", "0x1"],
    containsParticleMask: false,
    evidence:
      "the only current Android direct caller of layout A explicit refresh entry 0xd7ffdc passes w1=0x5 on the normal branch and w1=0x1 on the fallback branch; neither value contains particle mask 0x200",
  },
];

const layoutARefreshCallsiteSpecs = [
  {
    address: 0x8af43c,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "conditional-packed-owner-and-input-flags",
    expectedOpcodeHex: "94134302",
    evidence:
      "calls d80044 for object +0x48 after reading caller flags from x1 and packed owner fields at object +0x9c/+0xa0; nearby branches clear instead when the tested state groups are active or low input flags are zero",
  },
  {
    address: 0x8af444,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "conditional-packed-owner-and-input-flags",
    expectedOpcodeHex: "94134318",
    evidence:
      "calls d800a4 on the clear branch paired with 0x8af43c after the same x1 and object +0x9c/+0xa0 state tests",
  },
  {
    address: 0x8b8438,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "conditional-input-byte-flags",
    expectedOpcodeHex: "14131f03",
    evidence:
      "tail-calls d80044 for object +0x40 only when input byte [x1] has low 0x1f bits set and bit 5 clear",
  },
  {
    address: 0x8b8440,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "conditional-input-byte-flags",
    expectedOpcodeHex: "14131f19",
    evidence: "tail-calls d800a4 on the clear branch paired with 0x8b8438 for the same input byte [x1]",
  },
  {
    address: 0x8ac574,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "unconditional-entry-48-clear",
    expectedOpcodeHex: "94134ecc",
    evidence: "clears the layout A record loaded from object +0x48 after nearby packed-bit updates",
  },
  {
    address: 0x8caa14,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "unconditional-entry-28-clear",
    expectedOpcodeHex: "1412d5a4",
    evidence: "tail-calls d800a4 for the layout A record loaded from object +0x28",
  },
  {
    address: 0x8cab30,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "unconditional-entry-28-keep-after-transform-update",
    expectedOpcodeHex: "9412d545",
    evidence: "calls d80044 for object +0x28 after updating transform data through d7fcbc",
  },
  {
    address: 0x8cac04,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "unconditional-entry-28-keep-before-secondary-reset",
    expectedOpcodeHex: "9412d510",
    evidence: "calls d80044 for object +0x28 before resetting the sibling object at +0x30 through d7f7f8",
  },
  {
    address: 0x8cac34,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "unconditional-entry-28-clear",
    expectedOpcodeHex: "1412d51c",
    evidence: "tail-calls d800a4 for the layout A record loaded from object +0x28",
  },
  {
    address: 0x8d2c48,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "unconditional-entry-30-keep-before-secondary-reset",
    expectedOpcodeHex: "9412b4ff",
    evidence: "calls d80044 for object +0x30 before resetting the sibling object at +0x38 through d7f7f8",
  },
  {
    address: 0x8d2c78,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "unconditional-entry-30-clear",
    expectedOpcodeHex: "1412b50b",
    evidence: "tail-calls d800a4 for the layout A record loaded from object +0x30",
  },
  {
    address: 0x8dac94,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "unconditional-entry-38-clear-after-teardown",
    expectedOpcodeHex: "94129504",
    evidence: "clears the layout A record loaded from object +0x38 after the surrounding path handles teardown-style state",
  },
  {
    address: 0x8dad08,
    target: "0xd80044",
    refreshAction: "keep-cached-flags",
    conditionClass: "conditional-object-byte-flags",
    expectedOpcodeHex: "141294cf",
    evidence: "tail-calls d80044 for object +0x38 only after object byte flags +0x59 and +0x58 are both nonzero",
  },
  {
    address: 0x8dad1c,
    target: "0xd800a4",
    refreshAction: "clear-flags",
    conditionClass: "conditional-object-byte-flags",
    expectedOpcodeHex: "141294e2",
    evidence: "tail-calls d800a4 on the clear branch paired with 0x8dad08 when object byte flag conditions fail",
  },
];

const layoutARefreshTypeGlobalSpecs = [
  {
    globalAddress: 0x3035088,
    role: "layout-a-shared-child-type-index",
    registrationStoreAddress: 0x8ca9d0,
    registrationStoreExpectedOpcodeHex: "b9008909",
    typeLiteralAddress: 0x8ca9a4,
    typeLiteralExpectedOpcodeHex: "321d0bec",
    typeLiteral: "0x38",
    controlAddress: 0x8ca9ac,
    controlExpectedOpcodeHex: "321f0108",
    readers: [
      { address: 0x90ce18, expectedOpcodeHex: "b9408901" },
      { address: 0x915264, expectedOpcodeHex: "b9408901" },
      { address: 0x91a6d8, expectedOpcodeHex: "b9408901" },
    ],
    evidence:
      "current Android global 0x3035088 is written by the 0x8ca968 type registration and later read by owner setup paths at 0x90ce04, 0x915260, and 0x91a6c4 before they create the layout-A child record that reaches 0x8caa18",
  },
  {
    globalAddress: 0x3034ae0,
    role: "layout-a-input-byte-conditional-type-index",
    registrationStoreAddress: 0x8b82b8,
    registrationStoreExpectedOpcodeHex: "b90ae109",
    typeLiteralAddress: 0x8b8294,
    typeLiteralExpectedOpcodeHex: "5280090c",
    typeLiteral: "0x48",
    controlAddress: 0x8b8290,
    controlExpectedOpcodeHex: "321b0108",
    readers: [
      { address: 0x8afe48, expectedOpcodeHex: "b94ae101" },
      { address: 0x97f8a8, expectedOpcodeHex: "b94ae101" },
    ],
    evidence:
      "current Android global 0x3034ae0 is written by the 0x8b824c type registration and read before 0x8afe80 calls 0x8b8420, the input-byte conditional keep/clear layout-A refresh path",
  },
  {
    globalAddress: 0x3034af0,
    role: "layout-a-secondary-companion-type-index",
    registrationStoreAddress: 0x8b77c4,
    registrationStoreExpectedOpcodeHex: "b90af109",
    typeLiteralAddress: 0x8b7794,
    typeLiteralExpectedOpcodeHex: "321c0beb",
    typeLiteral: "0x70",
    controlAddress: 0x8b77a4,
    controlExpectedOpcodeHex: "321b0108",
    readers: [
      { address: 0x8afe88, expectedOpcodeHex: "b94af101" },
      { address: 0x97f9f4, expectedOpcodeHex: "b94af101" },
    ],
    evidence:
      "current Android global 0x3034af0 is written by the 0x8b774c type registration and read next to the 0x3034ae0 object path, making it a companion type in the same owner setup but not itself a proven particle draw flag producer",
  },
  {
    globalAddress: 0x30369a8,
    role: "layout-a-owner-type-index-a",
    registrationStoreAddress: 0x90ceec,
    registrationStoreExpectedOpcodeHex: "b909a909",
    typeLiteralAddress: 0x90cebc,
    typeLiteralExpectedOpcodeHex: "5280130b",
    typeLiteral: "0x98",
    controlAddress: 0x90cecc,
    controlExpectedOpcodeHex: "32000108",
    readers: [{ address: 0x914f74, expectedOpcodeHex: "b949a901" }],
    evidence:
      "current Android global 0x30369a8 is written by owner type registration 0x90ce74; this owner path allocates the 0x3035088 child at +0x38 and can tail into 0x8caa18",
  },
  {
    globalAddress: 0x3036d00,
    role: "layout-a-owner-type-index-b",
    registrationStoreAddress: 0x91a778,
    registrationStoreExpectedOpcodeHex: "b90d0109",
    typeLiteralAddress: 0x91a744,
    typeLiteralExpectedOpcodeHex: "321a03eb",
    typeLiteral: "0x40",
    controlAddress: 0x91a754,
    controlExpectedOpcodeHex: "32000108",
    readers: [
      { address: 0x914e64, expectedOpcodeHex: "b94d0109" },
      { address: 0x914f28, expectedOpcodeHex: "b94d0101" },
    ],
    evidence:
      "current Android global 0x3036d00 is written by owner type registration 0x91a6fc; this is a sibling owner path that creates the same 0x3035088 child type before reaching 0x8caa18",
  },
];

const evidenceSpecs = [
  {
    address: 0xd7fa04,
    role: "layout-a-default-flags-one",
    expectedOpcodeHex: "320003e2",
    evidence: "layout A constructor path sets w2 to 1 before entering the shared add-record wrapper",
  },
  {
    address: 0xd7faa0,
    role: "layout-a-manager-accessor",
    expectedOpcodeHex: "942c3b50",
    evidence: "layout A obtains manager 0x311a960 through 0x188e7e0",
  },
  {
    address: 0xd7faa4,
    role: "layout-a-entry-pointer",
    expectedOpcodeHex: "9100c283",
    evidence: "layout A passes x3 = object +0x30 as the concrete manager record +0x8 entry",
  },
  {
    address: 0xd7faac,
    role: "layout-a-flags-argument",
    expectedOpcodeHex: "2a1303e2",
    evidence: "layout A forwards w19 as w2 flags to 0x188eee0",
  },
  {
    address: 0xd7fab0,
    role: "layout-a-add-record-call",
    expectedOpcodeHex: "942c3d0c",
    evidence: "layout A calls 0x188eee0; this is one of only two direct current-package add-record callers",
  },
  {
    address: 0xd7fab4,
    role: "layout-a-record-index-store",
    expectedOpcodeHex: "79016280",
    evidence: "layout A stores the returned manager record index at object +0xb0",
  },
  {
    address: 0xd7fab8,
    role: "layout-a-flags-cache-store",
    expectedOpcodeHex: "b900b693",
    evidence: "layout A caches the flags at object +0xb4 after registration",
  },
  {
    address: 0xd7fc38,
    role: "layout-a-type-record-flags-0xb8",
    expectedOpcodeHex: "5280170b",
    evidence: "layout A type registration stores literal 0xb8 in the same shared type-record shape",
  },
  {
    address: 0xd7fc3c,
    role: "layout-a-type-record-flags-store",
    expectedOpcodeHex: "2914ad49",
    evidence: "layout A type registration stores [index, 0xb8] at the shared type-record field",
  },
  {
    address: 0xd7fc44,
    role: "layout-a-type-record-control-0x400",
    expectedOpcodeHex: "32160108",
    evidence: "layout A type registration sets the type-record control bit 0x400 after preserving the top bit",
  },
  {
    address: 0xd7fc5c,
    role: "layout-a-type-record-global-index-store",
    expectedOpcodeHex: "b909e509",
    evidence: "layout A stores the recovered type index in current-package global 0x30349e4",
  },
  {
    address: 0xd80000,
    role: "layout-a-explicit-refresh-cache-store",
    expectedOpcodeHex: "b900b401",
    evidence: "layout A explicit refresh stores caller w1 at object +0xb4 before refreshing the manager record flags",
  },
  {
    address: 0xd8000c,
    role: "layout-a-explicit-refresh-flags-pointer",
    expectedOpcodeHex: "910013e3",
    evidence: "layout A explicit refresh passes x3 = sp+4 to 0x188f020 so backing record +0x18 can receive caller flags",
  },
  {
    address: 0xd80014,
    role: "layout-a-explicit-refresh-record-call",
    expectedOpcodeHex: "942c3c03",
    evidence: "layout A explicit refresh calls 0x188f020 with the stored record index at object +0xb0",
  },
  {
    address: 0xd80064,
    role: "layout-a-cached-refresh-flags-load",
    expectedOpcodeHex: "b940b408",
    evidence: "layout A cached refresh reloads object +0xb4 as the current flag value",
  },
  {
    address: 0xd80074,
    role: "layout-a-cached-refresh-flags-pointer",
    expectedOpcodeHex: "910013e3",
    evidence: "layout A cached refresh passes x3 = sp+4 to 0x188f020 so backing record +0x18 can receive cached flags",
  },
  {
    address: 0xd8007c,
    role: "layout-a-cached-refresh-record-call",
    expectedOpcodeHex: "942c3be9",
    evidence: "layout A cached refresh calls 0x188f020 with the stored record index at object +0xb0",
  },
  {
    address: 0xd800c4,
    role: "layout-a-zero-refresh-flags-store",
    expectedOpcodeHex: "b90007ff",
    evidence: "layout A zero refresh writes zero to the stack flag slot before refreshing the manager record flags",
  },
  {
    address: 0xd800d0,
    role: "layout-a-zero-refresh-flags-pointer",
    expectedOpcodeHex: "910013e3",
    evidence: "layout A zero refresh passes x3 = sp+4 to 0x188f020 so backing record +0x18 is cleared",
  },
  {
    address: 0xd800d8,
    role: "layout-a-zero-refresh-record-call",
    expectedOpcodeHex: "942c3bd2",
    evidence: "layout A zero refresh calls 0x188f020 with the stored record index at object +0xb0",
  },
  {
    address: 0x8d3110,
    role: "layout-b-flags-load",
    expectedOpcodeHex: "b940ac02",
    evidence: "layout B wrapper loads w2 flags from object +0xac before registration",
  },
  {
    address: 0x8d3114,
    role: "layout-b-default-table-load",
    expectedOpcodeHex: "f9427821",
    evidence: "layout B wrapper loads the default transform/payload table from global 0x2ae54f0",
  },
  {
    address: 0x8d3118,
    role: "layout-b-register-tailcall",
    expectedOpcodeHex: "1400021d",
    evidence: "layout B wrapper tail-branches to 0x8d398c with object, table, and flags",
  },
  {
    address: 0x8d3a1c,
    role: "layout-b-manager-accessor",
    expectedOpcodeHex: "943eeb71",
    evidence: "layout B obtains manager 0x311a960 through 0x188e7e0",
  },
  {
    address: 0x8d3a20,
    role: "layout-b-entry-pointer",
    expectedOpcodeHex: "9100c283",
    evidence: "layout B passes x3 = object +0x30 as the concrete manager record +0x8 entry",
  },
  {
    address: 0x8d3a28,
    role: "layout-b-flags-argument",
    expectedOpcodeHex: "2a1303e2",
    evidence: "layout B forwards w19, copied from object +0xac, as w2 flags to 0x188eee0",
  },
  {
    address: 0x8d3a2c,
    role: "layout-b-add-record-call",
    expectedOpcodeHex: "943eed2d",
    evidence: "layout B calls 0x188eee0; this is the other direct current-package add-record caller",
  },
  {
    address: 0x8d3a30,
    role: "layout-b-record-index-store",
    expectedOpcodeHex: "79016280",
    evidence: "layout B stores the returned manager record index at object +0xb0",
  },
  {
    address: 0x188ef58,
    role: "manager-record-index-argument",
    expectedOpcodeHex: "2a1403e3",
    evidence: "0x188eee0 passes the allocated manager record index as w3 to the backing indexed object add slot",
  },
  {
    address: 0x188ef64,
    role: "manager-backing-add-call",
    expectedOpcodeHex: "d63f0120",
    evidence: "0x188eee0 calls backing object vtable +0x10 before filling the manager record",
  },
  {
    address: 0x188ef70,
    role: "manager-record-entry-store",
    expectedOpcodeHex: "f90006d3",
    evidence: "0x188eee0 stores caller x3 into manager record +0x8",
  },
  {
    address: 0x18bf580,
    role: "backing-record-flags-store",
    expectedOpcodeHex: "79003122",
    evidence: "backing add-record stores caller w2 flags at backing record +0x18",
  },
  {
    address: 0x18bf584,
    role: "backing-record-manager-index-store",
    expectedOpcodeHex: "79003523",
    evidence: "backing add-record stores caller w3 manager index at backing record +0x1a",
  },
  {
    address: 0x18bf794,
    role: "backing-filter-load-record-flags",
    expectedOpcodeHex: "794032e8",
    evidence: "particle draw backing filter loads backing record +0x18 flags",
  },
  {
    address: 0x18bf798,
    role: "backing-filter-test-particle-mask",
    expectedOpcodeHex: "6a14011f",
    evidence: "particle draw tests backing record flags against caller mask 0x200",
  },
  {
    address: 0x8d5094,
    role: "layout-b-dispatch-current-flags-load",
    expectedOpcodeHex: "b940ae68",
    evidence: "layout B update/dispatch path reloads object +0xac flags before dispatching through manager 0x188f020",
  },
  {
    address: 0x8d50b4,
    role: "layout-b-dispatch-manager-accessor",
    expectedOpcodeHex: "943ee5cb",
    evidence: "layout B update/dispatch path obtains manager 0x311a960 before record dispatch",
  },
  {
    address: 0x8d50c4,
    role: "layout-b-dispatch-record-call",
    expectedOpcodeHex: "943ee7d7",
    evidence: "layout B update/dispatch path calls 0x188f020 with the stored record index at object +0xb0",
  },
  {
    address: 0x8d2f8c,
    role: "layout-b-type-record-flags-0x118",
    expectedOpcodeHex: "5280230b",
    evidence: "the type record that installs the 0x8d310c/0x8d398c layout B path stores literal 0x118, not 0x210",
  },
  {
    address: 0x8d2f90,
    role: "layout-b-type-record-flags-store",
    expectedOpcodeHex: "2914ad49",
    evidence: "layout B type registration stores [index, 0x118] at the shared type-record field",
  },
  {
    address: 0x8d2fc0,
    role: "layout-b-type-record-slot0-install",
    expectedOpcodeHex: "943ee4cd",
    evidence: "layout B type registration installs slot 0 callback 0x8d310c through 0x188c2f4",
  },
  {
    address: 0x8d2fd8,
    role: "layout-b-type-record-slot1-install",
    expectedOpcodeHex: "943ee4c7",
    evidence: "layout B type registration installs slot 1 callback 0x8d311c through 0x188c2f4",
  },
  {
    address: 0x8d2ff0,
    role: "layout-b-type-record-slot4-install",
    expectedOpcodeHex: "943ee4c1",
    evidence: "layout B type registration installs slot 4 callback 0x8d3140 through 0x188c2f4",
  },
  {
    address: 0x8d2dac,
    role: "layout-b-constructor-packed-a8-constant",
    expectedOpcodeHex: "b25f03ea",
    evidence: "layout B constructor prepares 64-bit constant 0x0000000200000000 for object +0xa8/+0xac",
  },
  {
    address: 0x8d2dbc,
    role: "layout-b-constructor-packed-a8-store",
    expectedOpcodeHex: "f900566a",
    evidence: "layout B constructor stores the 64-bit constant at object +0xa8, so initial object +0xac is 2, not 0x200",
  },
  {
    address: 0x8d2dc8,
    role: "layout-b-constructor-flags-cache-b4-store",
    expectedOpcodeHex: "b900b668",
    evidence: "layout B constructor initializes object +0xb4 cache to -1 separately from the +0xac value used at registration",
  },
  {
    address: 0x188f020,
    role: "manager-record-refresh-entry",
    expectedOpcodeHex: "f9400008",
    evidence: "0x188f020 enters the shared manager record refresh path for a stored record index",
  },
  {
    address: 0x188f028,
    role: "manager-record-refresh-backing-index-load",
    expectedOpcodeHex: "79402541",
    evidence: "0x188f020 loads the backing record index from manager record +0x12",
  },
  {
    address: 0x188f034,
    role: "manager-record-refresh-backing-update-dispatch",
    expectedOpcodeHex: "f9401124",
    evidence: "0x188f020 dispatches through backing vtable +0x20; current backing implementation is 0x18bf5e4",
  },
  {
    address: 0x18bf5e4,
    role: "backing-record-refresh-entry",
    expectedOpcodeHex: "91004008",
    evidence: "backing vtable +0x20 update path computes the backing record base",
  },
  {
    address: 0x18bf60c,
    role: "backing-record-refresh-flags-load",
    expectedOpcodeHex: "7940006a",
    evidence: "backing update loads the refreshed 16-bit flags from caller x3",
  },
  {
    address: 0x18bf618,
    role: "backing-record-refresh-flags-store",
    expectedOpcodeHex: "7900310a",
    evidence: "backing update stores refreshed flags into backing record +0x18, the same field tested by particle draw",
  },
  {
    address: 0x8caecc,
    role: "candidate-type-constructor-flags-load-negative",
    expectedOpcodeHex: "b940ae89",
    evidence: "the constructor for the 0x210 candidate type reads object +0xac but does not copy 0x210 into it",
  },
  {
    address: 0x8caed8,
    role: "candidate-type-constructor-clears-bit2-negative",
    expectedOpcodeHex: "121d7928",
    evidence: "the 0x210 candidate constructor only clears bit 2 in object +0xac; this is negative evidence against treating 0x210 as the direct particle draw flag",
  },
  {
    address: 0x8caee0,
    role: "candidate-type-constructor-flags-store-negative",
    expectedOpcodeHex: "b900ae88",
    evidence: "the 0x210 candidate constructor stores the bit-2-adjusted object +0xac value, not the 0x210 type literal",
  },
  {
    address: 0x8cb11c,
    role: "candidate-placement-update-flags-load-negative",
    expectedOpcodeHex: "b940ac09",
    evidence: "the sole 0x8cb108 placement-update caller reads object +0xac but only patches a low control bit",
  },
  {
    address: 0x8cb130,
    role: "candidate-placement-update-bit2-write-negative",
    expectedOpcodeHex: "331e0149",
    evidence: "0x8cb108 writes only bit 2 from caller w2 into object +0xac, not the 0x200 draw-mask bit",
  },
  {
    address: 0x8cb138,
    role: "candidate-placement-update-flags-store-negative",
    expectedOpcodeHex: "b900ac09",
    evidence: "0x8cb108 stores the bit-2-adjusted object +0xac value; this is not a particle flag producer",
  },
  {
    address: 0x8cb274,
    role: "dynamic-object-flag-ac-visibility-load",
    expectedOpcodeHex: "b940ae68",
    evidence: "0x8cb1ec reloads object +0xac before updating its dynamic bits 7..14 visibility/coverage field",
  },
  {
    address: 0x8cb278,
    role: "dynamic-object-flag-ac-visibility-test",
    expectedOpcodeHex: "72191d1f",
    evidence: "0x8cb1ec tests bits 7..14 with mask 0x7f80; this is a separate 0x210-type candidate path, not yet tied to the 0x118 layout B registration path",
  },
  {
    address: 0x8cb280,
    role: "dynamic-object-flag-ac-visibility-clear",
    expectedOpcodeHex: "12115d08",
    evidence: "0x8cb1ec can clear bits 7..14 in object +0xac; this remains candidate-only until tied to the 0x118 layout B registration path",
  },
  {
    address: 0x8cb374,
    role: "dynamic-object-flag-ac-coverage-load",
    expectedOpcodeHex: "b940ae68",
    evidence: "0x8cb1ec reloads object +0xac before inserting a computed coverage byte into bits 7..14",
  },
  {
    address: 0x8cb394,
    role: "dynamic-object-flag-ac-coverage-readback",
    expectedOpcodeHex: "5307390a",
    evidence: "0x8cb1ec reads back bits 7..14 as an 8-bit value before deciding whether to update object +0xac",
  },
  {
    address: 0x8cb3a0,
    role: "dynamic-object-flag-ac-coverage-bfi",
    expectedOpcodeHex: "33191d28",
    evidence: "0x8cb1ec inserts a computed 8-bit value into object +0xac bits 7..14; this can produce bit 0x200 in the 0x210-type candidate path but is not proven for layout B",
  },
  {
    address: 0x8cb3b8,
    role: "dynamic-object-flag-ac-coverage-allbits",
    expectedOpcodeHex: "32191d08",
    evidence: "0x8cb1ec can set bits 7..14 to 0x7f80, which includes 0x200, but this path is not yet tied to the 0x118 layout B registration path",
  },
  {
    address: 0x8cb3c0,
    role: "dynamic-object-flag-ac-coverage-store",
    expectedOpcodeHex: "b900ae68",
    evidence: "0x8cb1ec stores the dynamic bits 7..14 result back to object +0xac",
  },
  {
    address: 0x8d50b0,
    role: "layout-b-dispatch-flags-stack-store",
    expectedOpcodeHex: "b90007e8",
    evidence: "layout B update stores the current object +0xac flags to the stack before refreshing the manager record",
  },
  {
    address: 0x8d50bc,
    role: "layout-b-dispatch-flags-pointer",
    expectedOpcodeHex: "910013e3",
    evidence: "layout B update passes x3 = sp+4 so 0x188f020/backing vtable +0x20 can refresh backing record +0x18 flags",
  },
  {
    address: 0x8cb0dc,
    role: "candidate-type-record-flags-0x210",
    expectedOpcodeHex: "5280420b",
    evidence:
      "candidate type-record factory stores literal 0x210, which contains particle mask 0x200; later constructor evidence shows this literal is not copied directly into object +0xac",
  },
  {
    address: 0x8cb0e0,
    role: "candidate-type-record-flags-store",
    expectedOpcodeHex: "2914ad49",
    evidence:
      "candidate type-record factory stores [index, 0x210] at a nearby record field; current evidence rejects using this as a direct layout B +0xac producer",
  },
  {
    address: 0x8d5468,
    role: "candidate-type-record-flags-0x30",
    expectedOpcodeHex: "321c07eb",
    evidence:
      "sibling type-record factory stores literal 0x30, useful as a negative comparison because it does not include particle mask 0x200",
  },
  {
    address: 0x8d546c,
    role: "candidate-type-record-flags-0x30-store",
    expectedOpcodeHex: "2914ad49",
    evidence: "sibling type-record factory stores [index, 0x30] at the same nearby record shape",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function virtualAddressForFileOffset(elf, fileOffset) {
  for (const segment of elf.loads) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.fileSize;
    if (fileOffset >= start && fileOffset < end) return segment.virtualAddress + (fileOffset - start);
  }
  return -1;
}

function opcodeEvidenceRows(buffer, elf) {
  return evidenceSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
    };
  });
}

function layoutARefreshCallsiteRows(buffer, elf) {
  return layoutARefreshCallsiteSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      target: spec.target,
      refreshAction: spec.refreshAction,
      conditionClass: spec.conditionClass,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
    };
  });
}

function layoutAExplicitRefreshCallsiteRows(buffer, elf) {
  return layoutAExplicitRefreshCallsiteSpecs.map((spec) => {
    const callInstruction = checkedOpcode(buffer, elf, spec.address, spec.expectedOpcodeHex);
    const primaryValueInstruction = checkedOpcode(buffer, elf, spec.primaryValueAddress, spec.primaryValueExpectedOpcodeHex);
    const fallbackValueInstruction = checkedOpcode(buffer, elf, spec.fallbackValueAddress, spec.fallbackValueExpectedOpcodeHex);
    const fallbackBranchInstruction = checkedOpcode(buffer, elf, spec.fallbackBranchAddress, spec.fallbackBranchExpectedOpcodeHex);
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      target: spec.target,
      refreshAction: spec.refreshAction,
      conditionClass: spec.conditionClass,
      flagValues: spec.flagValues.join("|"),
      containsParticleMask: spec.containsParticleMask,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex: callInstruction.actualOpcodeHex,
      primaryValueAddressHex: primaryValueInstruction.addressHex,
      primaryValueOpcodeMatches: primaryValueInstruction.opcodeMatches,
      fallbackValueAddressHex: fallbackValueInstruction.addressHex,
      fallbackValueOpcodeMatches: fallbackValueInstruction.opcodeMatches,
      fallbackBranchAddressHex: fallbackBranchInstruction.addressHex,
      fallbackBranchOpcodeMatches: fallbackBranchInstruction.opcodeMatches,
      opcodeMatches: [callInstruction, primaryValueInstruction, fallbackValueInstruction, fallbackBranchInstruction].every(
        (row) => row.opcodeMatches,
      ),
      evidence: spec.evidence,
    };
  });
}

function checkedOpcode(buffer, elf, address, expectedOpcodeHex) {
  const fileOffset = fileOffsetForVirtualAddress(elf, address, 4);
  const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
  return {
    address,
    addressHex: hex(address),
    expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === expectedOpcodeHex,
  };
}

function layoutARefreshTypeGlobalRows(buffer, elf) {
  return layoutARefreshTypeGlobalSpecs.map((spec) => {
    const registrationStore = checkedOpcode(buffer, elf, spec.registrationStoreAddress, spec.registrationStoreExpectedOpcodeHex);
    const typeLiteral = checkedOpcode(buffer, elf, spec.typeLiteralAddress, spec.typeLiteralExpectedOpcodeHex);
    const control = checkedOpcode(buffer, elf, spec.controlAddress, spec.controlExpectedOpcodeHex);
    const readers = spec.readers.map((reader) => checkedOpcode(buffer, elf, reader.address, reader.expectedOpcodeHex));
    return {
      role: spec.role,
      globalAddress: spec.globalAddress,
      globalAddressHex: hex(spec.globalAddress),
      typeLiteral: spec.typeLiteral,
      registrationStore,
      typeLiteralInstruction: typeLiteral,
      controlInstruction: control,
      readers,
      opcodeMatches: [registrationStore, typeLiteral, control, ...readers].every((row) => row.opcodeMatches),
      evidence: spec.evidence,
    };
  });
}

function scanObjectFlagAcAccesses(buffer, elf) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) return [];
  const patterns = [
    { kind: "ldr-w", mask: 0xffc00000, value: 0xb9400000, scale: 4 },
    { kind: "str-w", mask: 0xffc00000, value: 0xb9000000, scale: 4 },
  ];
  const rows = [];
  for (let fileOffset = text.fileOffset; fileOffset + 4 <= text.fileOffset + text.size; fileOffset += 4) {
    const instruction = buffer.readUInt32LE(fileOffset);
    for (const pattern of patterns) {
      if (((instruction & pattern.mask) >>> 0) !== pattern.value) continue;
      const immediate = ((instruction >>> 10) & 0xfff) * pattern.scale;
      if (immediate !== 0xac) continue;
      rows.push({
        address: virtualAddressForFileOffset(elf, fileOffset),
        addressHex: hex(virtualAddressForFileOffset(elf, fileOffset)),
        accessKind: pattern.kind,
        rt: instruction & 0x1f,
        rn: (instruction >>> 5) & 0x1f,
        immediateHex: "0xac",
        instructionHex: instruction.toString(16).padStart(8, "0"),
      });
    }
  }
  return rows;
}

function nearbyParticleMaskImmediateRows(buffer, elf, accessRows) {
  const rows = [];
  for (const row of accessRows.filter((item) => item.accessKind === "str-w")) {
    const storeOffset = fileOffsetForVirtualAddress(elf, row.address, 4);
    if (storeOffset < 0) continue;
    const nearby = [];
    for (let fileOffset = Math.max(0, storeOffset - 12 * 4); fileOffset < storeOffset; fileOffset += 4) {
      const instruction = buffer.readUInt32LE(fileOffset);
      let immediateKind = "";
      if ((instruction & 0xffffffe0) === 0x321703e0) immediateKind = "orr-wzr-0x200";
      if ((instruction & 0xffffffe0) === 0x52804000) immediateKind = "mov-0x200";
      if ((instruction & 0xffffffe0) === 0x52804200) immediateKind = "mov-0x210";
      if (!immediateKind) continue;
      nearby.push({
        address: virtualAddressForFileOffset(elf, fileOffset),
        addressHex: hex(virtualAddressForFileOffset(elf, fileOffset)),
        instructionHex: instruction.toString(16).padStart(8, "0"),
        immediateKind,
      });
    }
    if (!nearby.length) continue;
    rows.push({
      storeAddress: row.address,
      storeAddressHex: row.addressHex,
      storeInstructionHex: row.instructionHex,
      nearby,
    });
  }
  return rows;
}

function buildCurrentNativeParticleRegistrationChainAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeEvidenceRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const addRecordCallers = findDirectBranchCallers(buffer, elf, 0x188eee0);
  const layoutBRegisterCallers = findDirectBranchCallers(buffer, elf, 0x8d398c);
  const layoutAExplicitRefreshEntryCallers = findDirectBranchCallers(buffer, elf, 0xd7ffdc);
  const layoutAExplicitRefreshMidBlockCallers = findDirectBranchCallers(buffer, elf, 0xd80000);
  const layoutACachedRefreshCallers = findDirectBranchCallers(buffer, elf, 0xd80044);
  const layoutACachedRefreshInnerCallers = findDirectBranchCallers(buffer, elf, 0xd80064);
  const layoutAZeroRefreshCallers = findDirectBranchCallers(buffer, elf, 0xd800a4);
  const layoutAExplicitRefreshCallsites = layoutAExplicitRefreshCallsiteRows(buffer, elf);
  const layoutARefreshCallsites = layoutARefreshCallsiteRows(buffer, elf);
  const layoutARefreshTypeGlobals = layoutARefreshTypeGlobalRows(buffer, elf);
  const layoutAExplicitRefreshCallsiteOpcodeMismatchRows = layoutAExplicitRefreshCallsites.filter(
    (row) => !row.opcodeMatches,
  ).length;
  const layoutAExplicitRefreshParticleMaskRows = layoutAExplicitRefreshCallsites.filter(
    (row) => row.containsParticleMask && row.opcodeMatches,
  ).length;
  const layoutARefreshCallsiteOpcodeMismatchRows = layoutARefreshCallsites.filter((row) => !row.opcodeMatches).length;
  const layoutARefreshTypeGlobalOpcodeMismatchRows = layoutARefreshTypeGlobals.filter((row) => !row.opcodeMatches).length;
  const layoutARefreshKeepCallsiteRows = layoutARefreshCallsites.filter(
    (row) => row.refreshAction === "keep-cached-flags" && row.opcodeMatches,
  ).length;
  const layoutARefreshClearCallsiteRows = layoutARefreshCallsites.filter(
    (row) => row.refreshAction === "clear-flags" && row.opcodeMatches,
  ).length;
  const layoutARefreshConditionalCallsiteRows = layoutARefreshCallsites.filter(
    (row) => row.conditionClass.startsWith("conditional-") && row.opcodeMatches,
  ).length;
  const objectFlagAcAccesses = scanObjectFlagAcAccesses(buffer, elf);
  const directObjectFlagAcParticleMaskStoreContexts = nearbyParticleMaskImmediateRows(buffer, elf, objectFlagAcAccesses);
  const objectFlagAcLoadRows = objectFlagAcAccesses.filter((row) => row.accessKind === "ldr-w").length;
  const objectFlagAcStoreRows = objectFlagAcAccesses.filter((row) => row.accessKind === "str-w").length;
  const candidateRows = rows.filter((row) => row.role.startsWith("candidate-type-record-flags"));
  const candidateParticleMaskRows = candidateRows.filter((row) => /0x210/.test(row.evidence)).length;
  const rejectedCandidateRows = rows.filter((row) => row.role.includes("-negative") && row.opcodeMatches).length;
  const dynamicObjectFlagAcRows = rows.filter((row) => row.role.startsWith("dynamic-object-flag-ac") && row.opcodeMatches);
  const dynamicObjectFlagAcMaskProducerRows = dynamicObjectFlagAcRows.filter((row) =>
    ["dynamic-object-flag-ac-coverage-bfi", "dynamic-object-flag-ac-coverage-allbits"].includes(row.role),
  ).length;
  const managerRefreshRows = rows.filter((row) => row.role.startsWith("manager-record-refresh") && row.opcodeMatches).length;
  const backingRefreshRows = rows.filter((row) => row.role.startsWith("backing-record-refresh") && row.opcodeMatches).length;
  const layoutATypeRecordRecovered = rows.some((row) => row.role === "layout-a-type-record-flags-0xb8" && row.opcodeMatches);
  const layoutAExplicitFlagRefreshRecovered = rows.some(
    (row) => row.role === "layout-a-explicit-refresh-record-call" && row.opcodeMatches,
  );
  const layoutACachedFlagRefreshRecovered = rows.some(
    (row) => row.role === "layout-a-cached-refresh-record-call" && row.opcodeMatches,
  );
  const layoutAZeroFlagRefreshRecovered = rows.some(
    (row) => row.role === "layout-a-zero-refresh-record-call" && row.opcodeMatches,
  );
  const layoutBTypeRecordRecovered = rows.some((row) => row.role === "layout-b-type-record-flags-0x118" && row.opcodeMatches);
  const layoutBConstructorFlagSeedRecovered = rows.some(
    (row) => row.role === "layout-b-constructor-packed-a8-store" && row.opcodeMatches,
  );
  const exactLayoutBParticleFlagProducerRows = 0;
  const summary = {
    rows: rows.length,
    opcodeMismatchRows,
    directAddRecordCallers: addRecordCallers.length,
    layoutBRegisterCallers: layoutBRegisterCallers.length,
    objectFlagAcAccessRows: objectFlagAcAccesses.length,
    objectFlagAcLoadRows,
    objectFlagAcStoreRows,
    directObjectFlagAcParticleMaskStoreContextRows: directObjectFlagAcParticleMaskStoreContexts.length,
    layoutARegistrationRecovered: rows.some((row) => row.role === "layout-a-add-record-call" && row.opcodeMatches),
    layoutATypeRecordRecovered,
    layoutAExplicitFlagRefreshRecovered,
    layoutACachedFlagRefreshRecovered,
    layoutAZeroFlagRefreshRecovered,
    layoutAExplicitRefreshDirectCallers: layoutAExplicitRefreshEntryCallers.length,
    layoutAExplicitRefreshEntryDirectCallers: layoutAExplicitRefreshEntryCallers.length,
    layoutAExplicitRefreshMidBlockDirectCallers: layoutAExplicitRefreshMidBlockCallers.length,
    layoutAExplicitRefreshCallsiteRows: layoutAExplicitRefreshCallsites.length,
    layoutAExplicitRefreshCallsiteOpcodeMismatchRows,
    layoutAExplicitRefreshParticleMaskRows,
    layoutAExplicitRefreshOnlyNonParticleFlags:
      layoutAExplicitRefreshCallsites.length > 0 &&
      layoutAExplicitRefreshCallsiteOpcodeMismatchRows === 0 &&
      layoutAExplicitRefreshParticleMaskRows === 0,
    layoutACachedRefreshDirectCallers: layoutACachedRefreshCallers.length,
    layoutACachedRefreshInnerDirectCallers: layoutACachedRefreshInnerCallers.length,
    layoutAZeroRefreshDirectCallers: layoutAZeroRefreshCallers.length,
    layoutARefreshCallsiteRows: layoutARefreshCallsites.length,
    layoutARefreshCallsiteOpcodeMismatchRows,
    layoutARefreshKeepCallsiteRows,
    layoutARefreshClearCallsiteRows,
    layoutARefreshConditionalCallsiteRows,
    layoutARefreshTypeGlobalRows: layoutARefreshTypeGlobals.length,
    layoutARefreshTypeGlobalOpcodeMismatchRows,
    layoutARefreshTypeGlobalsRecovered: layoutARefreshTypeGlobals.length > 0 && layoutARefreshTypeGlobalOpcodeMismatchRows === 0,
    layoutBRegistrationRecovered: rows.some((row) => row.role === "layout-b-add-record-call" && row.opcodeMatches),
    layoutBFlagReadRecovered: rows.some((row) => row.role === "layout-b-flags-load" && row.opcodeMatches),
    managerEntryStoreRecovered: rows.some((row) => row.role === "manager-record-entry-store" && row.opcodeMatches),
    backingFlagStorageRecovered: rows.some((row) => row.role === "backing-record-flags-store" && row.opcodeMatches),
    particleFlagFilterRecovered: rows.some((row) => row.role === "backing-filter-test-particle-mask" && row.opcodeMatches),
    candidateParticleMaskDefinitionRows: candidateParticleMaskRows,
    rejectedCandidateDirectProducerRows: rejectedCandidateRows,
    dynamicObjectFlagAcRows: dynamicObjectFlagAcRows.length,
    dynamicObjectFlagAcMaskProducerRows,
    layoutBTypeRecordRecovered,
    layoutBConstructorFlagSeedRecovered,
    typeRecordLiteralRejectedAsDirectProducer: rejectedCandidateRows > 0,
    dynamicObjectFlagAcPackedVisibilityCandidateRows: dynamicObjectFlagAcMaskProducerRows,
    dynamicObjectFlagAcPackedVisibilityRecovered: false,
    dynamicObjectFlagAcCandidateNotTiedToLayoutB: dynamicObjectFlagAcMaskProducerRows > 0 && layoutBTypeRecordRecovered,
    managerFlagRefreshRecovered: managerRefreshRows > 0 && backingRefreshRows > 0,
    exactLayoutBParticleFlagProducerRows,
    renderTakeoverAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current Android particle registration chain evidence; do not render particle visuals from this until exact object +0xac flag producers and PFX/emitter ownership are recovered",
    summary,
    particleMask: hex(particleMask),
    directAddRecordCallers: addRecordCallers,
    layoutBRegisterCallers,
    layoutAExplicitRefreshCallsites,
    layoutARefreshCallsites,
    layoutARefreshTypeGlobals,
    layoutARefreshCallers: {
      explicitRefreshD7FFDC: layoutAExplicitRefreshEntryCallers,
      explicitRefreshMidBlockD80000: layoutAExplicitRefreshMidBlockCallers,
      cachedRefreshD80044: layoutACachedRefreshCallers,
      cachedRefreshInnerD80064: layoutACachedRefreshInnerCallers,
      zeroRefreshD800A4: layoutAZeroRefreshCallers,
    },
    registrationChain: {
      managerAddRecord: "0x188eee0",
      managerRecordEntryField: "+0x8",
      backingRecordFlagsField: "+0x18",
      backingRecordManagerIndexField: "+0x1a",
      layoutA:
        "0xd7faa4 passes object+0x30, 0xd7faac passes w19 flags, 0xd7fab0 calls 0x188eee0, 0xd7fab4 stores returned record index at object+0xb0.",
      layoutAType:
        "0xd7fc38/0xd7fc3c prove the layout A type record stores 0xb8; 0xd7fc5c stores the type index in current-package global 0x30349e4.",
      layoutARefresh:
        "0xd7ffdc is the layout A explicit refresh entry; inside it 0xd80000 refreshes flags from caller w1, 0xd80044/d80064 refresh from cached object+0xb4, and 0xd800a4 clears flags to zero. All paths reach 0x188f020 with x3=sp+4 so backing record +0x18 is updated.",
      layoutAExplicitRefreshCallsite:
        "The only direct caller of 0xd7ffdc is 0x8abf54. Its normal branch passes w1=0x5 and its fallback branch passes w1=0x1, so this explicit refresh path is explained but remains negative evidence for particle mask 0x200.",
      layoutARefreshCallsiteClassification:
        "The 14 direct d80044/d800a4 callsites split into conditional input/object flag branches, unconditional keep-refresh calls, and unconditional clear-refresh calls. This is still a callsite classification, not a recovered resource/action semantic.",
      layoutARefreshTypeGlobals:
        "Current Android type-index globals 0x3035088, 0x3034ae0, 0x3034af0, 0x30369a8, and 0x3036d00 are now tied to their registration stores and read sites around the layout-A refresh owner paths. These are owner/type anchors, not particle producer proof.",
      layoutB:
        "0x8d3110 reads object+0xac flags, 0x8d3a20 passes object+0x30, 0x8d3a28 passes those flags, 0x8d3a2c calls 0x188eee0, 0x8d3a30 stores returned record index at object+0xb0.",
      dispatch:
        "0x8d5094 reloads object+0xac, 0x8d50bc passes x3=sp+4, and 0x8d50c4 dispatches through 0x188f020; backing vtable +0x20 then stores the refreshed 16-bit flags into backing record +0x18.",
      dynamicFlags:
        "0x8cb1ec updates object+0xac bits 7..14 as a packed visibility/coverage byte, but this belongs to the separate 0x210 candidate path and is not yet tied to the 0x118 layout B registration path.",
      layoutBType:
        "0x8d2f8c/0x8d2f90 prove the 0x8d310c/0x8d398c layout B type record stores 0x118, not 0x210; slot 0/1/4 callbacks are installed at 0x8d2fc0/0x8d2fd8/0x8d2ff0.",
      layoutBConstructor:
        "0x8d2dac/0x8d2dbc prove layout B constructor stores 0x0000000200000000 at object+0xa8, so initial object+0xac is 2 rather than the draw filter mask 0x200.",
    },
    objectFlagAcAccessSummary: {
      totalRows: objectFlagAcAccesses.length,
      loadRows: objectFlagAcLoadRows,
      storeRows: objectFlagAcStoreRows,
      directParticleMaskStoreContextRows: directObjectFlagAcParticleMaskStoreContexts.length,
      notableRows: objectFlagAcAccesses
        .filter((row) => row.address >= 0x8a0000 && row.address <= 0x8f0000)
        .slice(0, 80),
      directParticleMaskStoreContexts: directObjectFlagAcParticleMaskStoreContexts.slice(0, 40),
    },
    candidateFlagDefinitions: [
      {
        addressHex: "0x8cb0dc..0x8cb0e0",
        literal: "0x210",
        containsParticleMask: true,
        confidence: "rejected-as-direct-object-flag-producer",
        reason:
          "the literal contains 0x200, but the matching constructor 0x8cae08 does not copy it into object +0xac; it only clears bit 2 in the existing object field.",
      },
      {
        addressHex: "0x8d5468..0x8d546c",
        literal: "0x30",
        containsParticleMask: false,
        confidence: "negative-comparison",
        reason: "same nearby record shape stores a non-particle flag literal, helping separate normal scene entries from particle-capable entries.",
      },
    ],
    dynamicFlagProducers: [
      {
        addressHex: "0x8cb3a0",
        role: "computed-packed-coverage",
        field: "object+0xac bits 7..14",
        includesParticleMaskBit: true,
        evidence:
          "BFI inserts a computed 8-bit value at bit offset 7, but this has only been proven for the separate 0x210 candidate path.",
      },
      {
        addressHex: "0x8cb3b8",
        role: "packed-coverage-allbits",
        field: "object+0xac bits 7..14",
        includesParticleMaskBit: true,
        evidence: "ORR sets 0x7f80, which includes 0x200, but this has only been proven for the separate 0x210 candidate path.",
      },
    ],
    unresolved: [
      "the exact current-package producer that writes the 0x118 layout B object's +0xac with a value containing 0x200",
      "the exact caller state source that makes layout A d80044 keep flags alive or d800a4 clear them",
      "the resource/action semantic names behind the recovered layout A owner type globals and conditional state bits",
      "whether any indirect layout A explicit-refresh callback exists beyond the single proven direct 0xd7ffdc caller",
      "which PFX/emitter instance owns the object whose +0x30 subobject is stored into manager record +0x8",
      "the skill/action timeline call that creates or activates those particle-capable layout B objects",
      "the particle draw material/shader formula and primitive transform after the manager entry reaches the render queue",
    ],
    items: rows,
    layoutAExplicitRefreshCallsiteItems: layoutAExplicitRefreshCallsites,
    layoutARefreshCallsiteItems: layoutARefreshCallsites,
    layoutARefreshTypeGlobalItems: layoutARefreshTypeGlobals,
  };
}

function exportCurrentNativeParticleRegistrationChainAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeParticleRegistrationChainAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, ["addressHex", "role", "expectedOpcodeHex", "actualOpcodeHex", "opcodeMatches", "evidence"]);
  writeTsv(tsvOut.replace(/\.tsv$/, ".layout_a_explicit_refresh_callsites.tsv"), manifest.layoutAExplicitRefreshCallsiteItems, [
    "addressHex",
    "target",
    "refreshAction",
    "conditionClass",
    "flagValues",
    "containsParticleMask",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "primaryValueAddressHex",
    "primaryValueOpcodeMatches",
    "fallbackValueAddressHex",
    "fallbackValueOpcodeMatches",
    "fallbackBranchAddressHex",
    "fallbackBranchOpcodeMatches",
    "opcodeMatches",
    "evidence",
  ]);
  writeTsv(tsvOut.replace(/\.tsv$/, ".layout_a_refresh_callsites.tsv"), manifest.layoutARefreshCallsiteItems, [
    "addressHex",
    "target",
    "refreshAction",
    "conditionClass",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "evidence",
  ]);
  writeTsv(
    tsvOut.replace(/\.tsv$/, ".layout_a_refresh_type_globals.tsv"),
    manifest.layoutARefreshTypeGlobalItems.map((row) => ({
      role: row.role,
      globalAddressHex: row.globalAddressHex,
      typeLiteral: row.typeLiteral,
      registrationStoreAddressHex: row.registrationStore.addressHex,
      registrationStoreOpcodeMatches: row.registrationStore.opcodeMatches,
      typeLiteralAddressHex: row.typeLiteralInstruction.addressHex,
      typeLiteralOpcodeMatches: row.typeLiteralInstruction.opcodeMatches,
      controlAddressHex: row.controlInstruction.addressHex,
      controlOpcodeMatches: row.controlInstruction.opcodeMatches,
      readerAddressesHex: row.readers.map((reader) => reader.addressHex).join("|"),
      readerOpcodeMatches: row.readers.map((reader) => reader.opcodeMatches).join("|"),
      opcodeMatches: row.opcodeMatches,
      evidence: row.evidence,
    })),
    [
      "role",
      "globalAddressHex",
      "typeLiteral",
      "registrationStoreAddressHex",
      "registrationStoreOpcodeMatches",
      "typeLiteralAddressHex",
      "typeLiteralOpcodeMatches",
      "controlAddressHex",
      "controlOpcodeMatches",
      "readerAddressesHex",
      "readerOpcodeMatches",
      "opcodeMatches",
      "evidence",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeParticleRegistrationChainAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeParticleRegistrationChainAudit,
  exportCurrentNativeParticleRegistrationChainAudit,
};
