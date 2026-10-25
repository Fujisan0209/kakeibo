/* グラフ：外部ライブラリなしの SVG。色は CSS 変数を使うのでライト/ダーク両方に追従する */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const U = KB.util;
  const h = U.h;

  // 軸の最大値をきりのいい数にする
  function niceMax(v) {
    if (v <= 0) return 1000;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const r = v / p;
    const n = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
    return n * p;
  }
  // きりのいい目盛り間隔（1, 2, 2.5, 5 ×10^n）で軸を作る
  function axis(maxV, minV) {
    const span = Math.max(1, maxV - Math.min(0, minV));
    const raw = span / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / p;
    const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
    const lo = minV < 0 ? -Math.ceil(-minV / step) * step : 0;
    const hi = Math.max(step, Math.ceil(maxV / step) * step);
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    return { lo, hi, ticks };
  }
  // 軸ラベル：1万以上は「万」表記
  function short(v) {
    const a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 100000000) return sign + +(a / 100000000).toFixed(1) + '億';
    if (a >= 10000) return sign + +(a / 10000).toFixed(a >= 1000000 ? 0 : 1) + '万';
    return sign + U.fmt(a);
  }

  /**
   * 月別収支：収入・支出の棒＋収支（差額）の折れ線
   * data: [{label, income, expense}]
   */
  // スマホでは描画幅を狭くして、文字が小さくなりすぎないようにする
  const narrow = () => window.matchMedia('(max-width: 600px)').matches;

  function barLine(data, opts) {
    opts = opts || {};
    const W = narrow() ? 400 : 640, H = 260, L = 52, R = 12, T = 16, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const nets = data.map((d) => d.income - d.expense);
    const ax = axis(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)), ...nets), Math.min(0, ...nets));
    const maxV = ax.hi, minV = ax.lo;
    const y = (v) => T + ph - ((v - minV) / (maxV - minV)) * ph;
    const n = data.length || 1;
    const gw = pw / n;
    const bw = Math.min(18, gw * 0.32);
    let s = '';
    // 目盛り
    for (const v of ax.ticks) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text class="axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + h(short(v)) + '</text>';
    }
    if (minV < 0) s += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    data.forEach((d, i) => {
      const cx = L + gw * i + gw / 2;
      const tip = d.label + '　収入 ' + U.yen(d.income) + '／支出 ' + U.yen(d.expense) + '／収支 ' + U.yenSigned(d.income - d.expense);
      s += '<g class="bar-group' + (opts.active === i ? ' is-active' : '') + '" data-i="' + i + '"><title>' + h(tip) + '</title>';
      s += '<rect class="hit" x="' + (L + gw * i) + '" y="' + T + '" width="' + gw + '" height="' + ph + '"/>';
      s += '<rect class="bar-income" x="' + (cx - bw - 1) + '" y="' + y(d.income) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(d.income)) + '" rx="2"/>';
      s += '<rect class="bar-expense" x="' + (cx + 1) + '" y="' + y(d.expense) + '" width="' + bw + '" height="' + Math.max(0, y(0) - y(d.expense)) + '" rx="2"/>';
      if (i % Math.ceil(n / (W < 500 ? 7 : 12)) === 0 || i === n - 1) s += '<text class="axis" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + h(d.label) + '</text>';
      s += '</g>';
    });
    // 収支の折れ線
    const pts = nets.map((v, i) => [L + gw * i + gw / 2, y(v)]);
    if (pts.length > 1) s += '<polyline class="line-net" points="' + pts.map((p) => p.join(',')).join(' ') + '"/>';
    pts.forEach((p, i) => { s += '<circle class="dot-net" cx="' + p[0] + '" cy="' + p[1] + '" r="3.5"><title>' + h(data[i].label + ' 収支 ' + U.yenSigned(nets[i])) + '</title></circle>'; });
    return svg(W, H, s, opts.label || '月別の収入・支出と収支の推移');
  }

  /** 折れ線（資産推移・予測など）。points: [{label, value, dashed}] */
  function line(points, opts) {
    opts = opts || {};
    const W = narrow() ? 400 : 640, H = 220, L = 56, R = 14, T = 16, B = 32;
    const pw = W - L - R, ph = H - T - B;
    const vals = points.map((p) => p.value);
    const ax = axis(Math.max(1, ...vals), Math.min(0, ...vals));
    const maxV = ax.hi, minV = ax.lo;
    const y = (v) => T + ph - ((v - minV) / (maxV - minV || 1)) * ph;
    const n = points.length;
    const x = (i) => L + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
    let s = '';
    for (const v of ax.ticks) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<text class="axis" x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + h(short(v)) + '</text>';
    }
    if (minV < 0) s += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    const solid = [], dashed = [];
    points.forEach((p, i) => {
      (p.dashed ? dashed : solid).push([x(i), y(p.value)]);
    });
    // 実績の最後の点から予測線をつなぐ
    if (solid.length && dashed.length) dashed.unshift(solid[solid.length - 1]);
    const area = solid.length > 1 ? '<polygon class="area" points="' + solid.map((p) => p.join(',')).join(' ') + ' ' + solid[solid.length - 1][0] + ',' + y(Math.max(minV, 0)) + ' ' + solid[0][0] + ',' + y(Math.max(minV, 0)) + '"/>' : '';
    s += area;
    if (solid.length > 1) s += '<polyline class="line-main" points="' + solid.map((p) => p.join(',')).join(' ') + '"/>';
    if (dashed.length > 1) s += '<polyline class="line-forecast" points="' + dashed.map((p) => p.join(',')).join(' ') + '"/>';
    points.forEach((p, i) => {
      s += '<circle class="' + (p.dashed ? 'dot-forecast' : 'dot-main') + '" cx="' + x(i) + '" cy="' + y(p.value) + '" r="3.5"><title>' + h(p.label + '　' + U.yen(p.value) + (p.dashed ? '（予測）' : '')) + '</title></circle>';
      if (i % Math.ceil(n / (W < 500 ? 7 : 12)) === 0 || i === n - 1) s += '<text class="axis" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + h(p.label) + '</text>';
    });
    return svg(W, H, s, opts.label || '推移');
  }

  /** ドーナツ。items: [{label, value, color}] */
  function donut(items, opts) {
    opts = opts || {};
    const total = items.reduce((x, i) => x + i.value, 0);
    const S = 220, c = S / 2, r = 86, w = 30;
    let s = '';
    if (total <= 0) {
      s += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" class="donut-empty" stroke-width="' + w + '" fill="none"/>';
    } else {
      let a0 = -Math.PI / 2;
      items.forEach((it) => {
        if (it.value <= 0) return;
        const frac = it.value / total;
        const a1 = a0 + frac * Math.PI * 2;
        const pct = Math.round(frac * 1000) / 10;
        const title = '<title>' + h(it.label + '　' + U.yen(it.value) + '（' + pct + '%）') + '</title>';
        if (frac >= 0.9999) {
          s += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + U.safeColor(it.color) + '" stroke-width="' + w + '">' + title + '</circle>';
        } else {
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const p = (a) => (c + r * Math.cos(a)).toFixed(2) + ' ' + (c + r * Math.sin(a)).toFixed(2);
          s += '<path d="M ' + p(a0) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p(a1) + '" fill="none" stroke="' + U.safeColor(it.color) + '" stroke-width="' + w + '" class="donut-seg">' + title + '</path>';
        }
        a0 = a1;
      });
    }
    s += '<text x="' + c + '" y="' + (c - 6) + '" text-anchor="middle" class="donut-label">' + h(opts.centerLabel || '合計') + '</text>';
    s += '<text x="' + c + '" y="' + (c + 18) + '" text-anchor="middle" class="donut-value">' + h(U.yen(total)) + '</text>';
    return svg(S, S, s, opts.label || '内訳', 'chart-donut');
  }

  function svg(w, hh, inner, label, cls) {
    return '<svg class="chart ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + hh + '" role="img" aria-label="' + h(label) + '" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }

  KB.charts = { barLine, line, donut, short, niceMax, axis };
})();
