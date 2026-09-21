/**
 * balance_sim.cjs —— 数值平衡模拟：纯挂机从炼气1层到真仙9层需要多久
 * 用法：node scripts/balance_sim.cjs
 */
const fs = require('fs');
globalThis.window = { GAME_CONFIG: JSON.parse(fs.readFileSync('data/config/game.json', 'utf8')), NOTICE: { events: {} } };
new Function(fs.readFileSync('js/engine.js', 'utf8').replace('window.ENGINE', 'globalThis.ENGINE'))();
const E = globalThis.ENGINE;

const p = E.newPlayer('sim', 'sim');
const maxRealm = window.GAME_CONFIG.realms.length - 1;
let sec = 0;
const marks = [];
let lastRealm = 0;
while (!(p.realm === maxRealm && p.layer === 8) && sec < 3600 * 24 * 400) {
  E.gainExp(p, E.expPerSec(p));
  sec++;
  if (p.realm !== lastRealm) {
    marks.push(`${window.GAME_CONFIG.realms[p.realm].name}：第 ${(sec / 3600).toFixed(1)} 小时（累计 ${sec} 秒）`);
    lastRealm = p.realm;
  }
  // 每次升层自动渡劫
  if (p.layer === 8 && p.realm < maxRealm) { E.breakthrough(p); }
}
console.log(marks.join('\n'));
console.log('通关总时长：', (sec / 3600).toFixed(1), '小时（纯挂机，不含战斗与装备加成）');
console.log('最终每秒修为：', Math.round(E.expPerSec(p)));
