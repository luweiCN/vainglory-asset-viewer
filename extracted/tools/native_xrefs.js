const fs = require("node:fs");

function parseInteger(value) {
  return Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
}

function parseInstructionLine(line) {
  const match = line.match(/^\s*([0-9a-fA-F]+):\s+([a-z0-9.]+)\s*(.*)$/);
  if (!match) return null;
  return {
    address: Number.parseInt(match[1], 16),
    mnemonic: match[2],
    operands: match[3].trim(),
    text: line,
  };
}

function parseAdrp(instruction) {
  if (!instruction || instruction.mnemonic !== "adrp") return null;
  const match = instruction.operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)/);
  if (!match) return null;
  return {
    register: match[1],
    pageAddress: parseInteger(match[2]),
  };
}

function parseAdd(instruction) {
  if (!instruction || instruction.mnemonic !== "add") return null;
  const match = instruction.operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)/);
  if (!match) return null;
  return {
    destination: match[1],
    source: match[2],
    immediate: parseInteger(match[3]),
  };
}

function findAdrpAddXrefs(lines, targets) {
  const targetsByAddress = new Map(targets.map((target) => [target.address, target]));
  const activePages = new Map();
  const matches = [];

  for (const line of lines) {
    const instruction = parseInstructionLine(line);
    if (!instruction) continue;

    const adrp = parseAdrp(instruction);
    if (adrp) {
      activePages.set(adrp.register, {
        address: instruction.address,
        pageAddress: adrp.pageAddress,
        text: instruction.text,
      });
      continue;
    }

    const add = parseAdd(instruction);
    if (!add) continue;

    const active = activePages.get(add.source);
    if (!active) continue;

    const targetAddress = active.pageAddress + add.immediate;
    const target = targetsByAddress.get(targetAddress);
    if (!target) continue;

    matches.push({
      targetName: target.name,
      targetAddress,
      adrpAddress: active.address,
      xrefAddress: instruction.address,
      register: add.source,
      adrpText: active.text,
      xrefText: instruction.text,
    });
  }

  return matches;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

module.exports = {
  findAdrpAddXrefs,
  parseInstructionLine,
  readLines,
};
