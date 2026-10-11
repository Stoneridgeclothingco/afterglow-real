// Afterglow Real: forecast-gated weather layer drawn over the sky render.
// Draws ONLY what the forecast predicts at the slider time: rain (precipitation / rain codes),
// lightning (thunderstorm weather codes 95–99), rainbow (model rainbow odds near its predicted time). Never invents weather.
(function (g) {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  function series(h, key, t) {
    if (!h || !h[key] || !h.time) return null;
    const T = h.time, f = (t - T[0]) / 3600, i = Math.floor(f);
    if (i < 0 || i >= T.length) return null;
    const a = h[key][i], b = h[key][Math.min(T.length - 1, i + 1)];
    return a == null ? b : b == null ? a : a + (b - a) * (f - i);
  }
  const codeAt = (h, t) => { if (!h || !h.weather_code) return null; const i = Math.round((t - h.time[0]) / 3600); return h.weather_code[Math.max(0, Math.min(h.time.length - 1, i))]; };
  const RAIN = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  // what the forecast says at time t
  function conditions(h, ev, t) {
    const pr = series(h, "precipitation", t) || 0, pp = series(h, "precipitation_probability", t) || 0, code = codeAt(h, t);
    const wind = series(h, "wind_speed_10m", t) || 0, wdir = series(h, "wind_direction_10m", t) || 0;
    const rain = (pr >= 0.1 || (RAIN(code) && pp >= 30)) ? clamp(Math.max(pr / 4, RAIN(code) ? 0.25 : 0), 0.12, 1) : 0;
    const thunder = code >= 95 ? (code === 95 ? 0.6 : 1) : 0;
    const bp = ev.bow ? ev.bow.p : 0, bt = ev.bow && ev.bow.t;
    const bow = bp >= 15 && bt ? clamp(bp / 60) * clamp(1 - Math.abs(t - bt) / 2400) : 0;
    return { rain, thunder, bow, bowP: bp, wind, wdir, code, pr, pp };
  }
  let drops = null;
  function draw(cv, C, now, facingAz) {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, g.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const hz = H * 0.62; // horizon line of the stage render
    // rainbow (antisolar — sits opposite the sun, so for a west view it is behind you; drawn as a faint arc + label)
    if (C.bow > 0.02) {
      const cx = W * 0.5, cy = hz + H * 0.05, R = Math.min(W, H) * 0.62, cols = ["#ff3b3b", "#ff8a1f", "#ffe14d", "#4fd05a", "#3fa0ff", "#6a4dff", "#b04dff"];
      x.save(); x.globalCompositeOperation = "screen"; x.lineWidth = Math.max(2, R * 0.018);
      cols.forEach((c, k) => { x.globalAlpha = 0.33 * C.bow; x.strokeStyle = c; x.beginPath(); x.arc(cx, cy, R - k * x.lineWidth, Math.PI, 2 * Math.PI); x.stroke(); });
      x.restore();
    }
    // rain streaks, slanted by the forecast wind
    if (C.rain > 0) {
      const n = Math.round(40 + 260 * C.rain);
      if (!drops || drops.length !== n) drops = Array.from({ length: n }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.8]);
      const rel = Math.sin(((C.wdir + 180 - (facingAz || 270)) * Math.PI) / 180), slant = clamp(C.wind / 40, 0, 0.6) * rel;
      x.save(); x.strokeStyle = "rgba(210,220,235,.45)"; x.lineWidth = 1;
      x.beginPath();
      for (const d of drops) {
        const sp = d[2], y = ((d[1] + now * 0.0009 * sp) % 1) * (H + 40) - 20, xx = ((d[0] + slant * y / H * 0.3) % 1 + 1) % 1 * W, L = 10 + 14 * sp;
        x.moveTo(xx, y); x.lineTo(xx + slant * L, y + L);
      }
      x.stroke();
      // rain veil low on the horizon
      const gr = x.createLinearGradient(0, hz - H * 0.25, 0, hz + 4); gr.addColorStop(0, "rgba(120,125,140,0)"); gr.addColorStop(1, `rgba(120,125,140,${0.25 * C.rain})`);
      x.fillStyle = gr; x.fillRect(0, hz - H * 0.25, W, H * 0.25 + 4); x.restore();
    }
    // lightning: brief cloud flash + occasional bolt, only for thunderstorm codes
    if (C.thunder > 0) {
      const cyc = 2600 / C.thunder, ph = now % cyc, k = Math.floor(now / cyc);
      if (ph < 220) {
        const a = (ph < 60 ? 1 : ph < 110 ? 0.3 : ph < 160 ? 0.8 : 0.15) * C.thunder;
        x.save(); x.fillStyle = `rgba(225,230,255,${0.28 * a})`; x.fillRect(0, 0, W, hz);
        if (k % 2 === 0) {
          let r = Math.sin(k * 91.7) * 0.5 + 0.5, bx = W * (0.2 + 0.6 * r), by = H * 0.18;
          x.strokeStyle = `rgba(255,255,255,${0.95 * a})`; x.lineWidth = 2; x.shadowColor = "#bcd0ff"; x.shadowBlur = 14; x.beginPath(); x.moveTo(bx, by);
          for (let s = 1; s <= 9; s++) { r = Math.sin(k * 13.1 + s * 7.3); bx += r * W * 0.035; by += (hz - H * 0.18) / 9; x.lineTo(bx, by); }
          x.stroke();
        }
        x.restore();
      }
    }
  }
  function label(C) {
    const t = [];
    if (C.rain > 0) t.push(`🌧 Rain forecast (${C.pr.toFixed(1)} mm/h${C.pp ? ", " + Math.round(C.pp) + "%" : ""})`);
    if (C.thunder > 0) t.push("⚡ Thunderstorm forecast");
    if (C.bow > 0.02) t.push(`🌈 Rainbow ${C.bowP}% — look east, behind you`);
    return t.join(" · ");
  }
  g.Wx = { conditions, draw, label };
})(window);
