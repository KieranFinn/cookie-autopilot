// ==UserScript==
// @name         Cookie AutoPilot
// @namespace    cookie-autopilot
// @version      5.1.0
// @description  Cookie Clicker 全自动：连点+金饼干+CM最优购买(strict/fast双模式切换)+固定100ms节拍+嬤虫满员轮替(只捏最肥一只,飞升前全捏)+屏蔽点击音效
// @match        https://orteil.dashnet.org/cookieclicker/*
// @match        http://orteil.dashnet.org/cookieclicker/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// @downloadURL  https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// ==/UserScript==
/* ============================================================
 * Cookie AutoPilot v5.1.0 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * 购买规则：
 *   strict（默认）—— 只买全体候选中修正 pp 最低项，买不起就等；
 *   fast —— 修正 pp ≤ 全体均值且买得起就连环买（v4.9.6 快道）。
 *   切换：CookieAutoPilot.setMode('strict'|'fast')
 * v5.0.0：废除 pp 均值快道，改为严格全局最优（攒钱策略）
 * v5.1.0：strict / fast 双模式切换
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
    function noteBuy() {
      buyTimes.push(Date.now());
      if (buyTimes.length > 200) buyTimes.splice(0, buyTimes.length - 200);
    }

    // ---------- 3. 候选扫描：全体候选，按修正 pp 升序 + 全体均值 ----------
    // pp 用实时价格修正。修正pp = CM的pp × (实时价格 / CM记录价格)。
    // 返回按修正pp升序的候选列表 + 全体均值（fast 模式用）。
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

    // ---------- 4. 购买执行（按模式分支） ----------
    function buyStrict(s) {
      if (!s || !s.list.length) return;
      var best = s.list[0];
      if (best.price <= Game.cookies) doBuy(best);
    }

    function buyFast(s) {
      if (!s || !s.list.length) return;
      for (var k = 0; k < CFG.maxBuysPerTick; k++) {
        var pick = null;
        for (var j = 0; j < s.list.length; j++) {
          var c = s.list[j];
          if (c.adj > s.mean) break;
          if (c.price <= Game.cookies) { pick = c; break; }
        }
        if (!pick) break;
        doBuy(pick);
        s = scanAll();
        if (!s) break;
      }
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

        // --- 购买：按模式切换 ---
        var s = scanAll();
        if (CFG.mode === 'strict') buyStrict(s);
        else buyFast(s);

        // --- 嬤虫：满员轮替（v4.9.6） ---
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
      },
      setMode: function (m) {
        if (m !== 'strict' && m !== 'fast') {
          console.warn('[AutoPilot] 模式必须是 strict 或 fast');
          return;
        }
        CFG.mode = m;
        console.log('[AutoPilot] 已切换为 ' + m + ' 模式');
        if (Game.Notify) Game.Notify('AutoPilot 模式切换', '当前：' + (m === 'strict' ? '严格全局最优（攒钱）' : 'pp 均值快道'));
      }
    };

    console.log('[AutoPilot v5.1.0] 已启动 ✔ 模式=' + CFG.mode + ' | 切换请输入 CookieAutoPilot.setMode("strict"/"fast") | 停止请输入 CookieAutoPilot.stop()');
    if (Game.Notify) Game.Notify('AutoPilot v5.1.0 已启动', '模式：' + (CFG.mode === 'strict' ? '严格全局最优（攒钱）' : 'pp 均值快道'));
  }
})();
