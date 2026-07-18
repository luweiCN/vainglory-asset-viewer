const fortressMinionDefinition = "characters/hero015/fortressminion.def";
const fortressPackResource = /^Characters\/Hero015\/Art\/hero015[^/]*pack[^/]*\.(?:glb|obj)$/i;

function normalizedResourcePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

export function modelSummonQualifier(item) {
  const rel = normalizedResourcePath(item?.rel);
  const sourceRelativePath = normalizedResourcePath(item?.sourceRelativePath).toLowerCase();
  const ownedByMinionDefinition = sourceRelativePath.endsWith(fortressMinionDefinition);
  if (!ownedByMinionDefinition && !fortressPackResource.test(rel)) return "";
  if (/packAlly/i.test(rel)) return "召唤物（友方）";
  if (/packEnemy/i.test(rel)) return "召唤物（敌方）";
  return "召唤物";
}

export function appendModelQualifier(label, item) {
  const text = String(label || "");
  const qualifier = modelSummonQualifier(item);
  if (!qualifier) return text;
  return text ? `${text} · ${qualifier}` : qualifier;
}
