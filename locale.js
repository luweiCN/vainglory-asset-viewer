const HERO_NAMES = new Map(
  Object.entries({
    Adagio: "阿达吉奥",
    Alpha: "阿尔法",
    Anka: "安卡",
    Ardan: "阿尔丹",
    Baron: "巴隆",
    Blackfeather: "黑羽",
    Catherine: "凯瑟琳",
    Celeste: "星乐斯",
    Churnwalker: "钩索行者",
    Fortress: "魔狼",
    Glaive: "格莱夫",
    Grace: "格蕾丝",
    Grumpjaw: "巨牙",
    Gwen: "格温",
    Idris: "伊德瑞斯",
    Inara: "伊娜拉",
    Ishtar: "伊什塔尔",
    Joule: "朱尔",
    Kestrel: "凯斯卓",
    Koshka: "科斯卡",
    Krul: "克鲁尔",
    Lance: "兰斯",
    Leo: "里奥",
    Lyra: "莱拉",
    Malene: "玛莲",
    Magnus: "马格努斯",
    Miho: "美穗",
    Ozo: "奥佐",
    Petal: "佩兔",
    Phinn: "费恩",
    Reim: "莱姆",
    Reza: "雷萨",
    Ringo: "林戈",
    Rona: "罗娜",
    SAW: "索尔",
    Samuel: "萨缪尔",
    SanFeng: "三丰",
    Skaarf: "斯卡夫",
    Skye: "斯凯",
    Taka: "塔卡",
    Tony: "托尼",
    Varya: "瓦莉亚",
    Viola: "薇奥拉",
    Vox: "沃克斯",
    Warhawk: "战鹰",
    Yates: "耶茨",
    Ylva: "伊尔娃",
  }),
);

const SKIN_TERMS = new Map(
  Object.entries({
    DefaultSkin: "默认皮肤",
    Skin: "皮肤",
    Angel: "天使",
    Archer: "弓手",
    Bakuto: "博徒",
    Bunny: "兔女郎",
    Butterfly: "蝶翼",
    Cagefighter: "笼斗",
    Captain: "队长",
    Chinese: "东方",
    Chroma: "炫彩",
    CNY: "春节",
    Cyber: "赛博",
    Default: "默认",
    Dynasty: "王朝",
    Egypt: "埃及",
    Fall: "秋季",
    Fire: "烈焰",
    Forest: "森林",
    Fury: "狂怒",
    Glad: "角斗",
    Goth: "哥特",
    Hell: "地狱",
    Heli: "飞行员",
    Hlwn: "万圣节",
    Ice: "寒冰",
    Infinity: "无限",
    Kirin: "麒麟",
    KungFu: "功夫",
    Moon: "月光",
    Nether: "幽冥",
    Oni: "鬼武者",
    Pirate: "海盗",
    Queen: "女王",
    Rainbow: "彩虹",
    Red: "红色",
    RI: "特别版",
    Rock: "摇滚",
    Samurai: "武士",
    Santa: "圣诞",
    School: "学院",
    Shin: "新式",
    Snow: "雪地",
    Summer: "夏日",
    Taizen: "太禅",
    Terran: "陆战",
    Thunder: "雷霆",
    T1: "一阶",
    T2: "二阶",
    T3: "三阶",
    Vamp: "吸血鬼",
    Warg: "战狼",
    Xmas: "圣诞",
  }),
);

const ANIMATION_EXACT = new Map(
  Object.entries({
    AltAttack: "变式普攻",
    Attack: "普攻",
    CritAttack: "暴击普攻",
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
    Attack: "攻击",
    Brush: "草丛",
    Cast: "施放",
    CritAttack: "暴击普攻",
    Dash: "冲刺",
    Death: "死亡",
    Fire: "开火",
    Hit: "命中",
    Idle: "待机",
    Impact: "命中",
    Intro: "开场",
    Loop: "循环",
    Move: "移动",
    Out: "结束",
    Projectile: "弹道",
    Run: "奔跑",
    SelfDestruct: "自爆",
    Start: "开始",
    Stop: "停止",
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
    .replace(/[-\s]+/g, "_")
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean);
}

function abilityTokenName(token) {
  const match = /^Ability0?([123])$/i.exec(token);
  if (!match) return "";
  return ["一技能", "二技能", "三技能"][Number(match[1]) - 1] || "";
}

export function localizeHeroName(name) {
  const english = String(name || "").trim();
  if (!english) return "";
  return bilingual(HERO_NAMES.get(english), english);
}

export function localizeSkinName(name) {
  const english = String(name || "").trim();
  if (!english) return "";
  const tokens = splitIdentifier(english);
  const heroToken = tokens[0];
  const heroName = HERO_NAMES.get(heroToken);
  const translated = tokens
    .slice(heroName ? 1 : 0)
    .map((token) => SKIN_TERMS.get(token) || SKIN_TERMS.get(titleCaseToken(token)) || abilityTokenName(token) || "")
    .filter(Boolean);
  const chinese = translated.join("");
  return bilingual(chinese, english);
}

export function localizeAnimationName(name) {
  const english = String(name || "").trim();
  if (!english) return "动作";
  if (ANIMATION_EXACT.has(english)) return bilingual(ANIMATION_EXACT.get(english), english);

  const tokens = splitIdentifier(english);
  const translated = tokens
    .map((token) => {
      const titled = titleCaseToken(token);
      return abilityTokenName(token) || ANIMATION_EXACT.get(token) || ANIMATION_PARTS.get(token) || ANIMATION_PARTS.get(titled) || "";
    })
    .filter(Boolean);

  return translated.length ? bilingual(translated.join(""), english) : english;
}

export function localizeAbilityName(heroName, abilityName) {
  const english = String(abilityName || "").trim();
  if (!english) return "";
  const generic = abilityTokenName(english) || ANIMATION_PARTS.get(english) || ANIMATION_PARTS.get(titleCaseToken(english));
  return bilingual(generic, english);
}
