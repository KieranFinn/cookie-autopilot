/* ============================================================
 * Cookie AutoPilot v5.6.0 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * 购买规则：
 *   strict（默认）—— 只买全体候选中修正 pp 最低项，买不起就等；
 *   fast —— 修正 pp ≤ 全体均值且买得起就连环买（v4.9.6 快道）。
 *   切换：点击屏幕右上角浮动按钮，或控制台 CookieAutoPilot.setMode('strict'|'fast')
 * v5.6.0：命运之手预测扩展为「下两发」（种子序列偏移 +1 复刻，保留 combo 规划空间）；
 *          命运面板新增刷序列按钮——用最廉价法术（动态选 getSpellCost 最低者，通常
 *          是 Conjure Baked Goods）推进 spellsCastTotal，可单刷或自动刷到下两发内出现
 *          高价值结果（CF/Frenzy/建筑特赐/饼干风暴/血怒）为止，魔力不足自动等回蓝；
 *          顺带修复 Game.shimmerTypes 未初始化时预测面板空白的隐患
 * v5.5.0：新增花园自动育种（运行时暴力探测游戏原生 M.getMuts 动态发现配方，
 *          爬山法搜索「空格变异概率总和最大」的留空布局，全自动集齐 34 种图鉴；
 *          meddleweed 杂草/brownMold·crumbspore 孢子特例处理，育种期自动换木屑土）；
 *          刷金模式启动前先进入 Elder Pledge 长者誓约（临时安抚，非 Covenant 的 -5%），
 *          杜绝刷出红饼干，到期自动续誓约；
 *          修复建筑特赐 buff 检测（buff.name 实为 High-five/Congregation 等随机名，
 *          改用 buff.type.name==='building buff' 识别，刷金出建筑 buff 现在会正常停止）
 * v5.4.0：新增「刷金饼干」独立模式（龙之宝珠+飞龙在天循环卖建筑召唤金饼干，
 *          出正向增益即换回 Radiant Appetite+牛奶之息并结束；期间暂停主自动化、
 *          保留大饼干连点）
 * v5.3.0：新增「命运之手预测」面板——用与游戏 castSpell 完全相同的种子随机序列
 *          （Math.seedrandom(Game.seed + '/' + spellsCastTotal)），提前算出下一次
 *          Force the Hand of Fate 的成功/失败与具体效果
 * v5.2.0：修复 Game.buffs 是对象不是数组——CpS 明细漏算全部 Buff（10% 偏差根源）、
 *          连招检测此前从未生效，现已一并修复
 * v5.1.9：集成 CpS 增益明细面板（逐项复现 CalculateGains + 残差对账行，总账恒等于游戏值）；
 *          嬤虫逻辑重写：删除全部旧虫代码，仅满员时捏爆最后一只（非闪光）
 * v5.1.8：新增总开关按钮（一键暂停/恢复全部自动化），为连招开发模块预留互斥入口
 * v5.1.7：集成连招辅助（buff 检测 + Godzamok 一键卖建筑 + 连招统计）
 * v5.1.6：修复 CollectWrinklers() 误杀所有虫 + 季节升级全部黑名单 + 虫槽位越界修复
 * v5.1.5：buyTimes 环形缓冲区、Fortune 单双引号兼容、scanAll 缓存、
 *          Notify 异常防护、变量名去重
 * v5.1.4：修复 Fortune 检测（查两个 ticker + class="fortune"）、增加红饼干（wrath）自动点击
 * v5.1.3：增加幸运签（Fortune cookie）自动点击
 * v5.1.2：修复 PlaySound 恢复、升级 pp 实时修正、OnAscend 显式判断、
 *          开关型升级进黑名单、变量名冲突、bootTimer 清理
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 配置区 ----------
  var CFG = {
    clickIntervalMs: 4,       // 大饼干点击间隔（毫秒），浏览器最小钳制约 4ms
    tickMs: 100,              // 主循环固定节拍
    mode: 'strict',           // 'strict' = 严格全局最优；'fast' = pp 均值快道
    maxBuysPerTick: 200       // fast 模式单拍连环购买上限（strict 模式忽略）
  };

  // 永远不自动购买的升级（会改变黄金饼干机制、开关型、纯亏、季节相关）
  var BLACKLIST = [
    'Elder covenant',           // 永久安抚阿嬷，-5% 产量，血亏
    'Elder Pledge',             // 暂时安抚阿嬷（想手动用时自己买）
    'One mind',                 // 是否开启阿嬷浩劫由你决定
    'Communal brainsweep',
    'Elder pact',
    'Sacrificial rolling pins', // 降低嬤虫收益的开关型
    'Shimmering veil [off]',    // 开关型：关闭闪光面纱保护
    'Golden switch [off]',      // 开关型：恢复黄金饼干（策略性）
    'Golden switch [on]',       // 开关型：关闭黄金饼干换 +50% CpS（策略性）
    'Sugar frenzy',             // 糖狂潮（一次性爆发，不宜自动）
    // --- 季节切换开关（全部拦截）---
    'Season switcher',          // 天堂升级：解锁季节切换能力
    'Festive biscuit',          // 触发 Christmas 季节
    'Ghostly biscuit',          // 触发 Halloween 季节
    'Lovesick biscuit',         // 触发 Valentine 季节
    "Fool's biscuit",           // 触发 Business Day 季节
    'Bunny biscuit'             // 触发 Easter 季节
  ];

  // ---------- 启动检查 ----------
  var bootTries = 0;
  var bootTimer = setInterval(function () {
    if (typeof Game !== 'undefined' && Game.ready) {
      clearInterval(bootTimer);
      // Cookie Monster 不在就自动加载（pp 数据的来源）
      if (!window.CookieMonsterData && !window.__apCMLoading) {
        window.__apCMLoading = true;
        try { Game.LoadMod('https://cookiemonsterteam.github.io/CookieMonster/dist/CookieMonster.js'); } catch (e) {}
      }
      start();
    } else if (++bootTries > 60) {
      clearInterval(bootTimer);
      console.warn('[AutoPilot] 未检测到 Cookie Clicker，请在游戏页面运行。');
    }
  }, 500);

  function start() {
    if (window.CookieAutoPilot) { window.CookieAutoPilot.stop(); }

    var stopped = false;
    var tickTimer = null;
    var modeBtn = null; // 模式切换按钮 DOM

    // ---------- 购买记录：环形缓冲区（O(1) 入队，无 splice） ----------
    var BUY_BUF_SIZE = 200;
    var buyTimes = new Array(BUY_BUF_SIZE);
    var buyIdx = 0;      // 下一个写入位置
    var buyCount = 0;    // 当前有效元素数

    function noteBuy() {
      buyTimes[buyIdx] = Date.now();
      buyIdx = (buyIdx + 1) % BUY_BUF_SIZE;
      if (buyCount < BUY_BUF_SIZE) buyCount++;
    }

    // ---------- 候选扫描缓存 ----------
    var lastScanResult = null;
    var lastScanTime = 0;
    var lastScanCookies = 0;
    var SCAN_CACHE_MS = 500; // 500ms 内 cookies 变化 <10% 则复用上次扫描

    // ---------- 0. 屏蔽大饼干点击音效（其它音效保留） ----------
    try {
      if (typeof PlaySound !== 'undefined') {
        if (!window.__origPlaySound) window.__origPlaySound = PlaySound;
        window.PlaySound = function (url) {
          if (/clickb?\d*\.mp3/i.test(String(url))) return;
          return window.__origPlaySound.apply(this, arguments);
        };
      }
    } catch (e) {}

    // ---------- 1. 自动点击大饼干 ----------
    var clickTimer = null;
    function startClicker() {
      if (clickTimer) clearInterval(clickTimer);
      clickTimer = setInterval(function () {
        try {
          var el = document.getElementById('bigCookie');
          if (el) { Game.lastClick -= 1000; el.click(); }
        } catch (e) {}
      }, CFG.clickIntervalMs);
    }
    function stopClicker() {
      if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
    }
    startClicker();

    // ---------- 2. 候选扫描：全体候选，按修正 pp 升序 + 全体均值 ----------
    function scanAll() {
      var now = Date.now();
      var cookiesNow = Game.cookies;
      // 缓存命中：时间短 + cookies 变化小
      if (lastScanResult && now - lastScanTime < SCAN_CACHE_MS) {
        var cookieDelta = lastScanCookies > 0 ? Math.abs(cookiesNow - lastScanCookies) / lastScanCookies : 1;
        if (cookieDelta < 0.1) return lastScanResult;
      }

      var CMd = window.CookieMonsterData;
      if (!CMd || !CMd.Objects1) return null;

      var list = [];

      // 建筑 ×1
      Object.keys(CMd.Objects1).forEach(function (name) {
        try {
          var info = CMd.Objects1[name];
          var b = Game.Objects[name];
          if (!info || !b || b.locked) return;
          if (info.colour === 'Gray') return;
          var liveP = b.getPrice();
          var adj = info.pp;
          if (info.price > 0 && liveP > 0) adj = info.pp * liveP / info.price;
          if (adj > 0 && isFinite(adj)) {
            list.push({ target: { kind: 'building', obj: b, amount: 1 }, price: liveP, adj: adj });
          }
        } catch (e) {}
      });

      // 批量购买（×10 / ×100）
      [10, 100].forEach(function (qty) {
        var map = qty === 10 ? CMd.Objects10 : CMd.Objects100;
        if (!map) return;
        Object.keys(map).forEach(function (name) {
          try {
            var info = map[name];
            var b = Game.Objects[name];
            if (!info || !b || b.locked) return;
            if (info.colour === 'Gray') return;
            var liveP = b.getSumPrice ? b.getSumPrice(qty) : info.price;
            var adj = info.pp;
            if (info.price > 0 && liveP > 0) adj = info.pp * liveP / info.price;
            if (adj > 0 && isFinite(adj)) {
              list.push({ target: { kind: 'building', obj: b, amount: qty }, price: liveP, adj: adj });
            }
          } catch (e) {}
        });
      });

      // 升级
      if (CMd.Upgrades) {
        Object.keys(CMd.Upgrades).forEach(function (name) {
          try {
            var info = CMd.Upgrades[name];
            var u = Game.Upgrades[name];
            if (!info || !u || u.bought || !u.unlocked) return;
            if (u.season) return;           // 拦截所有季节相关升级（含节日饼干）
            if (info.colour === 'Gray') return;
            if (BLACKLIST.indexOf(name) !== -1) return;
            var price = u.getPrice ? u.getPrice() : u.basePrice;
            var adj = info.pp;
            if (info.price > 0 && price > 0) adj = info.pp * price / info.price;
            if (adj > 0 && isFinite(adj)) {
              list.push({ target: { kind: 'upgrade', obj: u }, price: price, adj: adj });
            }
          } catch (e) {}
        });
      }

      if (!list.length) return null;
      var sum = 0;
      for (var k = 0; k < list.length; k++) sum += list[k].adj;
      list.sort(function (a, b) { return a.adj - b.adj; });
      var result = { list: list, mean: sum / list.length };

      lastScanResult = result;
      lastScanTime = now;
      lastScanCookies = cookiesNow;
      return result;
    }

    function doBuy(c) {
      if (c.target.kind === 'building') c.target.obj.buy(c.target.amount || 1);
      else c.target.obj.buy(true);
      noteBuy();
    }

    // ---------- 3. 购买执行（按模式分支） ----------
    function buyStrict(s) {
      if (!s || !s.list.length) return;
      var best = s.list[0];
      if (best.price <= Game.cookies) doBuy(best);
    }

    function buyFast(s) {
      if (!s || !s.list.length) return;
      for (var n = 0; n < CFG.maxBuysPerTick; n++) {
        var pick = null;
        for (var m = 0; m < s.list.length; m++) {
          var item = s.list[m];
          if (item.adj > s.mean) break;
          if (item.price <= Game.cookies) { pick = item; break; }
        }
        if (!pick) break;
        doBuy(pick);
        s = scanAll();
        if (!s) break;
      }
    }

    // ---------- 4. 模式切换按钮 ----------
    function createModeBtn() {
      modeBtn = document.createElement('div');
      modeBtn.id = 'cookie-autopilot-mode-btn';
      modeBtn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      updateModeBtn();
      modeBtn.onclick = function () {
        window.CookieAutoPilot.setMode(CFG.mode === 'strict' ? 'fast' : 'strict');
      };
      document.body.appendChild(modeBtn);
    }
    function updateModeBtn() {
      if (!modeBtn) return;
      modeBtn.style.opacity = enabled ? '1' : '0.45'; // 总开关关闭时置灰
      if (CFG.mode === 'strict') {
        modeBtn.textContent = '攒钱';
        modeBtn.style.background = '#2d8a3e';
      } else {
        modeBtn.textContent = '快道';
        modeBtn.style.background = '#2563b9';
      }
    }
    function removeModeBtn() {
      if (modeBtn && modeBtn.parentNode) {
        modeBtn.parentNode.removeChild(modeBtn);
        modeBtn = null;
      }
    }

    // ---------- 4b. 总开关（控制全部自动化功能；后续连招开发模块在其关闭时运行） ----------
    var enabled = true;
    var masterBtn = null;

    function setEnabled(on) {
      on = !!on;
      if (on === enabled) return;
      enabled = on;
      if (enabled) {
        startClicker();
        schedule();
      } else {
        if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
        stopClicker();
      }
      updateMasterBtn();
      updateModeBtn();
      console.log('[AutoPilot] 总开关：' + (enabled ? '开启（全部功能运行）' : '关闭（连点/金饼干/购买/嬤虫/连招检测全部暂停）'));
      try {
        if (Game.Notify) Game.Notify('AutoPilot 总开关', enabled ? '全部功能已开启' : '全部自动化已暂停');
      } catch (e) {}
    }

    function createMasterBtn() {
      masterBtn = document.createElement('div');
      masterBtn.id = 'cookie-autopilot-master-btn';
      masterBtn.style.cssText = 'position:fixed;top:10px;right:82px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      updateMasterBtn();
      masterBtn.onclick = function () {
        setEnabled(!enabled);
      };
      document.body.appendChild(masterBtn);
    }
    function updateMasterBtn() {
      if (!masterBtn) return;
      if (enabled) {
        masterBtn.textContent = '运行中';
        masterBtn.style.background = '#7c3aed';
      } else {
        masterBtn.textContent = '已关闭';
        masterBtn.style.background = '#6b7280';
      }
    }
    function removeMasterBtn() {
      if (masterBtn && masterBtn.parentNode) {
        masterBtn.parentNode.removeChild(masterBtn);
        masterBtn = null;
      }
    }

    // ---------- 5. 主循环（固定节拍） ----------
    function tick() {
      if (stopped || !enabled || farmActive) return;
      try {
        // --- 黄金饼干 / 红饼干 / 驯鹿：出现即点 ---
        var shimmers = Game.shimmers;
        for (var idx = 0; idx < shimmers.length; idx++) {
          var sh = shimmers[idx];
          if (sh && (sh.type === 'golden' || sh.type === 'wrath' || sh.type === 'reindeer') && sh.pop) sh.pop();
        }

        // --- 幸运签（Fortune cookie）：检测 class="fortune" 或 class='fortune' 即点 ---
        try {
          var tickerIds = ['commentsText1', 'commentsText2'];
          for (var t = 0; t < tickerIds.length; t++) {
            var tel = document.getElementById(tickerIds[t]);
            if (tel) {
              var html = tel.innerHTML;
              if (html.indexOf('class="fortune"') !== -1 || html.indexOf("class='fortune'") !== -1) tel.click();
            }
          }
        } catch (e) {}

        // --- 购买：按模式切换 ---
        var scan = scanAll();
        if (CFG.mode === 'strict') buyStrict(scan);
        else buyFast(scan);

        // --- 嬤虫：仅在满员时捏爆"最后一只"（槽位最高、最新附着的非闪光虫），腾出槽位养新虫 ---
        // --- 其余虫全部保留（含飞升时），由你手动处理 ---
        if (Game.wrinklers) {
          var wmax = Game.getWrinklersMax ? Game.getWrinklersMax() : 10;
          var wAlive = 0;
          var lastW = null;
          for (var wi = 0; wi < Game.wrinklers.length && wi < wmax; wi++) {
            var w = Game.wrinklers[wi];
            if (w.phase > 0 && w.hp > 0) {
              wAlive++;
              if (!w.type) lastW = w; // 闪光虫豁免，留到飞升
            }
          }
          if (wAlive >= wmax && lastW && lastW.sucked > 0) {
            lastW.hp = 0;
            // 单只虫 hp=0 后游戏自动爆裂返还饼干，不需要调用 CollectWrinklers()（那会团灭全虫）
          }
        }

        // --- 连招辅助：检测 buff 叠加 ---
        try { checkCombo(); } catch (e) {}
      } catch (e) {}
      schedule();
    }

    function schedule() {
      if (stopped || !enabled) return;
      tickTimer = setTimeout(tick, CFG.tickMs);
    }

    // ---------- 连招辅助 ----------
    var comboAlerted = false;
    var comboHistory = [];

    function checkCombo() {
      if (!Game.buffs) return;
      var hasF = false, hasBS = false, hasCF = false, hasDF = false, hasEF = false;
      var parts = [];

      // 注意：Game.buffs 是按名字索引的对象，不是数组
      for (var bn in Game.buffs) {
        var b = Game.buffs[bn];
        if (!b) continue;
        if (b.name === 'Frenzy') { hasF = true; }
        else if (b.name === 'Click frenzy') { hasCF = true; }
        else if (b.name === 'Dragonflight') { hasDF = true; }
        else if (b.name === 'Elder frenzy') { hasEF = true; }
        else if ((b.type && b.type.name === 'building buff') || (b.name && b.name.indexOf('Building special') !== -1)) { hasBS = true; } // buff.name 实为 High-five 等随机名，须靠 buffType 识别
      }

      if (hasF) parts.push('F');
      if (hasBS) parts.push('BS');
      if (hasCF) parts.push('CF');
      if (hasDF) parts.push('DF');
      if (hasEF) parts.push('EF');

      var level = (hasF ? 1 : 0) + (hasBS ? 2 : 0) + (hasCF || hasDF ? 3 : 0) + (hasEF ? 4 : 0);

      // 高价值连招提醒（F+CF 或更高）
      if (level >= 4 && !comboAlerted) {
        comboAlerted = true;
        var msg = parts.join('+') + ' 连招触发！';
        console.log('[AutoPilot Combo] 🚨 ' + msg);
        try {
          if (Game.Notify) Game.Notify('连招辅助 🚨', msg + ' 输入 CookieAutoPilot.combo.sellForGodzamok() 卖建筑触发 Godzamok');
        } catch (e) {}
      }

      // 所有 buff 消失后重置提醒状态
      if (level === 0) comboAlerted = false;
    }

    function sellForGodzamok() {
      if (!Game.ObjectsById) return [];
      var totalCps = Game.cookiesPs;
      if (totalCps <= 0) return [];
      var sold = [];
      Game.ObjectsById.forEach(function (b) {
        if (b.name === 'Wizard tower') return; // 保护魔法塔
        var bCps = b.storedTotalCps || 0;
        // 只卖产生 <2% CpS 且数量 >0 的建筑
        if (bCps < totalCps * 0.02 && b.amount > 0) {
          var before = b.amount;
          b.sell(b.amount);
          sold.push(b.name + ' x' + before);
        }
      });
      var msg = sold.length > 0 ? '已卖: ' + sold.join(', ') : '没有符合 <2% CpS 条件的建筑可卖';
      console.log('[AutoPilot Combo] ' + msg);
      comboHistory.push({ time: Date.now(), action: 'sellForGodzamok', sold: sold });
      return sold;
    }

    function getComboStatus() {
      if (!Game.buffs) return [];
      var out = [];
      for (var bn in Game.buffs) {
        var b = Game.buffs[bn];
        if (!b) continue;
        out.push({ name: b.name, timeLeft: Math.ceil(b.time / Game.fps) + 's', multCpS: b.multCpS || '-', multClick: b.multClick || '-' });
      }
      return out;
    }

    function getComboHistory() {
      return comboHistory.slice(-20); // 最近 20 条
    }

    // ---------- CpS 增益明细面板（只读显示，不受总开关控制） ----------
    var cpsPanel = null, cpsBtn = null, cpsTimer = null, cpsVisible = false;

    // 逐项复现 Game.CalculateGains() 的乘数链
    function cpsCollect() {
      var rows = [];   // {cat, name, mult, cum, note}
      var cum = 1;
      function add(cat, name, m, note) {
        if (m === 1) return;
        rows.push({ cat: cat, name: name, mult: m, cum: cum * m, note: note || '' });
        cum *= m;
      }

      // 1. 天堂碎片（prestige）
      if (Game.ascensionMode != 1 && Game.prestige > 0) {
        var pm = 1 + parseFloat(Game.prestige) * 0.01 * Game.heavenlyPower * Game.GetHeavenlyMultiplier();
        add('天堂', '天堂碎片（prestige）', pm, Beautify(Math.floor(Game.prestige)) + ' 级');
      }

      // 2. 建筑小游戏效果（花园/万神殿等 eff('cps')）
      var effCps = Game.eff ? Game.eff('cps') : 1;
      if (effCps !== 1) add('小游戏', '建筑小游戏效果 eff(cps)', effCps, '花园/万神殿等');

      // 3. Heralds
      if (Game.Has('Heralds') && Game.ascensionMode != 1 && Game.heralds > 0) {
        add('天堂', 'Heralds', 1 + 0.01 * Game.heralds, Game.heralds + ' 位');
      }

      // 4. 饼干类升级（含季节饼干）
      if (Game.cookieUpgrades) {
        for (var i = 0; i < Game.cookieUpgrades.length; i++) {
          var cu = Game.cookieUpgrades[i];
          if (Game.Has(cu.name)) {
            var p = (typeof cu.power === 'function') ? cu.power(cu) : cu.power;
            if (p) add('饼干升级', cu.name, 1 + p * 0.01);
          }
        }
      }

      // 5. 科技线 / 圣诞老人 / Fortune / 龙鳞等固定项
      var FIXED = [
        ['Specialized chocolate chips', 1.01, '科技线'],
        ['Designer cocoa beans', 1.02, '科技线'],
        ['Underworld ovens', 1.03, '科技线'],
        ['Exotic nuts', 1.04, '科技线'],
        ['Arcane sugar', 1.05, '科技线'],
        ['Increased merriness', 1.15, '圣诞老人'],
        ['Improved jolliness', 1.15, '圣诞老人'],
        ['A lump of coal', 1.01, '圣诞老人'],
        ['An itchy sweater', 1.01, '圣诞老人'],
        ["Santa's dominion", 1.2, '圣诞老人'],
        ['Fortune #100', 1.01, '幸运签'],
        ['Fortune #101', 1.07, '幸运签'],
        ['Dragon scale', 1.03, '龙'],
        ['Wrinkler ambergris', 1.06, '嬤虫掉落']
      ];
      for (var f = 0; f < FIXED.length; f++) {
        if (Game.Has(FIXED[f][0])) add(FIXED[f][2], FIXED[f][0], FIXED[f][1]);
      }

      // 6. 万神殿神位（直接乘全局的）
      if (Game.hasGod) {
        var g = Game.hasGod('asceticism');
        if (g) add('万神殿', 'Asceticism ' + ['', '钻石', '红宝石', '翡翠'][g] + '位', g === 1 ? 1.15 : g === 2 ? 1.1 : 1.05);
        g = Game.hasGod('ages');
        if (g) {
          var period = g === 1 ? 3 : g === 2 ? 12 : 24;
          var agesMult = 1 + 0.15 * Math.sin((Date.now() / 1000 / (60 * 60 * period)) * Math.PI * 2);
          add('万神殿', 'Ages（' + period + 'h 周期 ±15%）', agesMult, '当前相位');
        }
      }

      // 7. Santa's legacy
      if (Game.Has("Santa's legacy")) add('圣诞老人', "Santa's legacy", 1 + (Game.santaLevel + 1) * 0.03, 'Lv.' + Game.santaLevel);

      // 8. 牛奶增效 + 猫咪
      var milkProgress = Game.AchievementsOwned / 25;
      var milkMult = 1;
      if (Game.Has("Santa's milk and cookies")) milkMult *= 1.05;
      milkMult *= 1 + Game.auraMult('Breath of Milk') * 0.05;
      if (Game.hasGod) {
        var mg = Game.hasGod('mother');
        if (mg) milkMult *= mg === 1 ? 1.1 : mg === 2 ? 1.05 : 1.03;
      }
      if (Game.eff) milkMult *= Game.eff('milk');
      add('牛奶', 'milkMult（成就 ' + Game.AchievementsOwned + ' → 奶量 ' + (milkProgress * 100).toFixed(1) + '%）', milkMult);

      var KITTENS = [
        ['Kitten helpers', 0.1], ['Kitten workers', 0.125], ['Kitten engineers', 0.15],
        ['Kitten overseers', 0.175], ['Kitten managers', 0.2], ['Kitten accountants', 0.2],
        ['Kitten specialists', 0.2], ['Kitten experts', 0.2], ['Kitten consultants', 0.2],
        ['Kitten assistants to the regional manager', 0.175], ['Kitten marketeers', 0.15],
        ['Kitten analysts', 0.125], ['Kitten executives', 0.115], ['Kitten admins', 0.11],
        ['Kitten strategists', 0.105], ['Kitten angels', 0.1], ['Fortune #103', 0.05]
      ];
      for (var k = 0; k < KITTENS.length; k++) {
        if (Game.Has(KITTENS[k][0])) {
          add('猫咪', KITTENS[k][0], 1 + milkProgress * KITTENS[k][1] * milkMult, '奶量×' + KITTENS[k][1]);
        }
      }

      // 9. 复活节蛋
      var EGGS = ['Chicken egg', 'Duck egg', 'Turkey egg', 'Quail egg', 'Robin egg', 'Ostrich egg',
        'Cassowary egg', 'Salmon roe', 'Frogspawn', 'Shark egg', 'Turtle egg', 'Ant larva'];
      for (var e = 0; e < EGGS.length; e++) {
        if (Game.Has(EGGS[e])) add('复活节', EGGS[e], 1.01);
      }
      if (Game.Has('Century egg')) {
        var day = Math.floor((Date.now() - Game.startDate) / 1000 / 10) * 10 / 60 / 60 / 24;
        day = Math.max(0, Math.min(day, 100));
        add('复活节', 'Century egg', 1 + (1 - Math.pow(1 - day / 100, 3)) * 0.1, '第 ' + Math.floor(day) + ' 天');
      }

      // 10. 糖块
      if (Game.Has('Sugar baking') && Game.lumps > 0) {
        add('糖块', 'Sugar baking', 1 + Math.min(100, Game.lumps) * 0.01, Game.lumps + ' 块（上限 100）');
      }

      // 11. 龙息光环
      var ra = Game.auraMult('Radiant Appetite');
      if (ra) add('龙息光环', 'Radiant Appetite', 1 + ra);
      var df = Game.auraMult('Dragon\'s Fortune');
      var gn = Game.shimmerTypes && Game.shimmerTypes['golden'] ? Game.shimmerTypes['golden'].n : 0;
      if (df && gn > 0) add('龙息光环', "Dragon's Fortune ×" + gn + ' 金饼干在场', Math.pow(1 + df * 1.23, gn));

      // 12. 面包房名字彩蛋
      var bname = (Game.bakeryName || '').toLowerCase();
      if (bname === 'orteil') add('彩蛋', '面包房名叫 Orteil', 0.99);
      else if (bname === 'ortiel') add('彩蛋', '面包房名叫 Ortiel', 0.98);

      // 13. 开关型与特殊
      if (Game.Has('Elder Covenant')) add('阿嬷', 'Elder Covenant（永久安抚）', 0.95);
      if (Game.Has('Golden switch [off]')) {
        var gsw = 1.5;
        if (Game.Has('Residual luck') && Game.goldenCookieUpgrades) {
          var gc = 0;
          for (var gi = 0; gi < Game.goldenCookieUpgrades.length; gi++) {
            if (Game.Has(Game.goldenCookieUpgrades[gi])) gc++;
          }
          gsw += 0.1 * gc;
        }
        add('开关', 'Golden switch（关金饼干换 CpS）', gsw);
      }
      if (Game.Has('Shimmering veil [off]')) add('开关', 'Shimmering veil（关面纱）', 1 + Game.getVeilBoost());
      if (Game.Has('Magic shenanigans')) add('作弊', 'Magic shenanigans', 1000);
      if (Game.Has('Occult obstruction')) add('作弊', 'Occult obstruction', 0);

      // 14. Buff（Frenzy ×7 / Elder frenzy / Building special / Sugar frenzy 等）
      // 注意：Game.buffs 是按名字索引的对象而非数组，过期 buff 会被游戏 delete
      if (Game.buffs) {
        for (var bn in Game.buffs) {
          var bf = Game.buffs[bn];
          if (bf && typeof bf.multCpS !== 'undefined' && bf.multCpS !== 1) {
            add('Buff', bf.name, bf.multCpS, '剩 ' + Math.ceil(bf.time / Game.fps) + 's');
          }
        }
      }

      // 15. 对账：残差行，使总账恒等于 Game.globalCpsMult（零偏差）
      var gameMult = Game.globalCpsMult || 1;
      var residual = cum > 0 ? gameMult / cum : 1;
      if (Math.abs(residual - 1) > 1e-9) {
        rows.push({ cat: '对账', name: '⚠ 未追踪来源（mod 钩子/时序差）', mult: residual, cum: gameMult, note: '请反馈此数值' });
        cum = gameMult;
      }

      return { rows: rows, cum: cum, residual: residual, gameMult: gameMult };
    }

    function cpsBuildings() {
      var list = [];
      var total = Game.buildingCps || 0;
      for (var i in Game.Objects) {
        var me = Game.Objects[i];
        if (me.amount > 0) {
          list.push({ name: me.name, amount: me.amount, cps: me.storedTotalCps, pct: total > 0 ? me.storedTotalCps / total * 100 : 0 });
        }
      }
      list.sort(function (a, b) { return b.cps - a.cps; });
      return list;
    }

    function cpsFmt(m) {
      if (m >= 100) return '×' + Beautify(Math.round(m));
      return '×' + m.toFixed(m < 1.1 ? 4 : 3);
    }

    function cpsRender() {
      if (!cpsPanel || !cpsVisible) return;
      var data = cpsCollect();
      var html = '';

      var raw = Game.cookiesPsRaw || 0;
      var final = Game.cookiesPs || 0;
      var sucked = Game.cpsSucked || 0;

      html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.35);border-radius:4px;margin-bottom:6px;">';
      html += '建筑裸产：<b>' + Beautify(raw) + '</b>/s<br>';
      html += '全局倍率：<b>' + cpsFmt(data.gameMult) + '</b>（明细复算 ' + cpsFmt(data.cum) + '）<br>';
      html += '最终 CpS：<b style="color:#6f6;">' + Beautify(final) + '</b>/s';
      if (sucked > 0) html += '<br>嬤虫吸走：<b style="color:#f96;">-' + (sucked * 100).toFixed(1) + '%</b>（实际到手 ' + Beautify(final * (1 - sucked)) + '/s）';
      html += '<br>对账：' + (Math.abs(data.residual - 1) <= 1e-9
        ? '<b style="color:#6f6;">✓ 与游戏完全一致</b>'
        : '<b style="color:#ff6;">残差 ×' + data.residual.toFixed(6) + '</b>（已列为明细最后一行，总账已补齐）');
      html += '</div>';

      html += '<div style="margin-bottom:2px;color:#fc6;font-weight:bold;">倍率明细（' + data.rows.length + ' 项生效）</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
      html += '<tr style="color:#999;text-align:left;"><th style="padding:1px 4px;">项目</th><th style="padding:1px 4px;">倍率</th><th style="padding:1px 4px;">累计</th></tr>';
      var lastCat = '';
      for (var i = 0; i < data.rows.length; i++) {
        var r = data.rows[i];
        if (r.cat !== lastCat) {
          html += '<tr><td colspan="3" style="color:#9cf;padding:3px 4px 1px;font-weight:bold;">' + r.cat + '</td></tr>';
          lastCat = r.cat;
        }
        html += '<tr>' +
          '<td style="padding:1px 4px;">' + r.name + (r.note ? ' <span style="color:#888;">' + r.note + '</span>' : '') + '</td>' +
          '<td style="padding:1px 4px;color:' + (r.mult >= 1 ? '#6f6' : '#f66') + ';">' + cpsFmt(r.mult) + '</td>' +
          '<td style="padding:1px 4px;color:#ccc;">' + cpsFmt(r.cum) + '</td></tr>';
      }
      html += '</table>';

      var bs = cpsBuildings();
      html += '<div style="margin:6px 0 2px;color:#fc6;font-weight:bold;">建筑贡献</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
      for (var j = 0; j < bs.length; j++) {
        html += '<tr><td style="padding:1px 4px;">' + bs[j].name + ' ×' + bs[j].amount + '</td>' +
          '<td style="padding:1px 4px;color:#6f6;">' + Beautify(Math.round(bs[j].cps)) + '/s</td>' +
          '<td style="padding:1px 4px;color:#ccc;">' + bs[j].pct.toFixed(1) + '%</td></tr>';
      }
      html += '</table>';

      cpsPanel.innerHTML = html;
    }

    function toggleCpsPanel() {
      cpsVisible = !cpsVisible;
      if (cpsPanel) cpsPanel.style.display = cpsVisible ? 'block' : 'none';
      if (cpsBtn) cpsBtn.style.background = cpsVisible ? '#b45309' : '#6b7280';
      if (cpsVisible) cpsRender();
    }

    function createCpsBtn() {
      cpsBtn = document.createElement('div');
      cpsBtn.id = 'cookie-autopilot-cps-btn';
      cpsBtn.textContent = 'CpS';
      cpsBtn.style.cssText = 'position:fixed;top:10px;left:10px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;background:#6b7280;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      cpsBtn.onclick = function () { toggleCpsPanel(); };
      document.body.appendChild(cpsBtn);

      cpsPanel = document.createElement('div');
      cpsPanel.id = 'cookie-autopilot-cps-panel';
      cpsPanel.style.cssText = 'display:none;position:fixed;top:36px;left:10px;z-index:99998;width:420px;max-height:80vh;overflow-y:auto;background:rgba(10,10,20,0.92);color:#eee;padding:8px;border-radius:6px;border:1px solid #444;font-family:inherit;font-size:12px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      document.body.appendChild(cpsPanel);

      cpsTimer = setInterval(function () {
        try { cpsRender(); } catch (e) {}
      }, 1000);
    }

    function removeCpsUI() {
      if (cpsTimer) clearInterval(cpsTimer);
      if (cpsBtn && cpsBtn.parentNode) cpsBtn.parentNode.removeChild(cpsBtn);
      if (cpsPanel && cpsPanel.parentNode) cpsPanel.parentNode.removeChild(cpsPanel);
      cpsBtn = cpsPanel = cpsTimer = null;
    }

    // ---------- FtHoF 命运之手预测（只读显示，不自动施放，不受总开关控制） ----------
    // 原理：游戏施法时执行 Math.seedrandom(Game.seed + '/' + M.spellsCastTotal)，
    // 之后所有 Math.random() 都是确定性序列。本模块复刻 minigameGrimoire.js
    // castSpell + hand of fate 的每一次随机调用（顺序、次数完全一致），
    // 即可在不改游戏状态的情况下提前算出下一次施放结果，预测恒等于实际结果。
    var fthofPanel = null, fthofBtn = null, fthofTimer = null, fthofVisible = false;
    var FTHOF_NAMES = {
      win: {
        'frenzy': '狂热 Frenzy（CpS ×7）',
        'multiply cookies': '幸运 Lucky（白得饼干）',
        'click frenzy': '点击狂热（点击 ×777）',
        'cookie storm': '饼干风暴（满屏金饼干）',
        'blab': '胡言乱语（无效果的彩蛋）',
        'building special': '建筑特赐（随机建筑 +10% CpS）',
        'cookie storm drop': '风暴金饼干（点击触发饼干风暴）',
        'free sugar lump': '免费糖块！（直接 +1 糖块）'
      },
      fail: {
        'clot': '血凝 Clot（CpS 减半 15 分钟）',
        'ruin cookies': '饼干损毁（损失饼干）',
        'cursed finger': '诅咒手指',
        'blood frenzy': '血怒 Elder frenzy（×666）',
        'free sugar lump': '免费糖块！（失败里的彩蛋）',
        'blab': '胡言乱语（无效果的彩蛋）'
      }
    };

    // 预测第 castNum 次施法（castNum = M.spellsCastTotal + 偏移）的 FtHoF 结果。
    // 纯种子序列复刻，不触碰游戏状态；第二发起假设游戏状态（场上金饼干数影响
    // 失败率、Dragonflight 影响 click frenzy 可抽性等）与当前一致，仅供参考。
    function fthofPredictOne(M, spell, castNum) {
      var failChance = M.getFailChance(spell);
      // 金饼干初始化时的随机消耗：季节图（情人节/愚人节/复活节/万圣节 1 次）
      // + 位置 x、y 各 1 次；win 分支 noWrath、fail 分支 wrath，愤怒判定均不消耗随机
      var seasonPic = (Game.season === 'valentines' || Game.season === 'fools' ||
        Game.season === 'easter' || Game.season === 'halloween') ? 1 : 0;

      Math.seedrandom(Game.seed + '/' + castNum);
      var win = Math.random() < (1 - failChance);
      var force, i;
      if (win) {
        for (i = 0; i < seasonPic + 2; i++) Math.random();
        var choices = ['frenzy', 'multiply cookies'];
        if (!Game.hasBuff('Dragonflight')) choices.push('click frenzy');
        if (Math.random() < 0.1) choices.push('cookie storm', 'cookie storm', 'blab');
        if (Game.BuildingsOwned >= 10 && Math.random() < 0.25) choices.push('building special');
        if (Math.random() < 0.15) choices = ['cookie storm drop'];
        if (Math.random() < 0.0001) choices.push('free sugar lump');
        force = choices[Math.floor(Math.random() * choices.length)];
        if (force === 'cookie storm drop') Math.random(); // sizeMult
      } else {
        for (i = 0; i < seasonPic + 2; i++) Math.random();
        var fchoices = ['clot', 'ruin cookies'];
        if (Math.random() < 0.1) fchoices.push('cursed finger', 'blood frenzy');
        if (Math.random() < 0.003) fchoices.push('free sugar lump');
        if (Math.random() < 0.1) fchoices = ['blab'];
        force = fchoices[Math.floor(Math.random() * fchoices.length)];
      }
      Math.seedrandom(); // 与 castSpell 一致：施放后还原为非种子随机
      return { win: win, force: force, failChance: failChance, castNum: castNum };
    }

    // 高价值结果（「高额的倍率加持」）：命中即停刷
    var FTHOF_GOOD = {
      win: ['click frenzy', 'frenzy', 'building special', 'cookie storm', 'cookie storm drop'],
      fail: ['blood frenzy'] // 血怒 Elder frenzy（×666）虽在失败分支，价值极高
    };
    function fthofIsGood(p) {
      if (!p) return false;
      return FTHOF_GOOD[p.win ? 'win' : 'fail'].indexOf(p.force) !== -1;
    }

    function fthofPredict() {
      var wiz = Game.Objects['Wizard tower'];
      if (!wiz || !wiz.minigame || !wiz.minigame.spells) return null;
      var M = wiz.minigame;
      var spell = M.spells['hand of fate'];
      if (!spell) return null;
      // 下两发：种子 = Game.seed + '/' + (spellsCastTotal + 偏移)
      var casts = [
        fthofPredictOne(M, spell, M.spellsCastTotal),
        fthofPredictOne(M, spell, M.spellsCastTotal + 1)
      ];
      // 消耗最低的法术（用于刷序列；任何法术施放都会推进 spellsCastTotal）
      var cheap = null, cheapCost = Infinity;
      for (var k in M.spells) {
        var c = M.getSpellCost(M.spells[k]);
        if (c < cheapCost) { cheapCost = c; cheap = M.spells[k]; }
      }
      var gn = Game.shimmerTypes && Game.shimmerTypes['golden'] ? Game.shimmerTypes['golden'].n : 0;
      return {
        casts: casts,
        goldOnScreen: gn,
        cheap: cheap,
        cheapCost: cheapCost,
        magic: M.magic,
        magicM: M.magicM,
        castTotal: M.spellsCastTotal
      };
    }

    // ---------- 刷序列：用最廉价法术推进 spellsCastTotal ----------
    var fthofRerollTimer = null;
    var fthofRerollCasts = 0;
    var FTHOF_REROLL_CAP = 200; // 单次自动刷的安全上限

    // 静默施放：屏蔽法术自己的 Notify/音效，防止刷序列时刷屏
    function fthofCastQuiet(M, spell) {
      var on = Game.Notify, ps = window.PlaySound;
      Game.Notify = function () {};
      window.PlaySound = function () {};
      try { M.castSpell(spell); } catch (e) {}
      Game.Notify = on;
      window.PlaySound = ps;
    }

    // 手动刷一次（面板按钮）；返回是否成功施放
    function fthofRerollOnce() {
      var p = fthofPredict();
      if (!p || !p.cheap) return false;
      var M = Game.Objects['Wizard tower'].minigame;
      if (M.magic < p.cheapCost) return false;
      fthofCastQuiet(M, p.cheap);
      fthofRender();
      return true;
    }

    function fthofAutoRerollStop(reason) {
      if (fthofRerollTimer) { clearInterval(fthofRerollTimer); fthofRerollTimer = null; }
      if (reason) {
        console.log('[AutoPilot FtHoF] 停止刷序列：' + reason + '（共施放 ' + fthofRerollCasts + ' 次）');
        try { if (Game.Notify) Game.Notify('命运之手刷序列', reason + '（共 ' + fthofRerollCasts + ' 次）'); } catch (e) {}
      }
      fthofRender();
    }

    function fthofAutoRerollToggle() {
      if (fthofRerollTimer) { fthofAutoRerollStop('手动取消'); return; }
      var p0 = fthofPredict();
      if (!p0) {
        try { if (Game.Notify) Game.Notify('命运之手刷序列', '需要魔法塔小游戏（1 级以上 Wizard tower）'); } catch (e) {}
        return;
      }
      fthofRerollCasts = 0;
      console.log('[AutoPilot FtHoF] 开始刷序列：用最廉价法术推进，直到下两发内出现高价值结果');
      fthofRerollTimer = setInterval(function () {
        try {
          var p = fthofPredict();
          if (!p || !p.cheap) { fthofAutoRerollStop('未检测到魔法塔'); return; }
          var hit = fthofIsGood(p.casts[0]) ? 1 : (fthofIsGood(p.casts[1]) ? 2 : 0);
          if (hit) {
            fthofAutoRerollStop('第 ' + hit + ' 发已出「' +
              ((FTHOF_NAMES[p.casts[hit - 1].win ? 'win' : 'fail'])[p.casts[hit - 1].force] || p.casts[hit - 1].force) + '」，序列就位');
            return;
          }
          if (fthofRerollCasts >= FTHOF_REROLL_CAP) { fthofAutoRerollStop('已达 ' + FTHOF_REROLL_CAP + ' 次安全上限'); return; }
          var M = Game.Objects['Wizard tower'].minigame;
          if (M.magic < p.cheapCost) { fthofRender(); return; } // 魔力不足，等回蓝自动继续
          fthofCastQuiet(M, p.cheap);
          fthofRerollCasts++;
          fthofRender();
        } catch (e) {}
      }, 400);
    }

    function fthofRender() {
      if (!fthofPanel || !fthofVisible) return;
      var p = null;
      try { p = fthofPredict(); } catch (e) {}
      var html = '';
      if (!p) {
        html = '<div style="color:#999;">未检测到魔法塔小游戏。<br>需要至少 1 座 1 级以上的魔法塔（Wizard tower）解锁魔法系统。</div>';
      } else {
        var labels = ['下一发', '第二发'];
        for (var ci = 0; ci < 2; ci++) {
          var pc = p.casts[ci];
          var name = (FTHOF_NAMES[pc.win ? 'win' : 'fail'])[pc.force] || pc.force;
          var good = fthofIsGood(pc);
          html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.35);border-radius:4px;margin-bottom:6px;' +
            (good ? 'border:1px solid #d4a017;' : '') + '">';
          html += labels[ci] + '：<b style="font-size:14px;color:' + (pc.win ? '#6f6' : '#f66') + ';">' +
            (pc.win ? '✔ ' : '✘ ') + name + '</b>' + (good ? ' <span style="color:#d4a017;">★高价值</span>' : '') + '<br>';
          html += '<span style="color:#888;font-size:11px;">失败率 ' + (pc.failChance * 100).toFixed(1) + '%（种子 #' + pc.castNum + '）' +
            (ci === 1 ? '　※假设状态与当前一致' : '') + '</span></div>';
        }
        html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.35);border-radius:4px;margin-bottom:6px;">';
        html += '魔力：<b' + (p.magic >= p.cheapCost ? ' style="color:#6f6;"' : ' style="color:#f66;"') + '>' +
          Math.floor(p.magic) + '/' + Math.floor(p.magicM) + '</b>　刷序列每次耗魔 <b>' + p.cheapCost.toFixed(0) + '</b>' +
          '（' + (p.cheap ? (p.cheap.name || '最廉价法术') : '—') + '）<br>';
        html += '场上金饼干 ×' + p.goldOnScreen + (p.goldOnScreen > 0 ? '（每只 +15% 失败率）' : '');
        html += '</div>';
        // 刷序列按钮（面板每 500ms 重绘，用 inline 事件挂到对外接口上）
        var rerolling = !!fthofRerollTimer;
        html += '<div style="margin-bottom:6px;">' +
          '<span onclick="CookieAutoPilot.fthof.reroll()" style="display:inline-block;padding:3px 10px;margin-right:6px;border-radius:4px;cursor:pointer;background:#2563b9;color:#fff;font-weight:bold;">刷一次</span>' +
          '<span onclick="CookieAutoPilot.fthof.autoReroll()" style="display:inline-block;padding:3px 10px;border-radius:4px;cursor:pointer;background:' +
          (rerolling ? '#d4a017' : '#7c3aed') + ';color:#fff;font-weight:bold;">' +
          (rerolling ? '刷序列中×' + fthofRerollCasts + '（点击停止）' : '自动刷到高价值') + '</span></div>';
        html += '<div style="color:#888;font-size:11px;">刷序列 = 施放最廉价法术推进施放计数（每次施法，无论成败，序列前进一格），<br>' +
          '直到下两发内出现 CF/Frenzy/建筑特赐/饼干风暴/血怒。命中后请<b>停止点金饼干</b>，<br>' +
          '按 combo 需要择机手动施放命运之手。本面板预测只读，不自动施放命运之手。</div>';
      }
      fthofPanel.innerHTML = html;
    }

    function toggleFthofPanel() {
      fthofVisible = !fthofVisible;
      if (fthofPanel) fthofPanel.style.display = fthofVisible ? 'block' : 'none';
      if (fthofBtn) fthofBtn.style.background = fthofVisible ? '#7c3aed' : '#6b7280';
      if (fthofVisible) fthofRender();
    }

    function createFthofBtn() {
      fthofBtn = document.createElement('div');
      fthofBtn.id = 'cookie-autopilot-fthof-btn';
      fthofBtn.textContent = '命运';
      fthofBtn.style.cssText = 'position:fixed;top:10px;left:64px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;background:#6b7280;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      fthofBtn.onclick = function () { toggleFthofPanel(); };
      document.body.appendChild(fthofBtn);

      fthofPanel = document.createElement('div');
      fthofPanel.id = 'cookie-autopilot-fthof-panel';
      fthofPanel.style.cssText = 'display:none;position:fixed;top:36px;left:440px;z-index:99998;width:300px;background:rgba(10,10,20,0.92);color:#eee;padding:8px;border-radius:6px;border:1px solid #444;font-family:inherit;font-size:12px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      document.body.appendChild(fthofPanel);

      fthofTimer = setInterval(function () {
        try { fthofRender(); } catch (e) {}
      }, 500);
    }

    function removeFthofUI() {
      if (fthofTimer) clearInterval(fthofTimer);
      if (fthofRerollTimer) clearInterval(fthofRerollTimer);
      fthofRerollTimer = null;
      if (fthofBtn && fthofBtn.parentNode) fthofBtn.parentNode.removeChild(fthofBtn);
      if (fthofPanel && fthofPanel.parentNode) fthofPanel.parentNode.removeChild(fthofPanel);
      fthofBtn = fthofPanel = fthofTimer = null;
    }

    // ---------- 龙之宝珠刷金饼干（独立模式：暂停主自动化，保留大饼干连点） ----------
    // 流程：装备 龙之宝珠(19)+飞龙在天(10) → 无 buff 且场上无金饼干时循环
    // "卖 1 座最高级建筑 + 买回"（龙之宝珠 10% 几率召唤金饼干，main.js 8201-8214）→
    // 金饼干出现即点，出正向增益 buff 即换回 Radiant Appetite(15)+牛奶之息(1)，结束本次。
    // 切换光环按游戏规则献祭 1 座最高级建筑（main.js 15241），不做免费切换。
    var farmBtn = null;
    var farmActive = false;
    var farmTimer = null;
    var farmCycles = 0;          // 本次已卖出次数
    var farmPhase = '';          // 当前阶段说明
    var FARM_MAX_SELLS = 200;    // 单次运行安全上限
    var FARM_AURA_ON = [19, 10]; // 刷金光环：龙之宝珠 + 飞龙在天
    var FARM_AURA_OFF = [15, 1]; // 结束换回：Radiant Appetite + 牛奶之息
    var FARM_GOOD_BUFFS = ['Frenzy', 'Click frenzy', 'Dragonflight', 'Dragon Harvest'];

    // 最高级（id 最大）且数量 >0 的建筑——与游戏内"最高级建筑"判定一致
    function farmTopBuilding() {
      var hb = 0;
      for (var i in Game.Objects) { if (Game.Objects[i].amount > 0) hb = Game.Objects[i]; }
      return hb;
    }

    // 切换光环（复刻游戏 UI 的代价：献祭 1 座最高级建筑）
    function farmSetAura(slot, id) {
      if (Game.dragonLevel < id + 4) return false; // 光环未解锁
      var cur = slot === 0 ? Game.dragonAura : Game.dragonAura2;
      if (cur === id) return true;
      var hb = farmTopBuilding();
      if (hb) hb.sacrifice(1);
      if (slot === 0) Game.dragonAura = id; else Game.dragonAura2 = id;
      Game.recalculateGains = 1;
      return true;
    }

    // 正向增益 buff 判定（Lucky/饼干风暴/胡言乱语不算，继续刷）
    function farmGoodBuff() {
      for (var bn in Game.buffs) {
        var b = Game.buffs[bn];
        if (!b || !b.name) continue;
        for (var k = 0; k < FARM_GOOD_BUFFS.length; k++) {
          if (b.name === FARM_GOOD_BUFFS[k]) return b.name;
        }
        // 建筑特赐：buff.name 是 'High-five'/'Congregation' 等随机名（main.js
        // goldenCookieBuildingBuffs），只能靠 buff.type.name==='building buff' 识别
        if (b.type && b.type.name === 'building buff') return b.name;
      }
      return '';
    }

    // 进入/维持长者誓约（Elder Pledge 临时安抚，非 Elder Covenant 永久 -5%）：
    // elderWrath=0 期间金饼干不会刷成红饼干（main.js shimmer 初始化 wrath 判定）。
    // 注意：买誓约会触发游戏自带的 CollectWrinklers() 收全部嬤虫（游戏机制，非本脚本行为）
    function farmEnsurePledge() {
      if (Game.elderWrath <= 0) return true; // 未开启阿嬷浩劫，无需誓约
      var up = Game.Upgrades['Elder Pledge'];
      if (!up || !up.unlocked) return false;
      if (up.getPrice() > Game.cookies) return false;
      up.buy(true);
      return Game.elderWrath === 0;
    }

    function farmStart() {
      if (farmActive) return;
      if (Game.dragonLevel < 23) {
        console.warn('[AutoPilot Farm] 龙等级不足：龙之宝珠需要 23 级（当前 ' + Game.dragonLevel + '）');
        try { if (Game.Notify) Game.Notify('刷金饼干', '需要龙 23 级解锁龙之宝珠（当前 ' + Game.dragonLevel + ' 级）'); } catch (e) {}
        return;
      }
      if (!farmTopBuilding()) {
        try { if (Game.Notify) Game.Notify('刷金饼干', '没有任何建筑可卖，无法启动'); } catch (e) {}
        return;
      }
      // 先进入长者誓约（Elder Pledge 临时安抚），确保刷金期间不出红饼干
      if (Game.elderWrath > 0 && !farmEnsurePledge()) {
        console.warn('[AutoPilot Farm] 无法进入长者誓约（Elder Pledge 未解锁或买不起）');
        try { if (Game.Notify) Game.Notify('刷金饼干', '阿嬷浩劫进行中，但 Elder Pledge 未解锁或买不起，无法安抚'); } catch (e) {}
        return;
      }
      farmActive = true;
      farmCycles = 0;
      farmPhase = '装备光环';
      startClicker(); // 保留大饼干连点（主自动化已被 farmActive 暂停）
      var ok1 = farmSetAura(0, FARM_AURA_ON[0]);
      var ok2 = farmSetAura(1, FARM_AURA_ON[1]);
      if (!ok1 || !ok2) { farmFinish('光环装备失败（龙之宝珠/飞龙在天未解锁）', false); return; }
      updateFarmBtn();
      farmTimer = setInterval(function () { try { farmTick(); } catch (e) {} }, 300);
      console.log('[AutoPilot Farm] 开始：龙之宝珠 + 飞龙在天，循环卖建筑召唤金饼干');
      try { if (Game.Notify) Game.Notify('刷金饼干 开始', '龙之宝珠+飞龙在天已装备；再点一次「刷金」按钮可取消'); } catch (e) {}
    }

    function farmTick() {
      if (!farmActive) return;
      if (!clickTimer) startClicker(); // 防止总开关中途把连点停了

      // 维持长者誓约：30 分钟到期后阿嬷浩劫恢复，需续誓约防红饼干
      if (Game.elderWrath > 0) {
        if (farmEnsurePledge()) farmPhase = '已续长者誓约';
        else { farmPhase = '誓约到期且买不起 Elder Pledge，暂停'; updateFarmBtn(); return; }
      }

      // 1. 场上有金饼干 → 点爆并判定结果
      var shimmers = Game.shimmers;
      for (var i = 0; i < shimmers.length; i++) {
        var sh = shimmers[i];
        if (sh && sh.type === 'golden' && sh.pop) {
          sh.pop();
          var good = farmGoodBuff();
          if (good) { farmFinish('获得正向增益：' + good, true); return; }
          farmPhase = '金饼干未给增益，继续刷';
        }
      }

      // 2. 召唤条件：无 buff + 场上无金饼干（龙之宝珠硬条件）
      var buffsN = 0;
      for (var bn in Game.buffs) { if (Game.buffs[bn]) buffsN++; }
      if (buffsN > 0) { farmPhase = '等待现有 buff 结束'; return; }
      if (Game.shimmerTypes['golden'].n > 0) return;

      if (farmCycles >= FARM_MAX_SELLS) { farmFinish('已达 ' + FARM_MAX_SELLS + ' 次卖出上限，放弃本次', false); return; }
      var hb = farmTopBuilding();
      if (!hb) { farmFinish('没有建筑可卖', false); return; }
      if (hb.amount >= 2 || hb.getPrice() <= Game.cookies) {
        hb.sell(1);
        farmCycles++;
        if (hb.getPrice() <= Game.cookies) hb.buy(1); // 买回保持循环稳定
        farmPhase = '卖 ' + hb.name + ' 召唤中（第 ' + farmCycles + ' 次）';
      } else {
        farmPhase = '攒钱买回 ' + hb.name + ' 中（第 ' + farmCycles + ' 次）';
      }
      updateFarmBtn();
    }

    function farmFinish(reason, success) {
      if (!farmActive) return;
      farmActive = false;
      if (farmTimer) { clearInterval(farmTimer); farmTimer = null; }
      // 换回 Radiant Appetite + 牛奶之息（同样按规则献祭）
      farmSetAura(0, FARM_AURA_OFF[0]);
      farmSetAura(1, FARM_AURA_OFF[1]);
      if (!enabled) stopClicker();          // 总开关关着则恢复连点停止状态
      if (enabled && !stopped) schedule();  // 恢复主自动化循环
      updateFarmBtn();
      console.log('[AutoPilot Farm] 结束：' + reason + '（共卖出 ' + farmCycles + ' 次）');
      try {
        if (Game.Notify) Game.Notify(success ? '刷金饼干 成功 ✔' : '刷金饼干 结束', reason + '，已换回 Radiant Appetite + 牛奶之息');
      } catch (e) {}
    }

    function farmStatus() {
      return {
        active: farmActive,
        cycles: farmCycles,
        phase: farmPhase,
        auras: [Game.dragonAuras[Game.dragonAura].name, Game.dragonAuras[Game.dragonAura2].name]
      };
    }

    function createFarmBtn() {
      farmBtn = document.createElement('div');
      farmBtn.id = 'cookie-autopilot-farm-btn';
      farmBtn.style.cssText = 'position:fixed;top:10px;right:154px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      updateFarmBtn();
      farmBtn.onclick = function () {
        if (farmActive) farmFinish('手动取消', false);
        else farmStart();
      };
      document.body.appendChild(farmBtn);
    }
    function updateFarmBtn() {
      if (!farmBtn) return;
      if (farmActive) {
        farmBtn.textContent = '刷金中×' + farmCycles;
        farmBtn.style.background = '#d4a017';
      } else {
        farmBtn.textContent = '刷金';
        farmBtn.style.background = '#6b7280';
      }
    }
    function removeFarmUI() {
      if (farmTimer) clearInterval(farmTimer);
      farmActive = false;
      if (farmBtn && farmBtn.parentNode) farmBtn.parentNode.removeChild(farmBtn);
      farmBtn = null;
    }

    // ---------- 花园自动育种（全自动集齐图鉴；杂交最优留空布局） ----------
    // 原理：游戏全部杂交配方集中在 minigameGarden.js 的 M.getMuts(neighs, neighsM)
    // 纯函数中。本模块在运行时对所有已解锁植物的双亲组合暴力探测 getMuts，
    // 动态得出每个未解锁植物的配方与概率（不硬编码，游戏改配方也不失效）；
    // 再用爬山法在当前花园尺寸上搜索「空格目标变异概率总和最大」的播种图——
    // 变异只发生在空格上（8 邻域判定），所以最优解自然是不播满、为杂交留空。
    // 特例：meddleweed 靠空地自然长杂草；brownMold/crumbspore 靠挖除 meddleweed
    // 掉孢子（onKill：20%×age/100，故 age≥80 就挖防止老死）；queenbeetLump
    // 不可种植只能变异。种植花费最多动用存款的 5%。
    var gardenBtn = null, gardenPanel = null;
    var gardenTimer = null;
    var gardenOn = false;
    var gardenTarget = null;      // 当前目标植物 key
    var gardenTargetType = '';    // 'mut' 杂交 | 'weed' 等杂草 | 'spore' 挖草掉孢子
    var gardenLayout = null;      // {cells, tiles, idxOf, species, score, planted, qualTiles, bestP}
    var gardenPhase = '';
    var gardenPickCache = null;   // {key, pick} —— 解锁数/农场等级不变则复用
    var gardenRecipeCache = null; // {key, recipes}

    function gardenM() {
      var F = Game.Objects['Farm'];
      if (!F || !F.minigame || !F.minigame.getMuts || !F.minigame.plot) return null;
      return F.minigame;
    }

    // 用模拟邻居统计探测 getMuts：neighs 与 neighsM 同值（假设亲本全成熟，
    // 同时满足两类判定——多数配方看成熟邻居，少数如 duketater/shriekbulb 看全部邻居）
    function gardenProbe(M, counts) {
      var neighs = {}, neighsM = {};
      for (var i in M.plants) { neighs[i] = 0; neighsM[i] = 0; }
      for (var k in counts) { neighs[k] = counts[k]; neighsM[k] = counts[k]; }
      return M.getMuts(neighs, neighsM);
    }

    // 动态发现配方：遍历亲本组合，为每个未解锁植物记录概率最高的组合
    function gardenComputeRecipes(M) {
      var unlockedN = 0;
      for (var i in M.plants) if (M.plants[i].unlocked) unlockedN++;
      var ck = unlockedN + '/' + (M.parent ? M.parent.level : 0);
      if (gardenRecipeCache && gardenRecipeCache.key === ck) return gardenRecipeCache.recipes;

      var pool = [];
      for (var i in M.plants) {
        var p = M.plants[i];
        if (p.unlocked && p.plantable !== false) pool.push(p.key);
      }
      var recipes = {};
      var COUNTS_1 = [1, 2, 3, 4, 5, 6, 7, 8]; // 单亲本（覆盖 ≥2/≥3/≥4/≥5/≥8 阈值）
      var COUNTS_2 = [1, 2, 3, 4];             // 双亲本（覆盖 everdaisy 的 3+3 等）
      function register(need) {
        var muts = gardenProbe(M, need);
        var np = 0; for (var kk in need) np += need[kk];
        for (var m = 0; m < muts.length; m++) {
          var key = muts[m][0], prob = muts[m][1];
          if (!M.plants[key] || M.plants[key].unlocked) continue;
          var cur = recipes[key];
          if (!cur || prob > cur.prob || (prob === cur.prob && np < cur.np)) {
            recipes[key] = { need: need, prob: prob, np: np };
          }
        }
      }
      for (var a = 0; a < pool.length; a++) {
        for (var c1 = 0; c1 < COUNTS_1.length; c1++) {
          var need1 = {}; need1[pool[a]] = COUNTS_1[c1];
          register(need1);
        }
        for (var b = a + 1; b < pool.length; b++) {
          for (var ca = 0; ca < COUNTS_2.length; ca++) {
            for (var cb = 0; cb < COUNTS_2.length; cb++) {
              var need2 = {}; need2[pool[a]] = COUNTS_2[ca]; need2[pool[b]] = COUNTS_2[cb];
              register(need2);
            }
          }
        }
      }
      gardenRecipeCache = { key: ck, recipes: recipes };
      return recipes;
    }

    // 爬山法搜索最优播种图：空格对目标的有效变异概率总和最大。
    // 完全无贡献的亲本会被同分修剪（更少亲本、更省钱的图）；
    // 单格有效概率 = p目标/(1+Σp其它)，模拟游戏从通过的变异中均匀 choose 的稀释。
    function gardenOptimize(M, need, target) {
      var tiles = [], idxOf = {};
      for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) {
        if (M.isTileUnlocked(x, y)) { idxOf[x + ',' + y] = tiles.length; tiles.push([x, y]); }
      }
      var species = []; for (var k in need) species.push(k);
      var nS = species.length, n = tiles.length;

      function tileScore(ti, cs) {
        if (cs[ti] !== 0) return 0;
        var x = tiles[ti][0], y = tiles[ti][1];
        var counts = {}, any = false;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var j = idxOf[(x + dx) + ',' + (y + dy)];
            if (j === undefined) continue;
            if (cs[j] > 0) { var kk = species[cs[j] - 1]; counts[kk] = (counts[kk] || 0) + 1; any = true; }
          }
        }
        if (!any) return 0;
        var pT = tileRawProb(counts);
        if (pT > 0) return pT;
        // 未满足条件：给「朝配方靠近的程度」微小部分分，为爬山法提供梯度
        // （否则 queenbeetLump 需 8 邻居、everdaisy 需 3+3 这类高门槛配方困在零梯度平台）
        var got = 0, req = 0;
        for (var s in need) { req += need[s]; got += Math.min(counts[s] || 0, need[s]); }
        return req > 0 ? (got / req) * 0.000001 : 0;
      }

      // 空格对目标的有效变异概率（不含部分分）：p目标/(1+Σp其它)，模拟游戏均匀 choose 的稀释
      function tileRawProb(counts) {
        var muts = gardenProbe(M, counts);
        var pT = 0, pO = 0;
        for (var m = 0; m < muts.length; m++) {
          if (muts[m][0] === target) { if (muts[m][1] > pT) pT = muts[m][1]; } else pO += muts[m][1];
        }
        return pT > 0 ? pT / (1 + pO) : 0;
      }

      // 供最终评估用：只统计真正满足变异条件的空格
      function tileProb(ti, cs) {
        if (cs[ti] !== 0) return 0;
        var x = tiles[ti][0], y = tiles[ti][1];
        var counts = {}, any = false;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var j = idxOf[(x + dx) + ',' + (y + dy)];
          if (j === undefined) continue;
          if (cs[j] > 0) { var kk = species[cs[j] - 1]; counts[kk] = (counts[kk] || 0) + 1; any = true; }
        }
        if (!any) return 0;
        return tileRawProb(counts);
      }

      // 局部得分：改动一格只影响自身 + 8 邻格
      function localScore(ti, cs) {
        var s = tileScore(ti, cs);
        var x = tiles[ti][0], y = tiles[ti][1];
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var j = idxOf[(x + dx) + ',' + (y + dy)];
          if (j !== undefined) s += tileScore(j, cs);
        }
        return s;
      }

      function fullProb(cs) { var s = 0; for (var i = 0; i < n; i++) s += tileProb(i, cs); return s; }
      function plantedCount(cs) { var c = 0; for (var i = 0; i < n; i++) if (cs[i] > 0) c++; return c; }

      var best = null, bestProb = -1, bestPlanted = 0;
      var RESTARTS = 6;
      for (var r = 0; r < RESTARTS; r++) {
        var cur = new Array(n);
        for (var i = 0; i < n; i++) {
          if (r === 0) cur[i] = 0;                                    // 空园起步
          else if (r < 3) cur[i] = Math.random() < 0.4 ? 1 + Math.floor(Math.random() * nS) : 0; // 随机
          else if (r === 3) { var tx = tiles[i][0], ty = tiles[i][1]; cur[i] = 1 + ((tx + ty) % 2) % nS; } // 棋盘交错（破双子阈值平台）
          else if (r === 4) cur[i] = 1;                               // 全种亲本A（破 8 邻居平台）
          else cur[i] = nS;                                           // 全种亲本B
        }
        var improved = true, guard = 0;
        while (improved && guard++ < 80) {
          improved = false;
          for (var ci = 0; ci < n; ci++) {
            for (var st = 0; st <= nS; st++) {
              if (st === cur[ci]) continue;
              var before = localScore(ci, cur);
              var removing = cur[ci] > 0 && st === 0;
              var old = cur[ci]; cur[ci] = st;
              var after = localScore(ci, cur);
              var delta = after - before;
              // 严格概率优先；完全无贡献的亲本允许修剪（同分删株，省钱省维护）
              if (delta > 1e-12 || (removing && Math.abs(delta) <= 1e-12)) { improved = true; }
              else cur[ci] = old;
            }
          }
        }
        var prob = fullProb(cur), pc = plantedCount(cur);
        if (prob > bestProb + 1e-12 || (best && Math.abs(prob - bestProb) <= 1e-12 && pc < bestPlanted)) {
          bestProb = prob; best = cur; bestPlanted = pc;
        }
      }
      var qualTiles = 0, bestP = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var ts = tileProb(i2, best);
        if (ts > 0) { qualTiles++; if (ts > bestP) bestP = ts; }
      }
      return { cells: best, tiles: tiles, idxOf: idxOf, species: species, score: bestProb, planted: bestPlanted, qualTiles: qualTiles, bestP: bestP };
    }

    // 选择当前目标（结果按 解锁数/总数/农场等级 缓存，不会每拍重算布局）
    function gardenPickTarget(M) {
      var unlockedN = 0, total = 0, locked = [];
      for (var i in M.plants) { total++; if (M.plants[i].unlocked) unlockedN++; else locked.push(M.plants[i].key); }
      if (!locked.length) return null;
      var ck = unlockedN + '/' + total + '/' + M.parent.level;
      if (gardenPickCache && gardenPickCache.key === ck) return gardenPickCache.pick;

      var pick = null;
      if (locked.indexOf('meddleweed') !== -1) {
        pick = { key: 'meddleweed', type: 'weed' }; // 只能等空地自然长杂草
      } else {
        var recipes = gardenComputeRecipes(M);
        var sporeKey = null;
        for (var s = 0; s < locked.length; s++) {
          if ((locked[s] === 'brownMold' || locked[s] === 'crumbspore') && !recipes[locked[s]]) { sporeKey = locked[s]; break; }
        }
        if (sporeKey) {
          pick = { key: sporeKey, type: 'spore' }; // 无杂交配方，靠挖 meddleweed 掉孢子
        } else {
          var bestT = null;
          for (var t = 0; t < locked.length; t++) {
            var rec = recipes[locked[t]];
            if (!rec) continue;
            var lay = gardenOptimize(M, rec.need, locked[t]);
            if (lay.qualTiles <= 0) continue; // 当前花园尺寸放不下（如 everdaisy 3+3），等升级
            if (!bestT || lay.score > bestT.layout.score) bestT = { key: locked[t], type: 'mut', layout: lay };
          }
          if (bestT) pick = bestT;
        }
      }
      gardenPickCache = { key: ck, pick: pick };
      return pick;
    }

    // 种植：最多动用存款的 5%，给金饼干/建筑留钱
    function gardenPlant(M, key, x, y) {
      var p = M.plants[key];
      if (!p || !p.unlocked || p.plantable === false) return false;
      if (M.getCost(p) > Game.cookies * 0.05) return false;
      if (!M.canPlant(p)) return false;
      return !!M.useTool(p.id, x, y);
    }

    // 布局内亲本是否已全部种下且成熟（决定要不要用化肥催熟）
    function gardenParentsMature(M) {
      if (!gardenLayout) return true;
      for (var i = 0; i < gardenLayout.tiles.length; i++) {
        var want = gardenLayout.cells[i];
        if (want === 0) continue;
        var t = gardenLayout.tiles[i];
        var tile = M.plot[t[1]][t[0]];
        if (tile[0] <= 0) return false;
        var p = M.plantsById[tile[0] - 1];
        if (!p || p.key !== gardenLayout.species[want - 1] || tile[1] < p.mature) return false;
      }
      return true;
    }

    // 土壤管理：育种期优先木屑（变异×3）；亲本未熟且无木屑时用化肥催熟；其余情况保持
    function gardenManageSoil(M) {
      if (M.nextSoil > Date.now()) return;
      var farms = M.parent.amount;
      var want = M.soil;
      if (gardenTargetType === 'mut') {
        if (farms >= M.soils['woodchips'].req) want = M.soils['woodchips'].id;
        else if (farms >= M.soils['fertilizer'].req && !gardenParentsMature(M)) want = M.soils['fertilizer'].id;
      } else {
        if (farms >= M.soils['fertilizer'].req) want = M.soils['fertilizer'].id; // 长草/熟草都快
      }
      if (want !== M.soil) {
        M.nextSoil = Date.now() + (Game.Has('Turbo-charged soil') ? 1 : 600000); // 复刻游戏 10 分钟冷却
        M.soil = want; M.computeStepT(); M.toCompute = true;
      }
    }

    function gardenTick() {
      if (stopped || !enabled || !gardenOn) return;
      var M = gardenM();
      if (!M) { gardenPhase = '未检测到花园（需 1 座 1 级以上农场）'; return; }
      if (M.freeze) { gardenPhase = '花园已冻结，暂停管理'; return; }

      var t = gardenPickTarget(M);
      if (!t) {
        var total = 0, unlockedN = 0;
        for (var i in M.plants) { total++; if (M.plants[i].unlocked) unlockedN++; }
        if (unlockedN >= total) {
          gardenPhase = '🎉 图鉴集齐（' + total + '/' + total + '）';
          gardenSetOn(false);
          try { if (Game.Notify) Game.Notify('花园育种完成 🎉', '全部 ' + total + ' 种植物种子已集齐！'); } catch (e) {}
          console.log('[AutoPilot Garden] 🎉 图鉴集齐，自动停止');
        } else {
          gardenPhase = '当前花园尺寸/亲本不足，等农场升级（剩 ' + (total - unlockedN) + ' 种）';
        }
        return;
      }
      if (gardenTarget !== t.key || gardenTargetType !== t.type) {
        gardenTarget = t.key; gardenTargetType = t.type;
        gardenLayout = t.layout || null;
        console.log('[AutoPilot Garden] 新目标：' + (M.plants[t.key].name || t.key) + '（' + t.type + '）');
        try { if (Game.Notify) Game.Notify('花园育种', '新目标：' + (M.plants[t.key].name || t.key)); } catch (e) {}
      }

      gardenManageSoil(M);

      // 逐格维护
      for (var y = 0; y < 6; y++) {
        for (var x = 0; x < 6; x++) {
          if (!M.isTileUnlocked(x, y)) continue;
          var tile = M.plot[y][x];
          var plant = tile[0] > 0 ? M.plantsById[tile[0] - 1] : null;

          // 目标出现（杂交成功/孢子/杂草）→ 成熟即收获解锁
          if (plant && plant.key === gardenTarget) {
            if (tile[1] >= plant.mature) {
              M.harvest(x, y);
              gardenTarget = null; gardenLayout = null; gardenPickCache = null;
              gardenPhase = '已收获目标，寻找下一个';
            }
            continue;
          }
          // 孢子期特例：掉出另一种孢子（brownMold/crumbspore 二选一随机）也算收获
          if (gardenTargetType === 'spore' && plant &&
              (plant.key === 'brownMold' || plant.key === 'crumbspore') && !M.plants[plant.key].unlocked) {
            if (tile[1] >= plant.mature) {
              M.harvest(x, y);
              gardenTarget = null; gardenLayout = null; gardenPickCache = null;
              gardenPhase = '意外收获孢子 ' + plant.name;
            }
            continue;
          }

          if (gardenTargetType === 'weed') {
            if (plant) M.harvest(x, y); // 清场等杂草（杂草只在无邻居的空格长出）
            continue;
          }
          if (gardenTargetType === 'spore') {
            if (plant && plant.key === 'meddleweed') {
              // onKill 掉孢子率 20%×age/100；age≥100 会老死不掉，故 80 就挖
              if (tile[1] >= 80) M.harvest(x, y);
              continue;
            }
            if (!plant) { gardenPlant(M, 'meddleweed', x, y); continue; }
            M.harvest(x, y);
            continue;
          }

          // mut 模式：按最优布局维护
          var ci = gardenLayout.idxOf[x + ',' + y];
          var want = gardenLayout.cells[ci];
          if (want === 0) {
            if (plant) M.harvest(x, y); // 挖掉布局外植物（含杂草），保住变异空格
          } else {
            var wantKey = gardenLayout.species[want - 1];
            if (!plant) gardenPlant(M, wantKey, x, y); // 空格补种（含亲本老死后的自动补种）
            else if (plant.key !== wantKey) M.harvest(x, y); // 错种挖掉，下拍补
          }
        }
      }
      gardenPhase = gardenTargetType === 'mut'
        ? '育种中：' + gardenLayout.qualTiles + ' 个变异格，单格最高 ' + (gardenLayout.bestP * 100).toFixed(2) + '%/tick'
        : (gardenTargetType === 'spore' ? '挖 meddleweed 刷孢子中' : '清场等杂草 meddleweed 中');
    }

    function gardenSetOn(on) {
      on = !!on;
      if (on === gardenOn) return;
      gardenOn = on;
      if (gardenOn && !gardenTimer) {
        gardenTimer = setInterval(function () { try { gardenTick(); gardenRender(); } catch (e) {} }, 2000);
      } else if (!gardenOn && gardenTimer) { clearInterval(gardenTimer); gardenTimer = null; }
      if (!gardenOn) { gardenTarget = null; gardenLayout = null; gardenPhase = ''; }
      updateGardenBtn();
      gardenRender();
      console.log('[AutoPilot Garden] 自动育种：' + (gardenOn ? '开启（将管理花园：挖掉布局外植物）' : '关闭'));
      try {
        if (Game.Notify) Game.Notify('花园自动育种', gardenOn ? '已开启：会挖掉布局外植物，请确认花园里没有舍不得的作物' : '已关闭');
      } catch (e) {}
    }

    function gardenStatus() {
      var M = gardenM();
      var unlockedN = 0, total = 0;
      if (M) { for (var i in M.plants) { total++; if (M.plants[i].unlocked) unlockedN++; } }
      return {
        on: gardenOn, target: gardenTarget, type: gardenTargetType, phase: gardenPhase,
        unlocked: unlockedN, total: total,
        layout: gardenLayout ? { species: gardenLayout.species, qualTiles: gardenLayout.qualTiles, bestP: gardenLayout.bestP, planted: gardenLayout.planted } : null
      };
    }

    function gardenRender() {
      if (!gardenPanel) return;
      gardenPanel.style.display = gardenOn ? 'block' : 'none';
      if (!gardenOn) return;
      var M = gardenM();
      var html = '';
      if (!M) {
        html = '<div style="color:#999;">未检测到花园。<br>需要 1 座 1 级以上农场（Farm）解锁花园小游戏。</div>';
      } else {
        var unlockedN = 0, total = 0;
        for (var i in M.plants) { total++; if (M.plants[i].unlocked) unlockedN++; }
        html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.35);border-radius:4px;margin-bottom:6px;">';
        html += '图鉴进度：<b style="color:#6f6;">' + unlockedN + '/' + total + '</b>　土壤：' + M.soilsById[M.soil].name + '<br>';
        html += '当前目标：<b>' + (gardenTarget ? (M.plants[gardenTarget].name || gardenTarget) : '—') + '</b>' +
          (gardenTargetType ? '（' + ({ mut: '杂交', weed: '等杂草', spore: '挖草掉孢子' })[gardenTargetType] + '）' : '') + '<br>';
        html += '状态：' + (gardenPhase || '—');
        html += '</div>';
        if (gardenLayout && gardenTargetType === 'mut') {
          html += '<div style="margin-bottom:2px;color:#fc6;font-weight:bold;">最优留空布局（' + gardenLayout.qualTiles + ' 个变异格，单格最高 ' +
            (gardenLayout.bestP * 100).toFixed(2) + '%/tick，亲本 ' + gardenLayout.planted + ' 株）</div>';
          html += '<pre style="margin:0 0 4px;font-size:14px;line-height:1.25;letter-spacing:2px;">';
          for (var y = 0; y < 6; y++) {
            var row = '';
            for (var x = 0; x < 6; x++) {
              if (!M.isTileUnlocked(x, y)) { row += ' '; continue; }
              var c = gardenLayout.cells[gardenLayout.idxOf[x + ',' + y]];
              row += c === 0 ? '·' : String.fromCharCode(64 + c); // A、B = 亲本
            }
            html += row + '\n';
          }
          html += '</pre>';
          var sn = [];
          for (var s = 0; s < gardenLayout.species.length; s++) {
            sn.push(String.fromCharCode(65 + s) + '=' + (M.plants[gardenLayout.species[s]].name || gardenLayout.species[s]));
          }
          html += '<div style="color:#888;font-size:11px;">' + sn.join('，') + '；· = 留空变异格</div>';
        }
      }
      gardenPanel.innerHTML = html;
    }

    function createGardenBtn() {
      gardenBtn = document.createElement('div');
      gardenBtn.id = 'cookie-autopilot-garden-btn';
      gardenBtn.style.cssText = 'position:fixed;top:10px;left:118px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
      updateGardenBtn();
      gardenBtn.onclick = function () { gardenSetOn(!gardenOn); };
      document.body.appendChild(gardenBtn);

      gardenPanel = document.createElement('div');
      gardenPanel.id = 'cookie-autopilot-garden-panel';
      gardenPanel.style.cssText = 'display:none;position:fixed;top:36px;left:118px;z-index:99998;width:300px;background:rgba(10,10,20,0.92);color:#eee;padding:8px;border-radius:6px;border:1px solid #444;font-family:inherit;font-size:12px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      document.body.appendChild(gardenPanel);
    }
    function updateGardenBtn() {
      if (!gardenBtn) return;
      if (gardenOn) {
        gardenBtn.textContent = '育种中';
        gardenBtn.style.background = '#2d8a3e';
      } else {
        gardenBtn.textContent = '花园';
        gardenBtn.style.background = '#6b7280';
      }
    }
    function removeGardenUI() {
      if (gardenTimer) { clearInterval(gardenTimer); gardenTimer = null; }
      gardenOn = false;
      if (gardenBtn && gardenBtn.parentNode) gardenBtn.parentNode.removeChild(gardenBtn);
      if (gardenPanel && gardenPanel.parentNode) gardenPanel.parentNode.removeChild(gardenPanel);
      gardenBtn = gardenPanel = null;
    }

    schedule();

    // ---------- 对外接口 ----------
    window.CookieAutoPilot = {
      stop: function () {
        stopped = true;
        if (tickTimer) clearTimeout(tickTimer);
        stopClicker();
        removeModeBtn();
        removeMasterBtn();
        removeCpsUI();
        removeFthofUI();
        removeFarmUI();
        removeGardenUI();
        if (bootTimer) clearInterval(bootTimer);
        if (window.__origPlaySound) window.PlaySound = window.__origPlaySound;
        delete window.CookieAutoPilot;
        console.log('[AutoPilot] 已停止。');
      },
      config: CFG,
      setEnabled: setEnabled,
      isEnabled: function () { return enabled; },
      cps: {
        toggle: toggleCpsPanel,
        refresh: cpsRender,
        debug: function () {
          var d = cpsCollect();
          return { computed: d.cum, game: d.gameMult, residual: d.residual, items: d.rows.length };
        }
      },
      stats: function () {
        var lastBuy = buyCount > 0 ? buyTimes[(buyIdx - 1 + BUY_BUF_SIZE) % BUY_BUF_SIZE] : null;
        return {
          recentBuys: buyCount,
          lastBuyAgoMs: lastBuy ? Date.now() - lastBuy : null
        };
      },
      combo: {
        sellForGodzamok: sellForGodzamok,
        status: getComboStatus,
        history: getComboHistory
      },
      fthof: {
        toggle: toggleFthofPanel,
        predict: fthofPredict,
        reroll: fthofRerollOnce,        // 用最廉价法术手动刷一次序列
        autoReroll: fthofAutoRerollToggle // 自动刷到下两发内出现高价值结果
      },
      farm: {
        start: farmStart,
        stop: function () { farmFinish('手动取消', false); },
        status: farmStatus
      },
      garden: {
        start: function () { gardenSetOn(true); },
        stop: function () { gardenSetOn(false); },
        status: gardenStatus,
        recipes: function () { var M = gardenM(); return M ? gardenComputeRecipes(M) : null; }
      },
      setMode: function (m) {
        if (m !== 'strict' && m !== 'fast') {
          console.warn('[AutoPilot] 模式必须是 strict 或 fast');
          return;
        }
        CFG.mode = m;
        updateModeBtn();
        console.log('[AutoPilot] 已切换为 ' + m + ' 模式');
        try {
          if (Game.Notify) Game.Notify('AutoPilot 模式切换', '当前：' + (m === 'strict' ? '严格全局最优（攒钱）' : 'pp 均值快道'));
        } catch (e) {}
      }
    };

    createModeBtn();
    createMasterBtn();
    createFarmBtn();
    createGardenBtn();
    createCpsBtn();
    createFthofBtn();

    console.log('[AutoPilot v5.6.0] 已启动 ✔ 模式=' + CFG.mode + ' | 左上：CpS=增益明细，命运=FtHoF 两发预测+刷序列，花园=自动育种 | 右上：刷金=龙之宝珠刷金饼干，紫=总开关，绿/蓝=模式');
    try {
      if (Game.Notify) Game.Notify('AutoPilot v5.6.0 已启动', '命运之手：预测升级为下两发，新增「自动刷到高价值」序列刷新');
    } catch (e) {}
  }
})();
