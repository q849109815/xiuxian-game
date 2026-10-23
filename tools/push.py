#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
僵尸开炮 · 统一上传 / 校验工具
用法:
  python3 push.py check      # 只核对线上 vs 本地
  python3 push.py push       # 上传所有不一致的文件，并逐个复核
  python3 push.py push 备注  # 自定义 commit 信息
"""
import json, urllib.request, base64, hashlib, sys, os

# .../zombie/tools/push.py -> 上三级 = /data/workspace
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO = 'q849109815/xiuxian-game'
TOKEN = open(os.path.join(ROOT, '.ghtoken')).read().strip()
H = {'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json',
     'User-Agent': 'push', 'Content-Type': 'application/json'}

# 完整文件清单 —— css/style.css 必须在此，历史上因遗漏导致样式改动从未上线
FILES = [
    'index.html',
    # 美术资源：章节 CG 过场图。历史上清单只含代码，导致美术交图后从未入库、
    # 线上引用 404。新增资源必须显式登记，否则「本地有、线上无」。
    'assets/cg/cg01_horde.jpg', 'assets/cg/cg02_defense.jpg', 'assets/cg/cg03_rebuild.jpg',
    'assets/cg/cg04_tunnel.jpg', 'assets/cg/cg05_bridge.jpg', 'assets/cg/cg06_field.jpg',
    'assets/cg/cg07_fallout.jpg', 'assets/cg/cg08_rift.jpg', 'assets/cg/cg09_nest.jpg',
    'assets/cg/cg10_final.jpg',
    # V1.1.0 冲刺2：第 11-15 章 CG（cg11~cg15）
    'assets/cg/cg11_outpost.jpg', 'assets/cg/cg12_dam.jpg', 'assets/cg/cg13_mine.jpg',
    'assets/cg/cg14_lab.jpg', 'assets/cg/cg15_core.jpg',
    # 角色立绘：V1.0.2 发现 assets/char/ 整目录从未登记 —— 美术交了图、
    # 线上引用却是 404（"本地有、线上无"）。新增资源必须显式登记。
    'assets/char/c01_jack.jpg', 'assets/char/c02_aila.jpg', 'assets/char/c03_lei.jpg',
    'assets/char/c04_nike.jpg',
    'assets/char/c05_chen.jpg', 'assets/char/c06_kane.jpg', 'assets/char/c07_ying.jpg',
    'assets/char/c08_lin.jpg',
    # V1.0.3 角色 8→12：新增 4 名角色立绘（c09~c12），必须登记否则线上 404
    'assets/char/c09_zero.jpg', 'assets/char/c10_bai.jpg', 'assets/char/c11_gang.jpg',
    'assets/char/c12_jin.jpg',
    # V1.0.4 角色 12→16：新增 4 名角色立绘（c13~c16），同理必须登记
    'assets/char/c13_hu.jpg', 'assets/char/c14_tiebi.jpg', 'assets/char/c15_shu.jpg',
    'assets/char/c16_lian.jpg',
    # 场景图：V1.0.2 同样发现 assets/scene/ 整目录从未登记（含本次新增的 4 张）。
    'assets/scene/bridge.jpg', 'assets/scene/city.jpg', 'assets/scene/factory.jpg', 'assets/scene/field.jpg', 'assets/scene/final.jpg', 'assets/scene/main_bg.jpg', 'assets/scene/nest.jpg', 'assets/scene/rift.jpg', 'assets/scene/snow.jpg', 'assets/scene/tunnel.jpg', 'assets/scene/wasteland.jpg',
    # V1.1.0 冲刺2：第 11-15 章新场景
    'assets/scene/outpost.jpg', 'assets/scene/dam.jpg', 'assets/scene/mine.jpg',
    'assets/scene/lab.jpg', 'assets/scene/core.jpg',
    'css/tokens.css', 'css/style.css',
    'js/audio.js', 'js/battle.js', 'js/chibi.js', 'js/config.js', 'js/juice.js',
    'js/engine.js', 'js/main.js', 'js/net.js', 'js/ops.js', 'js/ui.js', 'js/user.js',
    'admin/index.html', 'admin/css/admin.css', 'admin/js/core.js', 'admin/js/pages.js',
    'data/config/core.json', 'data/config/meta.json',
    # 图标：V1.0.3 资产守卫扫出 146 条「代码引用但清单未登记」。线上文件确实存在
    # （早期脚本单独传过），但清单没登记意味着日后改动不会被上传——与 char/scene
    # 两个目录曾栽的坑同类。全部补齐登记。
    'assets/icon/av_a01.png',
    'assets/icon/bd_armory.jpg',
    'assets/icon/bd_hospital.jpg',
    'assets/icon/bd_lab.jpg',
    'assets/icon/bd_warehouse.jpg',
    'assets/icon/cdx_gun.jpg',
    'assets/icon/cdx_skin.jpg',
    'assets/icon/cdx_zombie.jpg',
    'assets/icon/contrib.jpg',
    'assets/icon/d1_gold.jpg',
    'assets/icon/d3_box.jpg',
    'assets/icon/diff_hard.jpg',
    'assets/icon/diff_hell.jpg',
    'assets/icon/diff_normal.jpg',
    'assets/icon/eq_armor.jpg',
    'assets/icon/eq_boots.jpg',
    'assets/icon/eq_gloves.jpg',
    'assets/icon/eq_helmet.jpg',
    'assets/icon/eq_necklace.jpg',
    'assets/icon/eq_orb.jpg',
    'assets/icon/eq_ring.jpg',
    'assets/icon/eq_weapon.jpg',
    'assets/icon/gem_b.jpg',
    'assets/icon/gem_g.jpg',
    'assets/icon/gem_p.jpg',
    'assets/icon/gem_r.jpg',
    'assets/icon/gp01.jpg',
    'assets/icon/gp02.jpg',
    'assets/icon/gp03.jpg',
    'assets/icon/gp04.jpg',
    'assets/icon/gp05.jpg',
    'assets/icon/gp06.jpg',
    'assets/icon/hud_auto.png',
    'assets/icon/hud_close.png',
    'assets/icon/hud_diamond.png',
    'assets/icon/hud_finger.png',
    'assets/icon/hud_gold.png',
    'assets/icon/hud_hp.png',
    'assets/icon/hud_kill.png',
    'assets/icon/hud_pause.png',
    'assets/icon/hud_shield.png',
    'assets/icon/hud_switch.png',
    'assets/icon/i_alloy.jpg',
    'assets/icon/i_chip.jpg',
    'assets/icon/i_chip_elec.jpg',
    'assets/icon/i_diamond.jpg',
    'assets/icon/i_frag.jpg',
    'assets/icon/i_gold.jpg',
    'assets/icon/i_gunfrag.jpg',
    'assets/icon/i_medkit.jpg',
    'assets/icon/i_metal.jpg',
    'assets/icon/i_potion.jpg',
    'assets/icon/i_powder.jpg',
    'assets/icon/i_rare.jpg',
    'assets/icon/i_shield.jpg',
    'assets/icon/i_stamina.jpg',
    'assets/icon/ic_back.png',
    'assets/icon/ic_timer.png',
    'assets/icon/logo_boom.jpg',
    'assets/icon/m_jq.jpg',
    'assets/icon/m_jz.jpg',
    'assets/icon/m_sd.jpg',
    'assets/icon/m_sj.jpg',
    'assets/icon/nav_act.png',
    'assets/icon/nav_ashop.png',
    'assets/icon/nav_bag.png',
    'assets/icon/nav_base.png',
    'assets/icon/nav_chip.png',
    'assets/icon/nav_codex.png',
    'assets/icon/nav_core.png',
    'assets/icon/nav_endless.png',
    'assets/icon/nav_exped.png',
    'assets/icon/nav_friends.png',
    'assets/icon/nav_gem.png',
    'assets/icon/nav_go.png',
    'assets/icon/nav_gun.png',
    'assets/icon/nav_legion.png',
    'assets/icon/nav_mail.png',
    'assets/icon/nav_notice.png',
    'assets/icon/nav_rank.png',
    'assets/icon/nav_realm.png',
    'assets/icon/nav_season.png',
    'assets/icon/realm_lq.png',
    'assets/icon/realm_zj.png',
    'assets/icon/realm_jd.png',
    'assets/icon/realm_yy.png',
    'assets/icon/realm_hs.png',
    'assets/icon/nav_role.png',
    'assets/icon/nav_set.png',
    'assets/icon/nav_shop.png',
    'assets/icon/nav_talent.png',
    'assets/icon/nav_task.png',
    'assets/icon/nav_tavern.png',
    'assets/icon/s_baoji.jpg',
    'assets/icon/s_baozha.jpg',
    'assets/icon/s_chuantou.jpg',
    'assets/icon/s_shanghai.jpg',
    'assets/icon/s_xixue.jpg',
    'assets/icon/sh01_gift.jpg',
    'assets/icon/sh02_diamond.jpg',
    'assets/icon/sh05_mcard.jpg',
    'assets/icon/sh06_pass.jpg',
    'assets/icon/sh07_passpro.jpg',
    'assets/icon/sk_bingbao.jpg',
    'assets/icon/sk_diancichuan.jpg',
    'assets/icon/sk_fenliezidan.jpg',
    'assets/icon/sk_ganbingdan.jpg',
    'assets/icon/sk_gaonengshexian.jpg',
    'assets/icon/sk_hongzhaji.jpg',
    'assets/icon/sk_lianfa.jpg',
    'assets/icon/sk_ranyoudan.jpg',
    'assets/icon/sk_wenyadan.jpg',
    'assets/icon/sk_wurenji.jpg',
    'assets/icon/sk_xuanfengjianong.jpg',
    'assets/icon/sk_zhidaojiguang.jpg',
    'assets/icon/sk_zhuangjiache.jpg',
    'assets/icon/star.jpg',
    'assets/icon/t_dc.jpg',
    'assets/icon/t_hb.jpg',
    'assets/icon/t_hy.jpg',
    'assets/icon/t_jj.jpg',
    'assets/icon/talent_t_armor.jpg',
    'assets/icon/talent_t_atk.jpg',
    'assets/icon/talent_t_crit.jpg',
    'assets/icon/talent_t_gold.jpg',
    'assets/icon/talent_t_hp.jpg',
    'assets/icon/talent_t_ls.jpg',
    'assets/icon/talent_t_revive.jpg',
    'assets/icon/talent_t_xp.jpg',
    'assets/icon/w_gatling.jpg',
    'assets/icon/w_grenade.jpg',
    'assets/icon/w_handgrenade.jpg',
    'assets/icon/w_mine.jpg',
    'assets/icon/w_molotov.jpg',
    'assets/icon/w_rifle.jpg',
    'assets/icon/w_shotgun.jpg',
    'assets/icon/w_smg.jpg',
    'assets/icon/w_sniper.jpg',
    'assets/icon/w_taser.jpg',
    'assets/icon/z_du.jpg',
    'assets/icon/z_dun.jpg',
    'assets/icon/z_feixing.jpg',
    'assets/icon/z_fenlie.jpg',
    'assets/icon/z_jinying.jpg',
    'assets/icon/z_jipao.jpg',
    'assets/icon/z_putong.jpg',
    # V1.1.0 冲刺2：第 11-15 章新僵尸
    'assets/icon/z_baojun.jpg', 'assets/icon/z_shenghua.jpg', 'assets/icon/z_jixie.jpg',
    'assets/icon/z_tuye.jpg',
    'assets/icon/z_xiaozombie.jpg',
    'assets/icon/z_zhadan.jpg',
    'assets/icon/z_zhongjia.jpg',
    'assets/icon/z_zibao.jpg',
    # Q版小图标（佣兵/技能）
    'assets/chibi/s05.png',
    'assets/chibi/s06.png',
    'assets/chibi/s07.png',
    'assets/chibi/s08.png',
    'assets/chibi/s09.png',
    'assets/chibi/s10.png',
    'assets/chibi/w07.png',
    'assets/chibi/w08.png',
    'assets/chibi/w09.png',
    'assets/chibi/w10.png',
    'assets/chibi/w11.png',
    'assets/chibi/w12.png',
    'assets/chibi/w13.png',
    'assets/chibi/w14.png',
    # 角色立绘其余图（BOSS、主角、僵尸立绘）
    'assets/char/boss_baoshi.jpg',
    'assets/char/boss_chaoxue.jpg',
    'assets/char/boss_juxing.jpg',
    'assets/char/boss_kaiken.jpg',
    'assets/char/boss_mama.jpg',
    'assets/char/boss_shenyuan.jpg',
    'assets/char/boss_shiwang.jpg',
    # V1.1.0 冲刺2：第 11-15 章新 BOSS
    'assets/char/boss_gangtie.jpg', 'assets/char/boss_muhe.jpg',
    'assets/char/boss_xiudao.jpg',
    'assets/char/hero_f.jpg',
    'assets/char/hero_m.jpg',
    'assets/char/z_cap.jpg',
    'assets/char/z_pilot.jpg',
    'assets/char/z_suit.jpg',
    # 皮肤图
    'assets/skin/sk_armor.jpg',
    'assets/skin/sk_c01a.jpg',
    'assets/skin/sk_c01b.jpg',
    'assets/skin/sk_c02a.jpg',
    'assets/skin/sk_c02b.jpg',
    'assets/skin/sk_c03a.jpg',
    'assets/skin/sk_c03b.jpg',
    'assets/skin/sk_c04a.jpg',
    'assets/skin/sk_c04b.jpg',
    'assets/skin/sk_chem.jpg',
    'assets/skin/sk_desert.jpg',
    # 版本排期（V1.2.3）：后台维护后下发到云端，玩家端「设置→前瞻」直接读取。
    # 与美术资源同理 —— 不登记就永远「本地有、线上无」，玩家看到的仍是内置排期。
    'data/zb/roadmap.json',
    'tools/pxcheck.cjs',
    'tools/pxledger.json',

]


def blobsha(b):
    # git blob sha = sha1("blob <len>\0" + content)，分隔符是 \0 不是空格
    return hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()


def api(m, p, b=None):
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request('https://api.github.com/repos/%s/%s' % (REPO, p),
                               data=d, headers=H, method=m)
    try:
        return json.load(urllib.request.urlopen(r, timeout=120))
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {'_err': 'HTTP%s' % e.code}
    except Exception as e:
        return {'_err': str(e)[:100]}


def online_meta(path):
    c = api('GET', 'contents/%s?ref=main' % path)
    if not isinstance(c, dict) or '_err' in c or 'sha' not in c:
        return None
    return c


def check():
    bad = []
    for f in FILES:
        fp = os.path.join(ROOT, 'zombie', f)
        if not os.path.exists(fp):
            print('%-26s 本地缺失(跳过)' % f)
            continue
        local = open(fp, 'rb').read()
        c = online_meta(f)
        if c is None:
            print('%-26s %8dB  线上读取失败' % (f, len(local)))
            bad.append(f)
            continue
        ok = c.get('sha') == blobsha(local)
        if not ok:
            bad.append(f)
        print('%-26s %8dB  %s' % (f, len(local),
              '一致' if ok else '★不一致 线上%dB' % c.get('size', 0)))
    print('\n核对 %d 个，不一致 %d' % (len(FILES), len(bad)))
    return bad


def syntax_gate(bad):
    """上传前语法闸门。

    事故背景：曾把一个带语法错误的 js/config.js 直接传上生产
    （第 1384 行 id 少了右引号，整份配置无法解析 → 全站白屏级故障），
    而上传流程当时没有任何拦截。这里强制先做语法体检，
    任一 js 文件解析失败即中止上传 —— 坏代码绝不允许进生产。
    """
    import subprocess
    js = [f for f in bad if f.endswith('.js')]
    if not js:
        return True
    broken = []
    for f in js:
        fp = os.path.join(ROOT, 'zombie', f)
        if not os.path.exists(fp):
            continue
        r = subprocess.run(['node', '--check', fp], capture_output=True)
        if r.returncode != 0:
            broken.append(f)
            print('  语法错误 %s :: %s' % (f, r.stderr.decode('utf-8', 'ignore').strip().splitlines()[-1][:90]))
    if broken:
        print('\n[中止] 语法闸门未通过，禁止上传：%s' % broken)
        return False
    print('语法闸门通过（%d 个 js）' % len(js))
    return True


def push(msg):
    bad = check()
    if not bad:
        print('\n全部一致，无需上传')
        return
    if not syntax_gate(bad):
        return
    print('\n开始上传 %d 个文件...' % len(bad))
    fail = []
    for f in bad:
        fp = os.path.join(ROOT, 'zombie', f)
        data = open(fp, 'rb').read()
        cur = online_meta(f)
        body = {'message': msg, 'content': base64.b64encode(data).decode(), 'branch': 'main'}
        if cur:
            body['sha'] = cur['sha']
        res = api('PUT', 'contents/' + f, body)
        if 'commit' not in res:
            print('%-26s 上传失败 %s' % (f, str(res.get('message', res))[:90]))
            fail.append(f)
            continue
        # 复核
        chk = online_meta(f)
        ok = chk and chk.get('sha') == blobsha(data)
        print('%-26s %8dB  上传OK  复核%s' % (f, len(data), '一致' if ok else '★不符'))
        if not ok:
            fail.append(f)
    print('\n上传完成：成功 %d，失败 %d' % (len(bad) - len(fail), len(fail)))
    if fail:
        print('失败文件:', fail)
    # 发布后强制全量复核（维护轮2）
    # 事故背景：V1.2.1 报告「上传成功并复核一致」，实际 js/engine.js 线上缺代码。
    # 逐个复核只覆盖本次 bad 列表，清单外/复核误差完全无法发现。
    # 这里强制再跑一次全量一致性闸门，任一不一致即醒目报警。
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'zombie', 'tools', 'synccheck.py')],
                       capture_output=True)
    out = r.stdout.decode('utf-8', 'ignore')
    tail = '\n'.join(out.strip().splitlines()[-6:])
    print('\n[发布后全量复核] %s' % tail)
    if r.returncode != 0:
        print('\n!!!!!! 警告：线上与本地仍不一致，本次发布不完整 !!!!!!')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    msg = ' '.join(sys.argv[2:]) or '界面与逻辑修复'
    if cmd == 'check':
        check()
    elif cmd == 'push':
        push(msg)
    else:
        print(__doc__)
