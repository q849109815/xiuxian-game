/* =========================================================
 * story.js —— 主线剧情（章回体，对话框推进）
 * 章节按境界解锁，通关发放奖励并推进剧情指针
 * ========================================================= */

const STORY = [
  {
    id: 's1', title: '第一章 · 山村少年', req: 0, face: '🧓', who: '引路人',
    scenes: [
      { who: '引路人', face: '🧓', text: '少年，你醒了。昨夜你在青云山下被妖兽所伤，是老夫将你救回。' },
      { who: '你', face: '🧙', text: '这里是……我为何浑身无力？' },
      { who: '引路人', face: '🧓', text: '你的经脉被妖气侵蚀，寻常汤药无用。唯有引气入体，修成真元，方能自保。' },
      { who: '引路人', face: '🧓', text: '这枚【青灵草】你且收好。闭上眼，感受天地间的灵气……' },
    ],
    reward: { stone: 200, exp: 500, herb: 2 },
  },
  {
    id: 's2', title: '第二章 · 引气入体', req: 0, face: '🌿', who: '药童',
    scenes: [
      { who: '药童', face: '🧒', text: '哇，你能引气了！我在这儿采了三年药，才刚摸到门槛呢。' },
      { who: '你', face: '🧙', text: '只是些微末伎俩。老人家说，山中有妖兽出没？' },
      { who: '药童', face: '🧒', text: '后山竹林常有竹叶蛇伤人。你若想去，先去打坐巩固修为，我去给你采些灵草。' },
    ],
    reward: { stone: 400, exp: 1200, herb: 3 },
  },
  {
    id: 's3', title: '第三章 · 初遇妖踪', req: 1, face: '🐍', who: '竹叶蛇',
    scenes: [
      { who: '你', face: '🧙', text: '（竹林深处，一条青蛇盘踞在古树上，吐着信子。）' },
      { who: '竹叶蛇', face: '🐍', text: '嘶——何方道人，敢闯我竹林？' },
      { who: '你', face: '🧙', text: '妖孽，伤人在先，今日便拿你试剑！' },
      { who: '旁白', face: '📜', text: '你运转真元，一剑斩下。竹叶蛇化作青烟消散，留下一枚妖丹。' },
    ],
    reward: { stone: 800, exp: 3000, ore: 2 },
  },
  {
    id: 's4', title: '第四章 · 义庄惊魂', req: 1, face: '🧟', who: '尸王',
    scenes: [
      { who: '旁白', face: '📜', text: '荒郊义庄阴气冲天，村中接连有人失踪。你提剑踏入。' },
      { who: '尸王', face: '💀', text: '……活人……的血……' },
      { who: '你', face: '🧙', text: '哼，区区僵尸，也敢在此作祟！' },
      { who: '旁白', face: '📜', text: '激战过后，尸王伏诛。义庄地底露出一处古修洞府的入口。' },
    ],
    reward: { stone: 2000, exp: 8000, skill: 'sk_art_slash' },
  },
  {
    id: 's5', title: '第五章 · 金丹大道', req: 2, face: '🧞', who: '洞府残魂',
    scenes: [
      { who: '洞府残魂', face: '👤', text: '千年了……终于又有人踏入此地。' },
      { who: '你', face: '🧙', text: '前辈是？' },
      { who: '洞府残魂', face: '👤', text: '一缕残魂罢了。我看你根骨尚可，便将【焚天诀】传你。切记：结丹非终点，大道无穷。' },
      { who: '旁白', face: '📜', text: '一道金光没入眉心，你的丹田隐隐有雷音。' },
    ],
    reward: { stone: 5000, exp: 30000, skill: 'sk_heart_basic' },
  },
  {
    id: 's6', title: '第六章 · 赤焰火山', req: 3, face: '🔥', who: '炎魔',
    scenes: [
      { who: '旁白', face: '📜', text: '火山深处赤焰翻涌，炎魔盘坐岩浆之中。' },
      { who: '炎魔', face: '👹', text: '哈哈哈哈！又来一个送死的修士！' },
      { who: '你', face: '🧙', text: '借你真火炼我金身，正合我意！' },
      { who: '旁白', face: '📜', text: '烈焰焚身，你于绝境中悟得【三昧真火】之妙。' },
    ],
    reward: { stone: 15000, exp: 90000, skill: 'sk_art_fire' },
  },
  {
    id: 's7', title: '第七章 · 元婴显化', req: 3, face: '⚡', who: '天劫',
    scenes: [
      { who: '旁白', face: '📜', text: '天空阴云密布，紫雷翻滚。元婴劫至。' },
      { who: '你', face: '🧙', text: '来吧！我倒要看看，这天，能奈我何！' },
      { who: '旁白', face: '📜', text: '九道天雷落下，你的肉身几近崩毁，元婴却愈发凝实。' },
    ],
    reward: { stone: 40000, exp: 200000 },
  },
  {
    id: 's8', title: '第八章 · 九幽深渊', req: 5, face: '😈', who: '九幽冥王',
    scenes: [
      { who: '九幽冥王', face: '😈', text: '化神期的小辈，也敢闯我九幽？' },
      { who: '你', face: '🧙', text: '为寻【幽冥草】救一位故人，不得不来。' },
      { who: '九幽冥王', face: '😈', text: '故人？哈哈哈……修仙之人，最可笑的便是情义。' },
      { who: '旁白', face: '📜', text: '你沉默不语，剑光却照亮了整片深渊。' },
    ],
    reward: { stone: 100000, exp: 600000, herb: 5 },
  },
  {
    id: 's9', title: '第九章 · 天外天', req: 7, face: '🐉', who: '混沌祖龙',
    scenes: [
      { who: '混沌祖龙', face: '🐉', text: '吾镇守天外天万载，你是第一个走到此处的凡人。' },
      { who: '你', face: '🧙', text: '凡人又如何？我自凡尘来，要往大道去。' },
      { who: '混沌祖龙', face: '🐉', text: '好。便让吾看看，你这凡人，能走到哪一步。' },
    ],
    reward: { stone: 300000, exp: 2000000 },
  },
  {
    id: 's10', title: '终章 · 我为天道', req: 9, face: '☯️', who: '天道',
    scenes: [
      { who: '天道', face: '☯️', text: '你已登临绝顶。现在，告诉吾——何为道？' },
      { who: '你', face: '🧙', text: '我曾以为道是长生，是力量。' },
      { who: '你', face: '🧙', text: '如今我方明白：道，是那个在青云山下救我的老人，是竹林里递来灵草的孩童。' },
      { who: '天道', face: '☯️', text: '……善。此界，交予你了。' },
    ],
    reward: { stone: 1000000, exp: 5000000 },
  },
];

