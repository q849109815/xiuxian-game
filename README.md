# 凡人修仙 · 网页版（GitHub 当云端的放置修仙游戏）

一套**完全免费**的多人网页修仙游戏：挂机修炼 + 自动战斗刷怪 + 掉落法宝 + 天骄榜 + 管理后台。
数据全部存在 **GitHub 仓库**里，不花一分钱、不需要买服务器。

---

> **第一次架设请直接看 [`部署教程.md`](部署教程.md)** —— 手把手、每一步都有检查点的完整教程。
> 本文件是结构与原理说明。

## 一、它到底怎么跑起来的？

```
浏览器（手机/电脑）
   │  读写入 JSON 存档  ──►  GitHub 仓库 data/players/你的ID.json
   │  读配置/公告/榜单   ──►  data/config/*.json、data/leaderboard.json
   │
GitHub Actions（每 10 分钟自动跑一次，充当"免费服务器"）
   └── 扫描所有玩家存档 → 汇总出排行榜 + 统计 + 每日备份
```

- **游戏本体**：`index.html`（纯静态，双击就能玩）
- **玩家存档**：GitHub 仓库里的一个 JSON 文件（一人一个文件，互不冲突）
- **排行榜/统计**：GitHub Actions 定时跑脚本生成（玩家只读，零并发冲突）
- **后台管理**：`admin/index.html`（同一个仓库，读写同样的文件）

**连不上 GitHub 的解决办法（已内置 + 可选加固）见第五节，这是本项目最花心思的地方。**

---

## 二、十分钟上线（照抄命令即可）

### 第 1 步：建仓库
1. 打开 https://github.com/new
2. 仓库名填 `xiuxian-game`，选 **Public**，勾上 Add a README
3. 点 Create repository

### 第 2 步：建一个专用 Token（钥匙）
1. 右上角头像 → **Settings** → 左下 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Token name：`xiuxian`
3. Resource owner 选你自己；**Repository access 选 "Only select repositories" → 只勾 `xiuxian-game`**
4. Permissions → 展开 **Contents** → 选 **Read and write**；再展开 **Actions** → 选 **Read and write**（后台手动触发汇总要用）
5. 生成后复制那串 `github_pat_...`（只显示一次，先存到记事本）

> 只给这一个仓库的权限，就算泄露也影响不到你别的项目。

### 第 3 步：把代码传上去
把本文件夹**全部内容**上传到仓库根目录（推荐用命令行）：

```bash
cd xiuxian                        # 本文件夹
git init
git add . && git commit -m "init xiuxian"
git branch -M main
git remote add origin https://github.com/你的用户名/xiuxian-game.git
git push -u origin main
```

上传时 GitHub 会要你登录：用户名填你的 GitHub 名，密码填**第 2 步的 Token**（不是登录密码）。

### 第 4 步：改 3 个配置（关键！）
**最省事的办法**：双击本地的 `setup.html`，填用户名 / 仓库名 / Token，一键生成配置、还能直接测试连接，复制粘贴回 `js/api.js` 即可。

也可以手动改仓库里的 `js/api.js`，最上面几行改成你自己的：

```js
const GH = {
  owner: '你的GitHub用户名',          // 例：zhangsan
  repo:  'xiuxian-game',             // 仓库名
  branch:'main',
  token: 'github_pat_你的Token',      // 第 2 步复制的那串
  extraEndpoints: [],
};
```

改完点页面下方 **Commit changes** 提交。（后台 `admin/` 读的是同一个文件，不用改两遍。）

### 第 5 步：开 Actions（让它自动汇总榜单）
仓库页面 → **Settings** → 左侧 **Actions** → **General** → 最下面 Workflow permissions 选 **Read and write permissions** → Save。
然后到 **Actions** 页，左边点 `定时汇总排行榜与统计` → 右侧 **Run workflow**（先手动跑一次，确认绿色✔）。

### 第 6 步：开 GitHub Pages（拿到网址）
**Settings** → **Pages** → Source 选 **Deploy from a branch** → Branch 选 `main` / 文件夹选 `/(root)` → Save。
等 1～2 分钟，会给出网址：

