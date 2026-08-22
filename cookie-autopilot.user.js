// ==UserScript==
// @name         Cookie AutoPilot
// @namespace    cookie-autopilot
// @version      4.9.6
// @description  Cookie Clicker 全自动：连点+金饼干+CM最优购买(pp实时修正+均值快道)+固定100ms节拍纯pp快道+嬤虫满员轮替(只捏最肥一只,飞升前全捏)+屏蔽点击音效
// @match        https://orteil.dashnet.org/cookieclicker/*
// @match        http://orteil.dashnet.org/cookieclicker/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// @downloadURL  https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// ==/UserScript==
/* ============================================================
 * Cookie AutoPilot v4.9.6 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * 购买规则：adjPP ≤ 全体候选均值 → 买得起就买（pp 最小优先）；
 *           adjPP > 均值 → 排队等。均值随游戏阶段自适应。
 *           （全局最优必 ≤ 均值，故贪心纯度不损失）
 * v4.5：节奏自适应（扫货20ms×200件 / 稳态250ms×1件）
 * v4.6：连环购买用实时价格修正 pp
 * v4.9：pp 均值阈值快道（取代纯贪心的死等）
 * v4.9.2：扫货/稳态改为"失衡驱动"——存在 adjPP≤均值 且买得起的候选才全速
 * v4.9.3：嬤虫改为 n² 囤积引擎——常态满员不捏、差钱捏最肥的、飞升前全捏
 * v4.9.4：删除扫货/稳态模式系统——固定 100ms 节拍，每拍连环买光合格候选
 * v4.9.5：删除零钱扫货——所有购买 100% 走 pp 快道，不再有不看 pp 的通道
 * v4.9.6：嬤虫改为满员轮替——满员只捏最肥的一只，删除差钱补差额逻辑
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 配置区 ----------
  var CFG = {
    clickIntervalMs: 4,      // 大饼干点击间隔（毫秒），浏览器最小钳制约 4ms
    tickMs: 100,             // 主循环固定节拍（游戏 33ms/帧结算，100ms 是利用率甜点位）
    maxBuysPerTick: 200      // 单拍连环购买上限
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
    var buyTimes = []; // 最近购买时间戳（stats 用）

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

    // ---------- 2. 购买记录（stats 用） ----------
    // v4.9.4：模式系统已删除。节奏由购买循环自然形成——
    // 有合格候选就一拍打光，没有就空扫一拍，无需人为分档。
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
      }

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

    // ---------- 5. 主循环（固定节拍） ----------
    function tick() {
      if (stopped) return;
      try {
        // --- 黄金饼干 / 红饼干 / 驯鹿：出现即点 ---
        for (var i = 0; i < Game.shimmers.length; i++) {
          var s = Game.shimmers[i];
          if (s && (s.type === 'golden' || s.type === 'reindeer') && s.pop) s.pop();
        }

        // --- 购买：pp 均值快道（v4.9.4 无模式，每拍尽力买） ---
        // 每拍连环买：adjPP ≤ 均值且买得起的最优项 → 涨价修正后再扫 → 再买，
        // 直到没有合格候选或单拍 200 件封顶。有活一拍打光，无活空扫一拍。
        for (var k = 0; k < CFG.maxBuysPerTick; k++) {
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

        // --- 嬤虫：满员轮替（v4.9.6） ---
        // 满员时只捏最肥的一只（腾出虫位让新虫进场，其余保持满转速 n² 囤积，
        // 虫位上限跟随 Game.getWrinklersMax()）；闪光虫留到飞升前；
        // 飞升面板打开时全捏（囤积跨飞升清零）。
        if (Game.wrinklers) {
          if (Game.OnAscend) {
            var anyAlive = false;
            Game.wrinklers.forEach(function (w) { if (w.hp > 0) { w.hp = 0; anyAlive = true; } });
            if (anyAlive && Game.CollectWrinklers) Game.CollectWrinklers();
          } else {
            var alive = Game.wrinklers.filter(function (w) { return w.hp > 0; });
            var wmax = Game.getWrinklersMax ? Game.getWrinklersMax() : 10;
            if (alive.length >= wmax) {
              var fattest = null;
              alive.forEach(function (w) {
                if (w.type) return; // 闪光虫豁免，留到飞升
                if (!fattest || w.sucked > fattest.sucked) fattest = w;
              });
              if (fattest && fattest.sucked > 0) {
                fattest.hp = 0;
                if (Game.CollectWrinklers) Game.CollectWrinklers();
              }
            }
          }
        }
      } catch (e) {}
      schedule();
    }

    function schedule() {
      if (stopped) return;
      tickTimer = setTimeout(tick, CFG.tickMs);
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
          recentBuys: buyTimes.length,
          lastBuyAgoMs: buyTimes.length ? Date.now() - buyTimes[buyTimes.length - 1] : null
        };
      }
    };

    console.log('[AutoPilot v4.9.6] 已启动 ✔ 纯pp快道购买+固定100ms节拍+嬤虫满员轮替 停止请输入 CookieAutoPilot.stop()');
    if (Game.Notify) Game.Notify('AutoPilot v4.9.6 已启动', '嬤虫满员轮替：满员只捏最肥的一只，飞升前全捏');
  }
})();
