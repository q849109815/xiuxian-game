# Cloudflare Worker 代理 · 照着做（免费）

## 为什么要做

| 问题 | 现在 | 做完之后 |
|---|---|---|
| 令牌暴露 | 前端 JS 里能翻到令牌，任何人可写你仓库 | 令牌存在 Cloudflare 机密里，**不再下发到玩家浏览器** |
| 配额 | GitHub 5000 次/小时，多玩家在线容易见底 → 存不进去/读不到 | 读请求缓存 10 秒，显著削峰 |
| 国内直连 | api.github.com 时通时不通 | 走 workers.dev，稳定 |

**费用：完全免费。** Cloudflare Workers 免费版 **10 万次请求/天**，本游戏量级远远用不完。

---

## 三步搞定（全程网页操作，不用敲命令）

### 1. 建 Worker

1. 打开 https://dash.cloudflare.com/ 登录（没有就注册，免费）
2. 左侧 **Workers 和 Pages** → **创建** → **创建 Worker**
3. 名字填 `xiuxian-gh-proxy` → **部署**
4. 部署完点 **编辑代码**，把仓库里 `worker/src/index.js` 的内容**整段粘贴**进去，覆盖原来的示例
5. 点右上角 **部署**

### 2. 存令牌（关键）

1. 在 Worker 页面 → **设置** → **变量和机密**
2. 点 **添加** ：
   - 名称：`GH_TOKEN`
   - 类型：选 **机密（Secret）**
   - 值：你的 GitHub 令牌
3. 保存

> 令牌需要有仓库读写权限。存成机密后它在 Cloudflare 后台不可再查看，也不会出现在任何玩家浏览器里。

### 3. 填进游戏

部署完你会得到一个地址，形如：
```
https://xiuxian-gh-proxy.你的名字.workers.dev
```

游戏里：**设置 → 自定义加速地址**，把上面这行粘进去（**只填域名根，不要带 `/https://api.github.com`**），点保存。

---

## 验证有没有生效

浏览器直接打开你的 Worker 地址，应当看到类似：

```json
{"ok":true,"service":"xiuxian-gh-proxy","token":"configured(secret)"}
```

- `token` 显示 `configured(secret)` → 令牌配置成功
- 显示 `MISSING` → 第 2 步没做，会退化成客户端带令牌（还能用，但令牌仍暴露）

游戏里进 **设置 → 逐端点诊断**，你的地址应当能连通。

---

## 安全设计（已内置）

- **路径白名单**：只代理 `q849109815/xiuxian-game` 这一个仓库和配额查询，别的路径直接 403。别人拿到你的地址也当不了通用代理。
- **写后清缓存**：写完立刻清掉该路径缓存，不会读到旧存档。
- **CORS**：已放行跨域和预检请求。

---

## 命令行部署（可选，给熟悉的人）

```bash
npx wrangler login
npx wrangler deploy          # 在 worker/ 目录下执行
npx wrangler secret put GH_TOKEN
```

---

## 想改缓存时长

`worker/src/index.js` 顶部：

```js
const CACHE_TTL = 10;   // 秒。改成 0 就是完全不缓存
```

存档是 30 秒写一次，10 秒缓存不会让玩家读到明显过期的数据；如果你想更实时，改成 3~5 即可。
