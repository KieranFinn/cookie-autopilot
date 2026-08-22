// ==UserScript==
// @name         Cookie AutoPilot
// @namespace    cookie-autopilot
// @version      4.9.1
// @description  Cookie Clicker 全自动：连点+金饼干+CM最优购买(pp实时修正+均值快道)+节奏自适应(已修复卡死)+屏蔽点击音效
// @match        https://orteil.dashnet.org/cookieclicker/*
// @match        http://orteil.dashnet.org/cookieclicker/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// @downloadURL  https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// ==/UserScript==
/* ============================================================
 * Cookie AutoPilot v4.9.1 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * 购买规则：adjPP ≤ 全体候选均值 → 买得起就买（pp 最小优先）；
 *           adjPP > 均值 → 排队等。均值随游戏阶段自适应。
 *           （全局最优必 ≤ 均值，故贪心纯度不损失）
 * v4.5：节奏自适应（扫货20ms×200件 / 稳态250ms×1件）
 * v4.6：连环购买用实时价格修正 pp
 * v4.9：pp 均值阈值快道（取代纯贪心的死等）
 * v4.9.1：修复模式判断时间锚点——以"最后一笔购买距现在"为准，
 *         否则密集购买结束后永久卡在扫货模式空转烧 CPU
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 配置区 ----------
  var CFG = {
    clickIntervalMs: 4,      // 大饼干点击间隔（毫秒），浏览器最小钳制约 4ms
    wrinklerPopAt: 10,       // 嬤虫攒满多少只时一起点爆
    sweepTickMs: 20,         // 扫货模式节拍（毫秒）
    steadyTickMs: 250,       // 稳态模式节拍（毫秒）
    sweepGapMs: 5000,        // 最近两次购买间隔超过此值 → 回落稳态
    maxSweepBuys: 200,       // 扫货模式单拍购买上限
    sweepPriceRatio: 0.001,  // 零钱线：单价 ≤ 存款 × 此比例才算扫货对象
    sweepBudgetRatio: 0.02   // 每拍扫货总花费 ≤ 存款 × 此比例（硬封顶）
  };

  // 永远不自动购买的升级（会改变黄金饼干机制或纯亏）
  var BLACKLIST = [
    'Elder covenant',           // 永久安抚阿嬷，-5% 产量，血亏
    'Elder Pledge',             // 暂时安抚阿嬷（想手动用时自己买）
    'One mind',                 // 是否开启阿嬷浩劫由你决定
    'Communal brainsweep',
    'Elder pact',
    'Sacrificial rolling pins'  // 降低嬤虫收益的开关型
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
    var buyTimes = []; // 最近购买时间戳（驱动模式切换）

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
    var clickTimer = setInterval(function () {
      try {
        var el = document.getElementById('bigCookie');
        if (el) { Game.lastClick -= 1000; el.click(); }
      } catch (e) {}
    }, CFG.clickIntervalMs);

    // ---------- 2. 模式判断 ----------
    // 扫货：启动时默认进入；最近一次购买距现在 ≤5s 保持
    // 稳态：超过 5s 没有购买 → 回落；再次出现购买立即回到扫货
    // （v4.9.1 修复：时间锚点必须是"现在"，不能是"倒数第二笔"，
    //   否则密集购买结束后永远卡在扫货模式空转烧 CPU）
    function currentMode() {
      var n = buyTimes.length;
      if (n < 1) return 'sweep';
      return (Date.now() - buyTimes[n - 1] <= CFG.sweepGapMs) ? 'sweep' : 'steady';
    }

    function noteBuy() {
      buyTimes.push(Date.now());
      if (buyTimes.length > 200) buyTimes.splice(0, buyTimes.length - 200);
    }

    // ---------- 3. 候选扫描：全体候选 + pp 均值 ----------
    // 关键：pp 用实时价格修正。pp ≈ 价格/产量增益，增益短期不变，
    // 故 修正pp = CM的pp × (实时价格 / CM记录价格)。
    // 返回按修正pp升序的候选列表 + 全体均值（快道阈值）。
    function scanAll() {
      var CMd = window.CookieMonsterData;
      if (!CMd || !CMd.Objects1) return null;

      var list = [];

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

      // 批量购买（×10 / ×100）：跨里程碑时可能成为全局最优
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

      if (CMd.Upgrades) {
        Object.keys(CMd.Upgrades).forEach(function (name) {
          try {
            var info = CMd.Upgrades[name];
            var u = Game.Upgrades[name];
            if (!info || !u || u.bought || !u.unlocked) return;
            if (info.colour === 'Gray') return;
            if (BLACKLIST.indexOf(name) !== -1) return;
            var price = u.getPrice ? u.getPrice() : u.basePrice;
            if (info.pp > 0 && isFinite(info.pp)) {
              list.push({ target: { kind: 'upgrade', obj: u }, price: price, adj: info.pp });
            }
          } catch (e) {}
        });
      });

      if (!list.length) return null;
      var sum = 0;
      for (var i = 0; i < list.length; i++) sum += list[i].adj;
      list.sort(function (a, b) { return a.adj - b.adj; });
      return { list: list, mean: sum / list.length };
    }

    function doBuy(c) {
      if (c.target.kind === 'building') c.target.obj.buy(c.target.amount || 1);
      else c.target.obj.buy(true);
      noteBuy();
    }

    // ---------- 4. 零钱扫货：单价 ≤0.1% 存款，每拍总花费 ≤2% 存款 ----------
    function cheapSweep() {
      var CMd = window.CookieMonsterData;
      if (!CMd) return;
      var line = Game.cookies * CFG.sweepPriceRatio;
      var budget = Game.cookies * CFG.sweepBudgetRatio;
      if (line <= 0 || budget <= 0) return;

      var cheap = [];
      for (var bn in Game.Objects) {
        try {
          var b = Game.Objects[bn];
          if (b.locked) continue;
          var info = CMd.Objects1 && CMd.Objects1[bn];
          if (info && info.colour === 'Gray') continue;
          var p = b.getPrice();
          if (p <= line) cheap.push({ kind: 'building', obj: b, price: p });
        } catch (e) {}
      }
      if (CMd.Upgrades) {
        for (var un in CMd.Upgrades) {
          try {
            var u = Game.Upgrades[un];
            if (!u || u.bought || !u.unlocked) continue;
            if (BLACKLIST.indexOf(un) !== -1) continue;
            var ui = CMd.Upgrades[un];
            if (ui && ui.colour === 'Gray') continue;
            var up = u.getPrice ? u.getPrice() : u.basePrice;
            if (up <= line) cheap.push({ kind: 'upgrade', obj: u, price: up });
          } catch (e) {}
        }
      }

      cheap.sort(function (a, b) { return a.price - b.price; });

      var spent = 0;
      for (var i = 0; i < cheap.length; i++) {
        var c = cheap[i];
        if (spent + c.price > budget) break;
        if (c.price > Game.cookies) break;
        try {
          if (c.kind === 'building') c.obj.buy(1);
          else c.obj.buy(true);
          spent += c.price;
          noteBuy();
        } catch (e) {}
      }
    }

    // ---------- 5. 主循环（动态节拍） ----------
    function tick() {
      if (stopped) return;
      try {
        // --- 黄金饼干 / 红饼干 / 驯鹿：出现即点 ---
        for (var i = 0; i < Game.shimmers.length; i++) {
          var s = Game.shimmers[i];
          if (s && (s.type === 'golden' || s.type === 'reindeer') && s.pop) s.pop();
        }

        // --- 嬤虫：攒满 N 只一起爆，收益最大化 ---
        if (Game.wrinklers) {
          var alive = Game.wrinklers.filter(function (w) { return w.hp > 0; });
          var max = Game.getWrinklersMax ? Game.getWrinklersMax() : CFG.wrinklerPopAt;
          if (alive.length >= Math.min(max, CFG.wrinklerPopAt)) {
            alive.forEach(function (w) { w.hp = 0; });
            if (Game.CollectWrinklers) Game.CollectWrinklers();
          }
        }

        // --- 购买：pp 均值快道 ---
        // adjPP ≤ 均值且买得起 → 按 pp 从小到大买；否则等。
        // 扫货模式单拍最多 maxSweepBuys 件，稳态 1 件。
        var maxBuys = currentMode() === 'sweep' ? CFG.maxSweepBuys : 1;
        for (var k = 0; k < maxBuys; k++) {
          var s = scanAll();
          if (!s) break;
          var pick = null;
          for (var j = 0; j < s.list.length; j++) {
            var c = s.list[j];
            if (c.adj > s.mean) break; // 列表按 pp 升序，超过均值即止
            if (c.price <= Game.cookies) { pick = c; break; }
          }
          if (!pick) break;
          doBuy(pick);
        }

        // --- 零钱扫货（两种模式都跑） ---
        cheapSweep();
      } catch (e) {}
      schedule();
    }

    function schedule() {
      if (stopped) return;
      tickTimer = setTimeout(tick, currentMode() === 'sweep' ? CFG.sweepTickMs : CFG.steadyTickMs);
    }

    schedule();

    // ---------- 对外接口 ----------
    window.CookieAutoPilot = {
      stop: function () {
        stopped = true;
        if (tickTimer) clearTimeout(tickTimer);
        clearInterval(clickTimer);
        delete window.CookieAutoPilot;
        console.log('[AutoPilot] 已停止。');
      },
      config: CFG,
      stats: function () {
        return {
          mode: currentMode(),
          recentBuys: buyTimes.length,
          lastBuyAgoMs: buyTimes.length ? Date.now() - buyTimes[buyTimes.length - 1] : null
        };
      }
    };

    console.log('[AutoPilot v4.9.1] 已启动 ✔ pp均值快道+节奏自适应 停止请输入 CookieAutoPilot.stop()');
    if (Game.Notify) Game.Notify('AutoPilot v4.9.1 已启动', 'pp均值快道+节奏自适应运行中');
  }
})();