- 游戏：`https://你的用户名.github.io/xiuxian-game/`
- 后台：`https://你的用户名.github.io/xiuxian-game/admin/`

手机、电脑浏览器打开就能玩，同一网址发给朋友就是多人联机。

---

## 三、后台怎么用

打开 `.../xiuxian-game/admin/`：

| 页面 | 能干什么 |
|---|---|
| 📊 数据看板 | 总人数、10 分钟在线、今日新增、灵石总量、境界分布、活跃榜 |
| 👥 玩家管理 | 搜索道号 → 改灵石/修为/境界/击杀、封禁、删档、直接改原始 JSON |
| 📢 公告活动 | 发全服公告、一键开**双倍修为/双倍灵石**（玩家端 2 分钟内自动生效，不用重新部署） |
| 🎛 数值配置 | 在线改 `game.json`：境界经验、怪物属性、掉落率、强化消耗、礼包码 |
| 🧰 工具 | 手动触发一次汇总、清缓存 |

**发补偿**：玩家管理 → 搜到玩家 → 灵石栏填 `当前值+补偿数`（比如 500 就是加 500）→ 点「发放补偿」。

---

## 四、加内容（不用写代码）

所有数值都在 `data/config/game.json`，后台直接改或本地改完提交：

- 加地图：往 `maps` 数组里加一项（`name/icon/minRealm/monsters/exp/stone/dropRate`）
- 加境界：往 `realms` 数组加（`name/color/expBase/expGrowth`）
- 调强度：`baseAttr`、`growthPerRealm`、`cultivate`（修炼速度）、`breakthrough`（渡劫成功率）
- 加礼包码：`giftCodes` 里加 `"CODE123": { "stone": 888, "desc": "..." }`

---

## 五、GitHub 连不上怎么办（重点）

国内访问 `api.github.com` 确实经常抽风，项目做了 **4 层保险**，一层层兜底：

### 第 1 层：多端点自动测速 + 自动切换（已内置 ✅）
`js/api.js` 里内置了一组备用地址（公共反代 + CDN 镜像）。游戏启动时并发测速，**谁快用谁**；请求失败自动换下一个端点并重试，坏掉的端点会被临时拉黑。完全不用你管。

### 第 2 层：断网照样玩 + 离线写队列（已内置 ✅）
- 配置读不到 → 用浏览器缓存继续玩
- 存档传不上去 → 存进 localStorage 队列，**联网后自动补传**（设置页能看到"待上传存档"数量，也能手动点「立即同步」）
- 后台每 20 秒重试一次队列

### 第 3 层：自建免费加速代理（强烈建议，5 分钟搞定）
公共镜像哪天都会挂，自己的最稳。用 Cloudflare Worker（免费，10 万次/天）：

```bash
cd worker
npx wrangler login          # 会打开浏览器授权
npx wrangler deploy         # 部署
npx wrangler secret put GH_TOKEN   # 粘贴第 2 步的 Token（这样前端就不用暴露 Token）
```

部署完会得到 `https://xxx.xxx.workers.dev`，在游戏里 **设置 → 自定义加速地址** 填进去（一行一个），保存后自动重新测速。
配了 secret 之后，可以把 `js/api.js` 的 `token` 留空 `''`，Token 由 Worker 注入，前端彻底不暴露。

> 想更稳？在 Cloudflare 里给 Worker 绑个自己的域名；没有域名也能直接用 workers.dev。

### 第 4 层：换更快的免费托管（可选）
`*.github.io` 国内也常不稳。把仓库接到 **Cloudflare Pages**（免费、不限流量、自动同步 GitHub 提交）：
Cloudflare 控制台 → Workers & Pages → Create → Pages → 连 GitHub → 选 `xiuxian-game` → 构建命令留空、输出目录填 `/` → 部署。
得到 `https://xxx.pages.dev`，体验通常比 github.io 好，且**和你 GitHub 库里的数据完全共用**。

