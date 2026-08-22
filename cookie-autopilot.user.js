// ==UserScript==
// @name         Cookie AutoPilot
// @namespace    cookie-autopilot
// @version      4.4
// @description  Cookie Clicker 全自动：连点+金饼干+CM最优购买(含批量里程碑冲刺)+屏蔽点击音效
// @match        https://orteil.dashnet.org/cookieclicker/*
// @match        http://orteil.dashnet.org/cookieclicker/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// @downloadURL  https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// ==/UserScript==
/* ============================================================
 * Cookie AutoPilot v4 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 配置区 ----------
  var CFG = {
    clickIntervalMs: 4,         // 大饼干点击间隔（毫秒），浏览器最小钳制约 4ms
    wrinklerPopAt: 10,          // 嬤虫攒满多少只时一起点爆
    tickMs: 250                 // 主循环间隔（毫秒）
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

    var timers = [];

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
    timers.push(setInterval(function () {
      try {
        var el = document.getElementById('bigCookie');
        if (el) { Game.lastClick -= 1000; el.click(); }
      } catch (e) {}
    }, CFG.clickIntervalMs));

    // ---------- 2. 主循环 ----------
    timers.push(setInterval(function () {
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

        // --- 自动购买：按 Cookie Monster 的 payback period 最小者 ---
        // 预算 = 当前存款，够钱立即买，无保留金、无冷却
        var CMd = window.CookieMonsterData;
        if (!CMd || !CMd.Objects1) return;

        var bestTarget = null, bestPP = Infinity, bestPrice = 0;

        Object.keys(CMd.Objects1).forEach(function (name) {
          try {
            var info = CMd.Objects1[name];
            var b = Game.Objects[name];
            if (!info || !b || b.locked) return;
            if (info.colour === 'Gray') return;
            if (info.pp > 0 && info.pp < bestPP) {
              bestPP = info.pp;
              bestTarget = { kind: 'building', obj: b, amount: 1 };
              bestPrice = b.getPrice();
            }
          } catch (e) {}
        });

        // 批量购买（×10 / ×100）：平时性价比不如单买，
        // 但跨越里程碑（50/100 座等成就+阶层升级解锁）时会成为全局最优
        [10, 100].forEach(function (qty) {
          var map = qty === 10 ? CMd.Objects10 : CMd.Objects100;
          if (!map) return;
          Object.keys(map).forEach(function (name) {
            try {
              var info = map[name];
              var b = Game.Objects[name];
              if (!info || !b || b.locked) return;
              if (info.colour === 'Gray') return;
              if (info.pp > 0 && info.pp < bestPP) {
                bestPP = info.pp;
                bestTarget = { kind: 'building', obj: b, amount: qty };
                bestPrice = info.price;
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
              if (info.pp > 0 && info.pp < bestPP) {
                bestPP = info.pp;
                bestTarget = { kind: 'upgrade', obj: u };
                bestPrice = price;
              }
            } catch (e) {}
          });
        }

        if (bestTarget && bestPrice <= Game.cookies) {
          if (bestTarget.kind === 'building') bestTarget.obj.buy(bestTarget.amount || 1);
          else bestTarget.obj.buy(true);
        }
      } catch (e) {}
    }, CFG.tickMs));

    // ---------- 对外接口 ----------
    window.CookieAutoPilot = {
      stop: function () {
        timers.forEach(clearInterval);
        timers = [];
        delete window.CookieAutoPilot;
        console.log('[AutoPilot] 已停止。');
      },
      config: CFG
    };

    console.log('[AutoPilot v4.4] 已启动 ✔ 停止请输入 CookieAutoPilot.stop()');
    if (Game.Notify) Game.Notify('AutoPilot v4.4 已启动', '全自动模式运行中');
  }
})();
