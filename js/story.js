/* =========================================================
 * story.js —— 凡人修仙传 主线（37 章，取自开发资料 04_任务系统）
 * 数据由 data/frxx/story.json 提供，七玄门→黄枫谷→乱星海→
 * 落云宗→灵界→仙界，完整对应 Q-M001 ~ Q-M037
 * ========================================================= */

function storyList() { return (window.FRXX && FRXX.loaded) ? FRXX.storyList() : (window.STORY || []); }
function storyIdx(p) { return p.storyIdx || 0; }
function storyUnlocked(p, i) {
  const s = storyList()[i];
  if (!s) return false;
  if (i <= (p.storyIdx || 0)) return true;
  return (p.realm || 0) >= s.req;
}
function storyAvailable(p) {
  const i = p.storyIdx || 0;
  const s = storyList()[i];
  return s && (p.realm || 0) >= s.req ? i : -1;
}
function storyStart(p, i) {
  const s = storyList()[i];
  if (!s) return { ok: false, msg: '此章尚未开启' };
  if (!storyUnlocked(p, i)) {
    const nm = (window.FRXX && FRXX.loaded) ? FRXX.realm(s.req).name : '更高境界';
    return { ok: false, msg: `需修至【${nm}】方可继续` };
  }
  return { ok: true, chapter: s, index: i };
}
function storyFinish(p, i) {
  if ((p.storyIdx || 0) !== i) return { ok: false, msg: '剧情顺序有误' };
  const s = storyList()[i];
  if (!s) return { ok: false, msg: '无此章节' };
  p.storyIdx = i + 1;
  SYS.applyReward(p, s.reward || {});
  return { ok: true, msg: `【${s.title}】完成！`, reward: s.reward, next: storyList()[i + 1] || null };
}

window.STORY = storyList();
window.storyIdx = storyIdx;
window.storyUnlocked = storyUnlocked;
window.storyAvailable = storyAvailable;
window.storyStart = storyStart;
window.storyFinish = storyFinish;