---

## 六、手机上怎么玩

1. 手机浏览器打开 Pages 网址（建议加到桌面快捷方式，像 App 一样）
2. 电脑上想本地试玩：在本文件夹执行 `python3 -m http.server 8000`，浏览器打开 `http://localhost:8000`（直接双击 index.html 也行，但个别浏览器会拦截本地文件请求 GitHub，用本地服务器最稳）
3. 界面本身是移动端优先设计的，单手可操作

**换设备**：记住自己的道号 + 口令，在新设备登录即可，存档在云端。

---

## 七、目录结构

```
├── index.html            游戏主页面（修炼/历练/背包/排行/公告/设置）
├── setup.html            一键配置向导（填用户名/Token 自动生成配置 + 测试连接）
├── 部署教程.md           手把手上架教程
├── css/style.css         全部动画：星空粒子、灵气上升、战斗打击、渡劫光效
├── js/api.js             ★GitHub 数据层：多端点切换/重试/缓存/离线队列
├── js/engine.js          玩法核心：属性、修为、突破、战斗、掉落、离线收益
├── js/ui.js              界面渲染 + 动画控制
├── js/main.js            登录、主循环、战斗流程、自动存档
├── admin/index.html      管理后台页面
├── admin/js/admin.js     后台逻辑（玩家/公告/配置/看板）
├── data/config/game.json     游戏数值（境界、地图、怪物、掉落、礼包码）
├── data/config/notice.json   公告与活动（双倍开关）
├── data/players/*.json       玩家存档（一人一个文件，自动创建）
├── data/leaderboard.json     天骄榜（Actions 生成）
├── data/stats.json           统计（Actions 生成）
├── scripts/aggregate.mjs     汇总脚本（Actions 调用）
├── .github/workflows/aggregate.yml  每 10 分钟自动跑一次
└── worker/                   可选：Cloudflare Worker 加速代理
```

---

## 八、避坑指南

| 问题 | 说明 / 处理 |
|---|---|
| **Token 在前端会暴露** | 只用「仅对本仓库可读写的 fine-grained token」，纯游戏数据影响可控。在意就用第五节第 3 层的 Worker 注入 Token，前端留空 |
| **存档 = 一次 git commit** | 每个玩家 30 秒存一次档，仓库历史会变多。人多了可以把自动存档间隔改成 60 秒（`js/main.js` 里 `setInterval(() => save(), 30000)`） |
| **API 速率限制** | 带 Token 是 5000 次/小时。正常玩远达不到；如果玩家暴涨，把存档间隔调大 |
| **Pages 有几十秒延迟** | 改了页面代码后要等 Pages 重新部署；但改 `data/config/*.json` **不受影响**，玩家刷新即生效 |
| **榜单不是实时的** | 由 Actions 每 10 分钟汇总一次，属正常设计 |
| **Actions 不执行** | GitHub 会禁用 60 天无活动的定时任务，去 Actions 页手动 Run 一次即可复活 |
| **突破失败？** | 修满当前境界 9 层后点「渡劫突破」，成功率随境界递减，失败会损失部分修为——这是设计 |

---

## 九、下一步可以往哪加

- 宗门 / 师徒：在玩家 JSON 里加 `sect` 字段，后台加个宗门管理页
- 世界 Boss：在 `data/config/` 加 `boss.json`，玩家读同一份血量文件（写入用 CAS 重试，已在 `api.js` 里实现 409 自动重试）
- 聊天/留言板：`data/chat.json`，Actions 定时归档旧消息避免文件过大
- 交易行：`data/market.json`，上架即写入，同样靠 409 重试解决并发

需要哪个我可以直接给你加上。
家读同一份血量文件（写入用 CAS 重试，已在 `api.js` 里实现 409 自动重试）
- 聊天/留言板：`data/chat.json`，Actions 定时归档旧消息避免文件过大
- 交易行：`data/market.json`，上架即写入，同样靠 409 重试解决并发

需要哪个我可以直接给你加上。
