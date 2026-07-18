const PINYIN_TABLE = `
万:wan 三:san 上:shang 不:bu 丑:chou 丛:cong 丝:si 丹:dan
主:zhu 之:zhi 乐:le 云:yun 亚:ya 亡:wang 亮:liang 人:ren
仇:chou 仔:zai 他:ta 仙:xian 代:dai 伊:yi 会:hui 伤:shang
佐:zuo 佩:pei 使:shi 侍:shi 侠:xia 偶:ou 光:guang 克:ke
兔:tu 全:quan 公:gong 兰:lan 兵:bing 具:ju 典:dian 兽:shou
军:jun 冠:guan 冥:ming 冬:dong 冰:bing 冲:chong 凌:ling 凯:kai
击:ji 刀:dao 刃:ren 利:li 前:qian 剑:jian 加:jia 动:dong
勇:yong 化:hua 北:bei 卓:zhuo 南:nan 卡:ka 卫:wei 厄:e
厉:li 原:yuan 双:shuang 反:fan 发:fa 叛:pan 古:gu 史:shi
叶:ye 号:hao 司:si 吉:ji 吒:zha 吟:yin 呆:dai 哀:ai
哪:na 商:shang 嘴:zui 噬:shi 圣:sheng 地:di 型:xing 域:yu
基:ji 塔:ta 士:shi 壳:ke 备:bei 复:fu 夏:xia 夜:ye
大:da 天:tian 太:tai 夫:fu 头:tou 奇:qi 奥:ao 女:nv
妆:zhuang 妖:yao 妮:ni 姆:mu 姬:ji 娃:wa 娜:na 子:zi
孟:meng 学:xue 守:shou 安:an 宗:zong 宝:bao 客:ke 寒:han
对:dui 将:jiang 尊:zun 小:xiao 少:shao 尔:er 尼:ni 尾:wei
展:zhan 属:shu 屠:tu 岸:an 巡:xun 巨:ju 巫:wu 巴:ba
帅:shuai 师:shi 希:xi 帝:di 常:chang 幕:mu 幻:huan 幽:you
店:dian 庚:geng 府:fu 廷:ting 弗:fu 形:xing 彩:cai 影:ying
彻:che 徒:tu 德:de 心:xin 忆:yi 怒:nu 思:si 怪:guai
恩:en 恶:e 惑:huo 惠:hui 愤:fen 戈:ge 战:zhan 手:shou
托:tuo 护:hu 拉:la 拳:quan 捍:han 摔:shuai 擎:qing 救:jiu
斑:ban 斗:dou 斯:si 新:xin 方:fang 族:zu 无:wu 日:ri
时:shi 昂:ang 明:ming 星:xing 春:chun 暗:an 暮:mu 暴:bao
月:yue 木:mu 术:shu 朱:zhu 机:ji 条:tiao 极:ji 林:lin
枪:qiang 柯:ke 格:ge 梅:mei 械:xie 棍:gun 森:sen 模:mo
樱:ying 歌:ge 步:bu 武:wu 死:si 毒:du 水:shui 汐:xi
汽:qi 沃:wo 沌:dun 沙:sha 法:fa 波:bo 泰:tai 洛:luo
派:pai 流:liu 浪:lang 海:hai 涛:tao 深:shen 混:hun 温:wen
游:you 源:yuan 漠:mo 潮:chao 火:huo 灯:deng 灵:ling 烈:lie
焰:yan 熊:xiong 爆:bao 爵:jue 牌:pai 牛:niu 物:wu 特:te
犬:quan 狂:kuang 狐:hu 狱:yu 狼:lang 猎:lie 猩:xing 猫:mao
猴:hou 玉:yu 王:wang 玛:ma 玩:wan 珠:zhu 琳:lin 瑞:rui
瑟:se 瓜:gua 瓦:wa 生:sheng 甲:jia 电:dian 疯:feng 疾:ji
白:bai 皮:pi 盗:dao 盲:mang 眼:yan 矢:shi 石:shi 破:po
碎:sui 碧:bi 礼:li 神:shen 禅:chan 福:fu 离:li 种:zhong
科:ke 秘:mi 稻:dao 空:kong 笛:di 笼:long 箭:jian 粉:fen
精:jing 索:suo 紫:zi 红:hong 级:ji 纳:na 络:luo 绝:jue
统:tong 绯:fei 维:wei 绿:lv 缪:mou 网:wang 罗:luo 美:mei
羽:yu 翅:chi 翼:yi 老:lao 者:zhe 耶:ye 肉:rou 肯:ken
胜:sheng 能:neng 腕:wan 至:zhi 舞:wu 舰:jian 船:chuan 色:se
节:jie 花:hua 苍:cang 英:ying 范:fan 茨:ci 茶:cha 草:cao
荒:huang 莱:lai 莲:lian 萌:meng 萨:sa 落:luo 蒂:di 蒸:zheng
蓝:lan 虎:hu 虫:chong 虹:hong 蛇:she 蛛:zhu 蜂:feng 蜘:zhi
蜜:mi 蝶:die 血:xue 行:xing 袭:xi 装:zhuang 西:xi 角:jiao
警:jing 诞:dan 豹:bao 贤:xian 贵:gui 费:fei 赌:du 赎:shu
赛:sai 赤:chi 走:zou 起:qi 超:chao 跤:jiao 踪:zong 达:da
运:yun 进:jin 远:yuan 迪:di 迷:mi 追:zhui 逐:zhu 速:su
逻:luo 邪:xie 部:bu 醉:zui 里:li 重:zhong 野:ye 金:jin
钉:ding 钻:zuan 铁:tie 银:yin 锋:feng 锤:chui 长:chang 闪:shan
队:dui 阳:yang 阴:yin 阿:a 际:ji 院:yuan 隆:long 隐:yin
雅:ya 雨:yu 雪:xue 雷:lei 霜:shuang 青:qing 面:mian 音:yin
颂:song 领:ling 风:feng 飞:fei 食:shi 首:shou 驯:xun 骇:hai
骑:qi 骨:gu 骷:ku 髅:lou 高:gao 鬼:gui 魂:hun 魅:mei
魔:mo 鱼:yu 鸦:ya 鹰:ying 麒:qi 麟:lin 黄:huang 黑:hei
龙:long
`;

