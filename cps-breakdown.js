/* ============================================================
 * CpS Breakdown v1.0 — Cookie Clicker 全量 CpS 增益明细面板
 * 用法：游戏页面控制台粘贴运行，或用书签加载器
 * 面板每秒刷新，逐项列出当前所有生效的 CpS 倍率来源，
 * 并与游戏内部 Game.globalCpsMult 对账（末尾显示偏差）。
 * 再次运行（或点 ✕）关闭面板。
 * ============================================================ */
(function () {
  'use strict';

  if (window.CpsBreakdown) { window.CpsBreakdown.toggle(); return; }
  if (typeof Game === 'undefined' || !Game.ready) {
    console.warn('[CpS Breakdown] 未检测到游戏，请在 Cookie Clicker 页面运行。');
    return;
  }

  var panel = null, btn = null, timer = null, visible = true;

  // ---------- 逐项复现 Game.CalculateGains() 的乘数链 ----------
  function collect() {
    var rows = [];   // {cat, name, mult, note}
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

    // 2. 小游戏效果（花园/神殿等 eff('cps')）
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
      if (g) add('万神殿', 'Godzamok 禁欲（asceticism）' + ['', '钻石', '红宝石', '翡翠'][g] + '位', g === 1 ? 1.15 : g === 2 ? 1.1 : 1.05);
      g = Game.hasGod('ages');
      if (g) {
        var period = g === 1 ? 3 : g === 2 ? 12 : 24;
        var agesMult = 1 + 0.15 * Math.sin((Date.now() / 1000 / (60 * 60 * period)) * Math.PI * 2);
        add('万神殿', 'Age 神（ages，' + period + 'h 周期波动 ±15%）', agesMult, '当前相位');
      }
    }

    // 7. Santa's legacy
    if (Game.Has("Santa's legacy")) add('圣诞老人', "Santa's legacy", 1 + (Game.santaLevel + 1) * 0.03, 'Lv.' + Game.santaLevel);

    // 8. 牛奶与猫：milkMult 先行
    var milkProgress = Game.AchievementsOwned / 25;
    var milkMult = 1;
    if (Game.Has("Santa's milk and cookies")) milkMult *= 1.05;
    milkMult *= 1 + Game.auraMult('Breath of Milk') * 0.05;
    if (Game.hasGod) {
      var mg = Game.hasGod('mother');
      if (mg) milkMult *= mg === 1 ? 1.1 : mg === 2 ? 1.05 : 1.03;
    }
    if (Game.eff) milkMult *= Game.eff('milk');
    add('牛奶', '牛奶增效 milkMult（成就 ' + Game.AchievementsOwned + ' → 奶量 ' + (milkProgress * 100).toFixed(1) + '%）', milkMult);

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
    var bom = Game.auraMult('Breath of Milk');
    if (bom) rows.push({ cat: '龙息光环', name: 'Breath of Milk（已计入 milkMult）', mult: 1, cum: cum, note: '+' + (bom * 5) + '% 奶效' });

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
    if (Game.buffs) {
      for (var b = 0; b < Game.buffs.length; b++) {
        var bf = Game.buffs[b];
        if (typeof bf.multCpS !== 'undefined' && bf.multCpS !== 1) {
          add('Buff', bf.name, bf.multCpS, '剩 ' + Math.ceil(bf.time / Game.fps) + 's');
        }
      }
    }

    return { rows: rows, cum: cum };
  }

  // ---------- 建筑明细 ----------
  function buildingRows() {
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

  // ---------- 渲染 ----------
  function fmt(m) {
    if (m >= 100) return '×' + Beautify(Math.round(m));
    return '×' + m.toFixed(m < 1.1 ? 4 : 3);
  }

  function render() {
    if (!panel || !visible) return;
    var data = collect();
    var html = '';

    // 总览
    var raw = Game.cookiesPsRaw || 0;
    var gameMult = Game.globalCpsMult || 1;
    var final = Game.cookiesPs || 0;
    var sucked = Game.cpsSucked || 0;
    var diff = gameMult > 0 ? Math.abs(data.cum - gameMult) / gameMult : 0;

    html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.35);border-radius:4px;margin-bottom:6px;">';
    html += '建筑裸产：<b>' + Beautify(raw) + '</b>/s<br>';
    html += '全局倍率：<b>' + fmt(gameMult) + '</b>（本脚本复算 ' + fmt(data.cum) + '）<br>';
    html += '最终 CpS：<b style="color:#6f6;">' + Beautify(final) + '</b>/s';
    if (sucked > 0) html += '<br>嬤虫吸走：<b style="color:#f96;">-' + (sucked * 100).toFixed(1) + '%</b>（实际到手 ' + Beautify(final * (1 - sucked)) + '/s）';
    html += '<br>对账：' + (diff < 0.001 ? '<b style="color:#6f6;">✓ 与游戏一致</b>' : '<b style="color:#ff6;">偏差 ' + (diff * 100).toFixed(2) + '%</b>（可能有 mod/未收录项）');
    html += '</div>';

    // 倍率明细
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
        '<td style="padding:1px 4px;color:' + (r.mult >= 1 ? '#6f6' : '#f66') + ';">' + fmt(r.mult) + '</td>' +
        '<td style="padding:1px 4px;color:#ccc;">' + fmt(r.cum) + '</td></tr>';
    }
    html += '</table>';

    // 建筑明细
    var bs = buildingRows();
    html += '<div style="margin:6px 0 2px;color:#fc6;font-weight:bold;">建筑贡献</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    for (var j = 0; j < bs.length; j++) {
      html += '<tr><td style="padding:1px 4px;">' + bs[j].name + ' ×' + bs[j].amount + '</td>' +
        '<td style="padding:1px 4px;color:#6f6;">' + Beautify(Math.round(bs[j].cps)) + '/s</td>' +
        '<td style="padding:1px 4px;color:#ccc;">' + bs[j].pct.toFixed(1) + '%</td></tr>';
    }
    html += '</table>';

    panel.innerHTML = html;
  }

  // ---------- UI ----------
  function createUI() {
    btn = document.createElement('div');
    btn.id = 'cps-breakdown-btn';
    btn.textContent = 'CpS 明细';
    btn.style.cssText = 'position:fixed;top:10px;right:170px;z-index:99999;padding:4px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:bold;color:#fff;background:#b45309;box-shadow:0 2px 4px rgba(0,0,0,0.3);user-select:none;';
    btn.onclick = function () { window.CpsBreakdown.toggle(); };
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'cps-breakdown-panel';
    panel.style.cssText = 'position:fixed;top:36px;right:10px;z-index:99998;width:420px;max-height:80vh;overflow-y:auto;background:rgba(10,10,20,0.92);color:#eee;padding:8px;border-radius:6px;border:1px solid #444;font-family:inherit;font-size:12px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    document.body.appendChild(panel);

    timer = setInterval(function () {
      try { render(); } catch (e) {}
    }, 1000);
    render();
  }

  function destroy() {
    if (timer) clearInterval(timer);
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    btn = panel = timer = null;
    delete window.CpsBreakdown;
    console.log('[CpS Breakdown] 已关闭。');
  }

  window.CpsBreakdown = {
    toggle: function () {
      visible = !visible;
      if (panel) panel.style.display = visible ? 'block' : 'none';
      if (visible) render();
    },
    refresh: render,
    destroy: destroy
  };

  createUI();
  console.log('[CpS Breakdown] 已启动 ✔ 右上角橙色按钮开关面板，控制台 CpsBreakdown.destroy() 彻底移除');
})();
