// ==UserScript==
// @name         Cookie AutoPilot
// @namespace    cookie-autopilot
// @version      5.1.6
// @description  Cookie Clicker 全自动：连点+金饼干+红饼干+幸运签自动点击+CM最优购买(strict.fast双模式切换+浮动按钮+bug修复)+固定100ms节拍+嬤虫满员轮替(只捏最肥一只,飞升前全捏)+屏蔽点击音效+季节升级黑名单
// @match        https://orteil.dashnet.org/cookieclicker/*
// @match        http://orteil.dashnet.org/cookieclicker/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// @downloadURL  https://raw.githubusercontent.com/KieranFinn/cookie-autopilot/main/cookie-autopilot.user.js
// ==/UserScript==
/* ============================================================
 * Cookie AutoPilot v5.1.6 — Cookie Clicker 网页版全自动脚本（精简版）
 * 适用版本：网页版 v2.05x（依赖 Cookie Monster 的 pp 数据）
 * 用法：打开游戏 → F12 控制台 → 粘贴本文件全部内容 → 回车
 * 停止：控制台输入 CookieAutoPilot.stop()
 * 购买规则：
 *   strict（默认）—— 只买全体候选中修正 pp 最低项，买不起就等；
 *   fast —— 修正 pp ≤ 全体均值且买得起就连环买（v4.9.6 快道）。
 *   切换：点击屏幕右上角浮动按钮，或控制台 CookieAutoPilot.setMode('strict'|'fast')
 * v5.1.6：修复 CollectWrinklers() 误杀所有虫 + 季节升级全部黑名单
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
    var clickTimer = setInterval(function () {
      try {
        var el = document.getElementById('bigCookie');
        if (el) { Game.lastClick -= 1000; el.click(); }
      } catch (e) {}
    }, CFG.clickIntervalMs);

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

    // ---------- 5. 主循环（固定节拍） ----------
    function tick() {
      if (stopped) return;
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

        // --- 嬤虫：满员轮替 ---
        if (Game.wrinklers) {
          if (Game.OnAscend > 0) {
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
                // 注意：Game.CollectWrinklers() 会杀死所有虫，不是只收集死虫。
                // 单只虫 hp=0 后游戏会自动爆裂并返还饼干，不需要额外调用。
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
        removeModeBtn();
        if (bootTimer) clearInterval(bootTimer);
        if (window.__origPlaySound) window.PlaySound = window.__origPlaySound;
        delete window.CookieAutoPilot;
        console.log('[AutoPilot] 已停止。');
      },
      config: CFG,
      stats: function () {
        var lastBuy = buyCount > 0 ? buyTimes[(buyIdx - 1 + BUY_BUF_SIZE) % BUY_BUF_SIZE] : null;
        return {
          recentBuys: buyCount,
          lastBuyAgoMs: lastBuy ? Date.now() - lastBuy : null
        };
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

    console.log('[AutoPilot v5.1.6] 已启动 ✔ 模式=' + CFG.mode + ' | 点击右上角按钮或输入 CookieAutoPilot.setMode("strict"/"fast") 切换 | 停止请输入 CookieAutoPilot.stop()');
    try {
      if (Game.Notify) Game.Notify('AutoPilot v5.1.6 已启动', '模式：' + (CFG.mode === 'strict' ? '严格全局最优（攒钱）' : 'pp 均值快道'));
    } catch (e) {}
  }
})();
