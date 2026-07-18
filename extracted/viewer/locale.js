const ANIMATION_EXACT = new Map(
  Object.entries({
    AltAttack: "变式普攻",
    Attack: "普攻",
    CritAttack: "暴击",
    Dance: "舞蹈",
    DanceIntro: "舞蹈开场",
    Death: "死亡",
    Idle: "待机",
    IdleBrush: "草丛待机",
    Move: "移动",
    MoveBrush: "草丛移动",
    MoveFromBrush: "离开草丛",
    MoveIntoBrush: "进入草丛",
    MoveStart: "起步",
    MoveStartBrush: "草丛起步",
    MoveStop: "停步",
    MoveStopBrush: "草丛停步",
    Sprint: "冲刺",
    Stun: "眩晕",
    Taunt: "嘲讽",
    Withdraw: "回城",
  }),
);

const ANIMATION_PARTS = new Map(
  Object.entries({
    AltAttack: "变式普攻",
    Attack: "普攻",
    Back: "后撤",
    Default: "",
    DefaultAttack: "普攻",
    Brush: "草丛",
    Barrage: "弹幕",
    Cast: "施放",
    Charge: "蓄力",
    Charged: "蓄力",
    Charging: "蓄力中",
    Combat: "战斗",
    Crit: "暴击",
    CritAttack: "暴击",
    Dash: "冲刺",
    Death: "死亡",
    Empowered: "强化",
    End: "结束",
    Fast: "快速",
    Fire: "开火",
    Forward: "前进",
    Hit: "命中",
    Idle: "待机",
    Impact: "命中",
    Intro: "开场",
    Leap: "跳跃",
    Left: "左",
    Loop: "循环",
    Move: "移动",
    Out: "结束",
    Projectile: "弹道",
    React: "反应",
    Ready: "准备",
    Right: "右",
    Run: "奔跑",
    SelfDestruct: "自爆",
    Sheath: "收武器",
    Spawn: "登场",
    Start: "开始",
    Stop: "停止",
    Strafe: "横移",
    Ult: "大招",
    Ultimate: "大招",
  }),
);

function bilingual(chinese, english) {
  if (!chinese || chinese === english) return english;
  return `${chinese} / ${english}`;
}

function titleCaseToken(token) {
  return token ? token[0].toUpperCase() + token.slice(1) : token;
}

function splitIdentifier(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizedToken(token) {
  return String(token || "").toLowerCase();
}

function abilityTokenName(token) {
  const match = /^Ability0?([123])$/i.exec(token);
  if (!match) return "";
  return ["一技能", "二技能", "三技能"][Number(match[1]) - 1] || "";
}

function tierTokenName(token) {
  const match = /^Tier([1-9])$/i.exec(token);
  if (!match) return "";
  return `${match[1]}阶`;
}

function translatedAnimationTokens(tokens) {
  const translated = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = normalizedToken(token);
    const previous = normalizedToken(tokens[index - 1]);
    const next = normalizedToken(tokens[index + 1]);

    const abilityName = abilityTokenName(token);
    if (abilityName) {
      translated.push(abilityName);
      continue;
    }

    if (lower === "and" || lower === "default" || lower === "normal") continue;

    if (lower === "alt") {
      if (next === "attack") {
        translated.push("变式普攻");
        index += 1;
      } else {
        translated.push("变式");
      }
      continue;
    }

    if (lower === "crit") {
      translated.push("暴击");
      if (next === "attack") index += 1;
      continue;
    }

    if (lower === "attack") {
      if (next === "crit") {
        translated.push("暴击");
        index += 1;
      } else if (previous !== "crit" && previous !== "alt") {
        translated.push("普攻");
      }
      continue;
    }

    const titled = titleCaseToken(token);
    const canonical = titleCaseToken(String(token || "").toLowerCase());
    const generic =
      tierTokenName(token) ||
      ANIMATION_PARTS.get(token) ||
      ANIMATION_PARTS.get(titled) ||
      ANIMATION_PARTS.get(canonical) ||
      ANIMATION_EXACT.get(token) ||
      "";
    if (generic) translated.push(generic);
  }
  return translated;
}

export function localizeHeroName(name) {
  const english = String(name || "").trim();
  if (!english) return "";
  return english;
}

export function localizeSkinName(name) {
  const english = String(name || "").trim();
  if (!english) return "";
  return english;
}

export function localizeAnimationName(name) {
  const english = String(name || "").trim();
  if (!english) return "动作";
  if (ANIMATION_EXACT.has(english)) return bilingual(ANIMATION_EXACT.get(english), english);

  const tokens = splitIdentifier(english);
  const translated = translatedAnimationTokens(tokens);

  return translated.length ? bilingual(translated.join(""), english) : english;
}

export function localizeAbilityName(heroName, abilityName) {
  const english = String(abilityName || "").trim();
  if (!english) return "";
  const generic = abilityTokenName(english) || ANIMATION_PARTS.get(english) || ANIMATION_PARTS.get(titleCaseToken(english));
  return bilingual(generic, english);
}
