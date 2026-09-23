# Cloudflare 全套部署教程

> 《向僵尸开炮》网页版 —— 用 Cloudflare Pages 托管 + Worker 加速代理
> **全程免费，不需要信用卡，不需要买域名**

---

## 目录

- [零、为什么要用 Cloudflare](#零为什么要用-cloudflare)
- [一、注册 Cloudflare 账号](#一注册-cloudflare-账号)
- [二、部署游戏到 Cloudflare Pages](#二部署游戏到-cloudflare-pages)
- [三、配置自定义域名（可选）](#三配置自定义域名可选)
- [四、部署 Worker 加速代理](#四部署-worker-加速代理重点)
- [五、把加速地址填进游戏和后台](#五把加速地址填进游戏和后台)
- [六、构建额度的坑与解法](#六构建额度的坑与解法必看)
- [七、排错表](#七排错表)
- [八、上线检查清单](#八上线检查清单)

---

## 零、为什么要用 Cloudflare

你现在用的是 GitHub Pages（`q849109815.github.io`），有两个硬伤：

| 问题 | GitHub Pages | Cloudflare Pages |
|---|---|---|
| 国内访问（你在无锡） | ❌ 经常被墙 / 极慢 | ✅ 直连稳定 |
| 带宽 | 有软限制 | ✅ 完全无限 |
| 访问 GitHub API（存档读写） | ❌ 经常超时 | 需配合 Worker（教程第四部分） |

**Cloudflare Pages 和 GitHub Pages 读的是同一个仓库**，所以：
- 玩家存档不变（`data/zb/players/*.json`）
- 后台数据不变
- 排行榜不变
- **游戏代码一行都不用改**

两套网址可以同时存在，随时切换。

---

## 一、注册 Cloudflare 账号

### 1.1 打开注册页

浏览器打开：**https://dash.cloudflare.com/sign-up**

### 1.2 填写信息

- **Email**：填你的邮箱（QQ 邮箱、163 都行）
- **Password**：设一个密码（记牢，后面登录要用）

点 **Create Account**。

### 1.3 验证邮箱

去邮箱收验证邮件，点里面的链接激活。

> 💡 如果没收到，检查垃圾邮件箱。

### 1.4 进入控制台

激活后自动跳转，或者打开：**https://dash.cloudflare.com**

看到左侧菜单有 **Workers & Pages** 就说明注册成功了。

> ⚠️ **全程不会要你绑卡、不会要你付款**。如果看到让你选付费计划，直接跳过或选 Free。

---

## 二、部署游戏到 Cloudflare Pages

### 2.1 进入 Workers & Pages（⚠️ 2025 年底改版，路径变了）

Cloudflare 新版控制台**没有 `/pages` 这个地址了**，直接打开会显示 "Page not found"。

**方法一：官方直达链接（最稳，推荐）**

浏览器地址栏直接粘贴回车：

```
https://dash.cloudflare.com/?to=/:account/workers-and-pages
```

这个链接会自动识别你的账号并跳转，**不管菜单长什么样都能进去**。

**方法二：从菜单找**

新版左侧菜单结构是这样的（可能需要向下滚动）：

```
快速搜索...
组织 (Beta)
帐户
网站
我的个人资料
─────────────
Compute & AI        ← 找这个分组
  └─ Workers & Pages   ← 点它
```

> 💡 如果看不到 "Compute & AI"，用页面顶部的**搜索框**输入 `Workers`，在结果里点 **Workers & Pages**。
>
> 💡 有些账号显示在 **构建(Build)** → **Compute** → **Workers & Pages**，位置不同但名字一样。

**方法三：用 Account ID 拼链接**

登录控制台后看浏览器地址栏，里面有一串 32 位字符就是你的 Account ID：

```
https://dash.cloudflare.com/8f1a2b3c4d5e6f7890abcdef12345678/home/domains
                            └──────── 这串就是 Account ID ────────┘
```

复制它，拼成：

```
https://dash.cloudflare.com/你的AccountID/workers-and-pages
```

### 2.2 ⚠️ 关键一步：别掉进 Workers 的坑

进到 Workers & Pages 后，点右上角 **Create**。

**这时 Cloudflare 默认给你的是 Workers（后端代码）的创建页**，页面标题通常是 "Get started" 或 "Ship something new"，上面有三个大方块让你选模板。

**不要在这三个方块里点 "Continue with GitHub"** —— 那样创建的是 Worker 项目，不是 Pages，后面会全错。

**正确做法：** 把页面拉到**最底部**，找一行灰色小字：

```
Looking to deploy Pages? Get started
```

（中文界面可能显示「要部署 Pages？开始使用」）

**点这行小字**，才会进入真正的 Pages 部署流程。

> ⚠️ 如果不小心创建成了 Worker：回到 Workers & Pages 列表 → 进那个项目 → Settings → 最下面 **Delete**（删除），输入项目名确认。删掉重来，**不会影响你的 GitHub 仓库**。

### 2.3 选择连接方式

进入 Pages 流程后有两种方式：

| 方式 | 优点 | 缺点 |
|---|---|---|
| **Connect to Git** | 以后改代码自动同步 | 存档提交会触发重建，耗 500 次额度 |
| **Upload assets**（拖拽上传） | 简单，不耗构建额度 | 改代码要手动重传 |

**新手推荐先用 Upload assets**（见 2.4B），跑通了再考虑连 Git。

### 2.4A 方式一：Connect to Git（连 GitHub）

**① 授权 GitHub**

第一次会让你连 GitHub：
1. 点 **Connect GitHub**
2. 跳到 GitHub 授权页，点 **Authorize Cloudflare Pages**（绿色按钮）
3. 如果 GitHub 让你输密码，输你的 GitHub 密码

**② 选择仓库**

授权后回到 Cloudflare，看到你的仓库列表：

- 找到 **`xiuxian-game`**，点右边的 **Begin setup**（开始设置）

> 💡 如果列表里没有，点上方 "Only select repositories" 旁边的调整链接，把 `xiuxian-game` 加进授权范围。

然后跳到 [2.5 填写构建配置](#25-填写构建配置这一步最关键)。

### 2.4B 方式二：Upload assets（拖拽上传，新手推荐）

**适合你如果**：第一次部署、怕搞错、不想处理构建额度问题。

**① 准备文件夹**

把我给你的 `zombie` 文件夹整个留好，里面必须有 `index.html`（在最外层）。

**② 上传**

1. 在 Pages 流程里选 **Upload assets**（或直接拖文件那个方框）
2. **Project name**（项目名）填：`xiuxian-game`
3. 点 **Create project**
4. 把 **`zombie` 文件夹里的所有内容**拖进虚线框
   > ⚠️ 注意：拖的是**文件夹里面的内容**，不是 `zombie` 这个外层文件夹本身。
   > 拖完后应该能看到 `index.html` 在最外层。
5. 点 **Deploy site**（部署站点）
6. 等 1～2 分钟

**③ 拿到网址**

部署完给你 `https://xiuxian-game.pages.dev`，直接用。

> 💡 **用这种方式就不用填 2.5 的构建配置了**，因为根本没有构建步骤。
>
> 💡 以后我要改代码，你说一声，我改完你重新拖一次就行（换个文件夹名避免冲突，或直接覆盖）。

### 2.5 填写构建配置（⚠️ 这一步最关键，仅 Connect to Git 需要）

页面上是 **Set up builds and deployments** 表单，按下面填：

| 字段 | 填什么 | 说明 |
|---|---|---|
| **Project name**（项目名） | `xiuxian-game` | 默认就是这个，不用改。它会决定你的网址 |
| **Production branch**（生产分支） | `main` | 下拉框选 `main` |
| **Framework preset**（框架预设） | `None` | ⚠️ 一定要选 **None**，不要选 Vite / React 之类 |
| **Build command**（构建命令） | `exit 0` | ⚠️ 填这两个字（`exit 0`，中间有空格） |
| **Build output directory**（输出目录） | `/` | ⚠️ 就填一个斜杠 |
| **Root directory**（根目录） | 留空 | 高级选项，不用管 |

**为什么要填 `exit 0` 而不是留空？**
因为我们的游戏是纯静态 HTML，没有任何构建步骤。Cloudflare 官方推荐无框架项目填 `exit 0`，这样能正常启用 Pages Functions 等特性。填留空大部分情况也行，但 `exit 0` 更稳。

填完后核对一遍：

```
Project name:         xiuxian-game
Production branch:    main
Framework preset:     None
Build command:        exit 0
Build output:         /
```

### 2.6 开始部署

点 **Save and Deploy**（保存并部署）

会跳到部署详情页，看到一堆日志在滚动。等 **1～3 分钟**。

日志最后出现：

```
✅ Success: Your site was deployed!
```

或者右上角状态变绿，就成功了。

### 2.7 拿到网址

页面上会显示你的网址，长这样：

```
https://xiuxian-game.pages.dev
```

或者带随机后缀：

```
https://xiuxian-game-a1b.pages.dev
```

**这个网址国内基本都能直连，手机电脑都能开。**

| | 网址 |
|---|---|
| 🎮 游戏 | `https://xiuxian-game.pages.dev/` |
| ⚙️ 后台 | `https://xiuxian-game.pages.dev/admin/` |
| 🔑 后台口令 | `fj19941224` |

### 2.8 以后怎么更新代码？

**什么都不用做。** 你以后往 GitHub 推代码（比如让我改了游戏），Cloudflare 会自动检测到，自动重新构建，1～2 分钟后新版本就上线了。

---

## 三、配置自定义域名（可选）

如果你有自己的域名（比如在阿里云/腾讯云买的），可以绑到 Pages 上。

### 3.1 如果域名 DNS 在 Cloudflare

1. Pages 项目页 → **Custom domains** 标签
2. 点 **Set up a custom domain**
3. 输入你的域名或子域名，比如 `game.你的域名.com`
4. 点 **Activate domain**
5. Cloudflare 自动创建 DNS 记录和 SSL 证书，**几十秒生效**

### 3.2 如果域名在阿里云/腾讯云

1. 同样在 Pages → Custom domains → Set up a custom domain
2. 输入域名后，Cloudflare 会告诉你加一条 CNAME 记录
3. 去你的域名服务商后台，加一条解析：

```
类型:  CNAME
主机:  game
记录值: xiuxian-game.pages.dev
```

4. 等 DNS 生效（10 分钟到几小时）
5. SSL 证书 Cloudflare 会自动签发

> ⚠️ **国内服务器上的域名要备案**，不然可能被阻断。Cloudflare Pages 本身的 `pages.dev` 不需要备案。
> 如果没域名，**跳过这一节**，`pages.dev` 完全够用。

---

## 四、部署 Worker 加速代理（重点）

### 4.1 这一步解决什么问题

游戏存档要读写 GitHub 的 API（`api.github.com`）。国内访问这个地址**经常超时**，导致：
- 游戏底部显示「离线」
- 能单机玩，但**存档写不回云端**
- 换设备登录，进度丢失

Worker 就是一个**中转站**：游戏 →（访问很快的 Cloudflare）→ GitHub。

### 4.2 创建 Worker

**① 进入 Workers & Pages**

跟 2.1 一样，用直达链接最快：

```
https://dash.cloudflare.com/?to=/:account/workers-and-pages
```

**② 点 Create**

右上角点 **Create**。

**③ 注意：这次要留在 Workers 流程里**

跟 Pages 相反——**这次不要点底部那行 "Looking to deploy Pages" 小字**。

就在默认的 Workers 创建页，三个方块里选：

```
Start with Hello World!
```

（第三个选项，跳过配置，两步启动一个 hello world 应用）

点它右边的 **Get started**。

**④ 命名并部署**

- **Worker name** 填：`xx-proxy`
  > 只能用小写字母、数字、连字符，不能开头或结尾是连字符
- 点 **Deploy**（部署）

部署完会显示 "Your worker is available at..."，先不管。

> 💡 如果不小心点进了 Pages 流程，返回重新来一次，这次别点底部小字就行。

### 4.3 粘贴代理代码

1. 点 **Edit code**（编辑代码）按钮
2. 左边代码编辑区，**全选删光**（Ctrl+A 然后 Delete）
3. 粘贴下面这段完整代码：

```javascript
export default {
  async fetch(request, env) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': '*',
          'access-control-max-age': '86400',
        },
      });
    }

    const url = new URL(request.url);

    // 根路径返回 OK，用于检测连通性
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('OK', {
        headers: {
          'content-type': 'text/plain',
          'access-control-allow-origin': '*',
        },
      });
    }

    // 优先用 Worker 里配置的 Token（安全），没有就用请求带过来的
    let auth = request.headers.get('authorization');
    if ((!auth || auth.replace('Bearer', '').trim() === '') && env.GH_TOKEN) {
      auth = 'Bearer ' + env.GH_TOKEN;
    }

    // 转发必要的请求头
    const headers = new Headers();
    for (const k of ['accept', 'content-type', 'x-github-api-version', 'user-agent']) {
      const v = request.headers.get(k);
      if (v) headers.set(k, v);
    }
    if (auth) headers.set('authorization', auth);

    // 构造转发请求
    const init = { method: request.method, headers };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      init.body = await request.text();
    }

    // 转发到 GitHub API
    const res = await fetch('https://api.github.com' + url.pathname + url.search, init);
    const body = await res.text();

    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': '*',
      },
    });
  },
};
```

4. 点右上角 **Save and Deploy**（保存并部署）
5. 等几秒，显示部署成功

### 4.4 拿到 Worker 网址

部署成功后，页面顶部会显示你的 Worker 地址：

```
https://xx-proxy.你的账号.workers.dev
```

**复制这个地址**，下一节要用。

> 💡 完整的就是 `https://xx-proxy.` + 你的 Cloudflare 账号名 + `.workers.dev`

### 4.5 验证 Worker 是否正常

在浏览器地址栏粘贴你的 Worker 地址，回车。

**页面显示 `OK`** 就说明代理部署成功了。

如果显示别的东西或者报错，回到 4.3 检查代码有没有粘全。

### 4.6 把 Token 藏进 Worker（强烈推荐，5 分钟）

现在游戏代码里 Token 是明文写在 `js/net.js` 的，**公开仓库谁都能看到**。虽然它只对这一个仓库生效，风险有限，但能免则免。

**做法：**

1. 在 Worker 页面，点 **Settings**（设置）标签
2. 左边找 **Variables and Secrets**（变量和密钥）
3. 点 **Add**（添加）
4. 按下面填：

| 字段 | 值 |
|---|---|
| **Variable name**（变量名） | `GH_TOKEN` |
| **Value**（值） | 你的 GitHub 令牌（见下方「怎么拿令牌」） |
| **Type**（类型） | 选 **Secret (encrypted)** ← 加密，别人看不到 |

5. 点 **Save**（保存）
6. 回到 **Edit code**，再点一次 **Save and Deploy**（让配置生效）

**好处：**
- Worker 会自动用这个 Token 去访问 GitHub
- 前端**可以不带 Token** 了，游戏代码里那串就能删掉
- 别人看你的仓库也偷不到 Token

#### 怎么拿令牌（30 秒）

1. 打开 https://github.com/settings/personal-access-tokens
2. 点 **Fine-grained tokens** → **Generate new token**
3. **Token name** 随便填，比如 `zombie-proxy`
4. **Repository access** 选 **Only select repositories** → 只勾 `xiuxian-game`
5. **Permissions**（权限）里点开，**Contents** 选 **Read and write**
6. 点 **Generate token**
7. 复制生成的那串 `github_pat_...` 粘到上面的 Value 框

> 🔒 它只对这一个仓库生效，动不了你别的项目。随时可以在同一页面点 Delete 作废。

> ⚠️ **令牌不要发给任何人，也不要贴进公开文件里。** 我（AI）不需要知道它——部署 Worker 是你自己在 Cloudflare 后台操作，令牌只存在 Cloudflare 的加密变量里。

> ⚠️ 这一步做完，可以让我把前端 `js/net.js` 里写死的那串旧 Token 删掉，说一声就行。

---

## 五、把加速地址填进游戏和后台

### 5.1 填进游戏（每个玩家自己填一次）

1. 打开游戏（Pages 网址或 github.io 都行）
2. 底部导航 → **设置**（⚙️）
3. 上面切到 **网络** 标签
4. 找到 **「🚀 自定义加速地址」** 文本框
5. 粘贴你的 Worker 地址：`https://xx-proxy.你的账号.workers.dev`
6. 点 **保存加速地址**
7. 会弹窗提示保存成功，然后自动重新检测

**验证成功**：设置页顶部「网络状态」从红色 `○ 离线` 变成绿色 `● 已连接`。

### 5.2 填进后台

1. 打开 `https://xiuxian-game.pages.dev/admin/`
2. 输口令 `fj19941224` 进入
3. 左侧 → **⚙️ 系统设置**
4. 找到 **「🚀 自定义加速地址」**
5. 粘贴同样的地址
6. 点 **保存加速地址**
7. 点 **重新检测**

后台右上角的网络指示灯变绿就成功了。

### 5.3 让所有玩家默认走加速（可选）

上面是每个玩家自己填。如果你想让玩家一打开就走加速通道，可以让我把地址**写死进代码**（填在 `js/net.js` 的 `extra` 数组里），这样所有人自动生效，不用手动填。

**把你的 Worker 地址发给我，我来改。**

### 5.4 诊断网络

如果填了还是连不上，两边都有 **「逐端点诊断」** 按钮，点一下会把所有通道测一遍，显示每个的 HTTP 状态和耗时。把结果截图发我，我帮你看。

---

## 六、构建额度的坑与解法（必看）

### 6.1 问题

免费版每月 **500 次构建**。而你的游戏**每保存一次存档 = 一次 git 提交**。

Cloudflare Pages 监听 main 分支，**每次提交都会触发重建**。

算一下：
- 游戏每 30 秒自动保存一次
- 后台改数据也会提交
- 一个活跃玩家玩 1 小时 = 120 次提交 = 120 次构建

**500 次额度可能几天就耗光。** 耗光后不会收费，但 Pages 会停止更新（旧版本还能访问，新代码不生效）。

### 6.2 解法 A：把存档挪到独立分支（推荐，一劳永逸）

让存档写到一个单独的 `players` 分支，Pages 只监听 `main`。

**做法：**
1. 在 GitHub 仓库创建一个新分支 `players`
2. 让我把 `js/net.js` 里的 `branch` 从 `main` 改成 `players`（大概 1 行代码）
3. Pages 设置里确认 Production branch 还是 `main`

这样存档提交到 `players` 分支，**不会触发 Pages 重建**，500 次额度只用于你真正改代码的时候，非常充裕。

**跟我说一声"把存档挪到独立分支"，我来改代码 + 建分支。**

### 6.3 解法 B：手动部署（不用 Git 连接）

如果玩家很少，或者你觉得解法 A 麻烦：

1. Pages 项目 → **Settings** → **Builds & deployments**
2. 断开 Git 连接（或者一开始就用 Upload assets 而不是 Connect to Git）
3. 以后要更新代码，手动拖文件上传

**缺点**：以后我改了代码，你要自己传，不能自动同步。

### 6.4 解法 C：就让它耗（人少时够用）

如果你只有自己和小圈子几个人玩，一个月提交次数不多，可以先用着，等提示额度不足了再处理。

Cloudflare 超额**不会扣费**，只是构建失败。

### 6.5 查看用了多少次

Pages 项目页 → **Deployments** 标签，能看到每次部署记录和时间。

---

## 七、排错表

| 现象 | 原因 | 解决 |
|---|---|---|
| 注册时收不到邮件 | 被拦到垃圾箱 | 检查垃圾邮件；换个邮箱重试 |
| Connect to Git 看不到仓库 | GitHub 授权范围没包含 | 重新授权，选 "All repositories" 或手动加 `xiuxian-game` |
| 部署失败 "Page build failed" | 构建配置填错 | 检查 Framework preset 是 `None`、Build command 是 `exit 0`、Output 是 `/` |
| 网址打开 404 | 输出目录填错 | 确认是 `/` 不是 `/public` 或 `/dist` |
| 打开是旧版本 | 缓存 | **Ctrl+F5** 强制刷新；或用无痕窗口 |
| 页面能开但存档存不了 | GitHub API 连不上 | 走教程第四部分部署 Worker |
| 底部一直红点「离线」 | 同上也可能是端点问题 | 设置 → 网络 → 逐端点诊断 |
| Worker 网址打开不是 "OK" | 代码没粘全 | 回 Edit code 检查，重新 Save and Deploy |
| 填了加速地址还是连不上 | 地址粘错/没保存 | 地址必须是 `https://` 开头，不能有空格和末尾斜杠 |
| 后台进不去 | 口令错 | 口令是 `fj19941224`（注意大小写） |
| 部署一直转圈 | 构建排队 | 免费版 1 个并发构建，等 1～2 分钟 |
| 自定义域名不生效 | DNS 没生效 | 等 10 分钟～几小时；国内域名要备案 |

---

## 八、上线检查清单

部署完逐项打勾：

**Pages 部分**
- [ ] Cloudflare 账号注册并激活
- [ ] Pages 项目创建成功，状态是绿色 Success
- [ ] 拿到 `https://xiuxian-game.pages.dev` 网址
- [ ] 手机浏览器打开游戏正常（竖屏布局没乱）
- [ ] 电脑浏览器打开正常
- [ ] **Ctrl+F5** 强刷过，不是旧缓存
- [ ] 后台 `pages.dev/admin/` 能进，口令正确

**Worker 部分（解决联网）**
- [ ] Worker 创建成功
- [ ] 浏览器打开 Worker 地址显示 `OK`
- [ ] 地址已填进游戏「设置 → 网络 → 自定义加速地址」
- [ ] 地址已填进后台「系统设置 → 自定义加速地址」
- [ ] 游戏底部状态栏变**绿点「● 已连接」**
- [ ] 后台右上角指示灯变绿

**功能验证（最关键）**
- [ ] 游戏里创建角色成功
- [ ] 打一场战斗，能通关
- [ ] **去 GitHub 仓库 `data/zb/players/` 看，出现了你的 `.json` 存档** ← 这条通过说明整条链路通了
- [ ] 换设备（比如手机）打开，登录同一代号，进度还在
- [ ] 后台「玩家管理」能看到刚创建的角色
- [ ] 后台改一下金币，游戏里刷新能看到变化

---

## 附：你的三个网址

部署完后你会同时拥有：

| 用途 | 网址 | 说明 |
|---|---|---|
| 游戏（Cloudflare，推荐） | `https://xiuxian-game.pages.dev/` | 国内直连快 |
| 游戏（GitHub Pages，备用） | `https://q849109815.github.io/xiuxian-game/` | 有时抽风 |
| 后台 | 上面任一 + `/admin/` | 口令 `fj19941224` |
| Worker 加速 | `https://xx-proxy.你的账号.workers.dev` | 填进设置里 |

**数据完全共用**（同一份 GitHub 存档），哪个能用用哪个。

---

## 需要我帮忙的地方

做完后把下面任意一项告诉我，我直接帮你改代码：

1. **Worker 地址** → 我写死进代码，所有玩家自动生效，不用手动填
2. **"把存档挪到独立分支"** → 我改 `js/net.js` 的分支配置，彻底解决 500 次构建额度问题
3. **"删掉前端 Token"** → 配合 4.6 做过之后，前端就不再暴露 Token
4. **诊断结果截图** → 连不上时发我，我帮你看