const PINYIN_BY_CHAR = new Map(
  PINYIN_TABLE.trim()
    .split(/\s+/)
    .map((pair) => {
      const [character, pinyin] = pair.split(":");
      return [character, pinyin];
    }),
);

const EXTRA_PINYIN_BY_CHAR = new Map(
  Object.entries({
    乐: ["yue"],
    行: ["hang"],
    重: ["chong"],
    种: ["chong"],
    长: ["zhang"],
  }),
);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pinyinSpellingVariants(pinyin) {
  const variants = [pinyin];
  if (pinyin.includes("v")) variants.push(pinyin.replaceAll("v", "u"));
  return unique(variants);
}

function pinyinOptionsForCharacter(character) {
  const primary = PINYIN_BY_CHAR.get(character);
  if (!primary) return [];
  const alternatives = EXTRA_PINYIN_BY_CHAR.get(character) || [];
  return unique([primary, ...alternatives].flatMap(pinyinSpellingVariants));
}

function addNormalizedVariant(variants, value) {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return;
  variants.add(normalized);
  variants.add(normalized.replace(/\s+/g, ""));
}

function pinyinVariantsForText(value) {
  const choices = [];
  for (const character of String(value || "")) {
    const options = pinyinOptionsForCharacter(character);
    if (options.length) choices.push(options);
  }
  if (!choices.length) return [];

  const variants = new Set();
  function addTokens(tokens) {
    variants.add(tokens.join(" "));
    variants.add(tokens.join(""));
    variants.add(tokens.map((token) => token[0]).join(""));
  }

  const primary = choices.map((options) => options[0]);
  addTokens(primary);
  choices.forEach((options, index) => {
    for (const option of options.slice(1)) {
      const next = [...primary];
      next[index] = option;
      addTokens(next);
    }
  });
  return [...variants];
}

export function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[_/\\.-]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}\p{Script=Han}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(values) {
  const variants = new Set();
  for (const value of values || []) {
    addNormalizedVariant(variants, value);
    for (const pinyin of pinyinVariantsForText(value)) addNormalizedVariant(variants, pinyin);
  }
  return [...variants];
}

function fuzzyContains(target, query) {
  if (!query) return true;
  if (target.includes(query)) return true;
  let queryIndex = 0;
  for (const character of target) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function indexHas(index, query) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) return true;
  const compact = normalized.replace(/\s+/g, "");
  return (index || []).some((variant) => fuzzyContains(variant, normalized) || fuzzyContains(variant, compact));
}

export function searchIndexMatches(index, query) {
  const normalized = normalizeSearchValue(query);
  if (!normalized) return true;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => indexHas(index, part))) return true;
  return indexHas(index, normalized);
}