/* ---------- 剧情状态 ---------- */
function storyIdx(p) { return p.storyIdx || 0; }
function storyUnlocked(p, i) {
  const s = STORY[i];
  if (!s) return false;
  if (i <= (p.storyIdx || 0)) return true;          // 已看/当前
  return p.realm >= s.req;                           // 新章需境界
}
function storyAvailable(p) {
  const i = p.storyIdx || 0;
  return STORY[i] && p.realm >= STORY[i].req ? i : -1;
}

/** 开始播放第 i 章；返回是否已解锁 */
function storyStart(p, i) {
  if (!STORY[i]) return { ok: false, msg: '此章尚未开启' };
  if (!storyUnlocked(p, i)) return { ok: false, msg: `需修至【${GAME_CONFIG.realms[STORY[i].req].name}】境方可继续` };
  return { ok: true, chapter: STORY[i], index: i };
}

/** 完成一章：发奖 + 推进指针 */
function storyFinish(p, i) {
  if ((p.storyIdx || 0) !== i) return { ok: false, msg: '剧情顺序有误' };
  const s = STORY[i];
  p.storyIdx = i + 1;
  SYS.applyReward(p, s.reward);
  return { ok: true, msg: `【${s.title}】完成！`, reward: s.reward, next: STORY[i + 1] || null };
}

window.STORY = STORY;
window.storyIdx = storyIdx;
window.storyUnlocked = storyUnlocked;
window.storyAvailable = storyAvailable;
window.storyStart = storyStart;
window.storyFinish = storyFinish;
