const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

async function importSearchUtils() {
  return import(`${pathToFileURL(path.join(root, "viewer", "search-utils.js")).href}?t=${Date.now()}`);
}

test("search index matches Chinese, English, pinyin, initials, and fuzzy subsequences", async () => {
  const { buildSearchIndex, searchIndexMatches } = await importSearchUtils();
  const index = buildSearchIndex([
    "火龙 史卡夫 / Skaarf",
    "深海苍龙 史卡夫",
    "Skaarf_Infinity_T1",
  ]);

  assert.equal(searchIndexMatches(index, "火龙"), true);
  assert.equal(searchIndexMatches(index, "Skaarf"), true);
  assert.equal(searchIndexMatches(index, "huolong"), true);
  assert.equal(searchIndexMatches(index, "huo long shi ka fu"), true);
  assert.equal(searchIndexMatches(index, "hlskf"), true);
  assert.equal(searchIndexMatches(index, "hlsf"), true);
  assert.equal(searchIndexMatches(index, "深海 skaarf"), true);
  assert.equal(searchIndexMatches(index, "shenhai canglong"), true);
  assert.equal(searchIndexMatches(index, "shcl"), true);
  assert.equal(searchIndexMatches(index, "yinfo"), false);
});

test("search index supports official Chinese hero names without hand-entered English", async () => {
  const { buildSearchIndex, searchIndexMatches } = await importSearchUtils();
  const index = buildSearchIndex(["隐狐 塔卡"]);

  assert.equal(searchIndexMatches(index, "隐狐"), true);
  assert.equal(searchIndexMatches(index, "yinhu"), true);
  assert.equal(searchIndexMatches(index, "yhtk"), true);
  assert.equal(searchIndexMatches(index, "yh taka"), true);
  assert.equal(searchIndexMatches(index, "yh ringo"), false);
});
