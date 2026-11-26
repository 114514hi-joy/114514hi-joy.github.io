const TOOLS = [
  { id: 0, name: "指南针", short: "指南", sub: "磁北航向 · 0–360°", code: "RV · ACC+MAG", color: "#38bdf8" },
  { id: 1, name: "海拔", short: "海拔", sub: "气压换算 · 相对高度", code: "HPA → M", color: "#34d399" },
  { id: 2, name: "光度", short: "光度", sub: "环境照度 · 对数光谱", code: "0.1–100K LX", color: "#fbbf24" },
  { id: 3, name: "体感", short: "体感", sub: "摇一摇 · 翻转手势", code: "2.3G · 900MS", color: "#a78bfa" },
  { id: 4, name: "声音", short: "声音", sub: "环境声级 · 实时分贝", code: "MIC · dBFS", color: "#ff7a45" },
];

const state = {
  mode: "phone", // phone | watch | full
  route: -1,     // -1 = home, 0..4 = tools, 5 = about
  heading: 42,
  pressure: 1008.5,
  relativeAlt: false,
  refAlt: 0,
  pressureHistory: [1009.1, 1008.9, 1008.8, 1008.7, 1008.6, 1008.5],
  lux: 320,
  minLux: 3.2,
  maxLux: 812,
  shakes: 3,
  flips: 1,
  wave: [1.0, 1.02, 1.1, 2.35, 1.4, 1.0, 1.0, 3.1, 1.6, 1.0, 0.98, 1.01],
  db: 46.8,
  minDb: 28.4,
  maxDb: 68.2,
  peakDb: 71.5,
  micActive: false,
  micStream: null,
  timer: null,
};

const viewport = document.getElementById("appViewport");
const stage = document.getElementById("stage");

function iconSvg(kind, color, size = 24) {
  const s = size;
  if (kind === -1) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" fill="${color}"/>
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" fill="${color}"/>
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" fill="rgba(255,255,255,0.8)"/>
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" fill="rgba(255,255,255,0.8)"/>
    </svg>`;
  }
  if (kind === 0) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="rgba(255,255,255,0.82)" stroke-width="1.8"/>
      <polygon points="15.8,8.2 10.6,10.6 13.4,13.4" fill="#ff7a45"/>
      <polygon points="8.2,15.8 10.6,10.6 13.4,13.4" fill="${color}"/>
    </svg>`;
  }
  if (kind === 1) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
      <path d="M3 18L9.5 7.5L13.5 13.5L16.5 9.5L21 18H3Z" fill="${color}33" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  }
  if (kind === 2) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" fill="${color}"/>
      <path d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21M5.6 5.6L7.4 7.4M16.6 16.6L18.4 18.4M18.4 5.6L16.6 7.4M7.4 16.6L5.6 18.4" stroke="rgba(255,255,255,0.88)" stroke-width="1.7" stroke-linecap="round"/>
    </svg>`;
  }
  if (kind === 3) {
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
      <path d="M3 12H7L9.8 5L14.2 19L17 12H21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none">
    <path d="M5 10V14M8.5 7V17M12 8.5V15.5M15.5 6V18M19 9.5V14.5" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function attachLiquidTouch(root = document) {
  root.querySelectorAll(".glass-interactive").forEach((el) => {
    const updateTilt = (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      const nx = Math.max(-1, Math.min(1, (x / rect.width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, (y / rect.height - 0.5) * 2));
      if (el.classList.contains("is-pressed")) {
        el.style.transform = `perspective(700px) scale(0.95) rotateY(${nx * 3.5}deg) rotateX(${-ny * 3.5}deg)`;
      }
    };
    el.addEventListener("pointerdown", (e) => {
      el.classList.add("is-pressed");
      updateTilt(e);
    });
    el.addEventListener("pointermove", updateTilt);
    const reset = () => {
      el.classList.remove("is-pressed");
      el.style.transform = "";
    };
    el.addEventListener("pointerup", reset);
    el.addEventListener("pointerleave", reset);
    el.addEventListener("pointercancel", reset);
  });
}

function renderDock(activeTab) {
  if (state.mode === "watch") return "";
  const tabs = [{ id: -1, name: "总览", color: "#38bdf8" }, ...TOOLS.map(t => ({ id: t.id, name: t.short, color: t.color }))];
  return `
    <nav class="dock glass-pill">
      ${tabs.map(t => `
        <button class="dock-item glass-interactive ${t.id === activeTab ? "active" : ""}" data-nav="${t.id}">
          ${iconSvg(t.id, t.id === activeTab ? t.color : "#cbd5e1", 18)}
          <span>${t.name}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderHome() {
  if (state.mode === "watch") {
    return `
      <div class="page-view">
        <div class="app-header">
          <div>
            <div class="app-title" style="font-size:19px;">体 感</div>
            <div class="app-sub">WearOS · Smart Stack</div>
          </div>
          <span class="tool-tag">LIVE · 5</span>
        </div>
        <div class="watch-stack">
          ${TOOLS.map((t, idx) => `
            <div class="stack-pill glass-card glass-interactive stagger-item" style="--i:${idx}" data-nav="${t.id}">
              <div class="icon-box">${iconSvg(t.id, t.color, 22)}</div>
              <div class="stack-meta">
                <div class="card-title">${t.name}</div>
                <div class="card-sub">${t.sub}</div>
              </div>
              <span class="status-dot"></span>
              <span class="chev">›</span>
            </div>
          `).join("")}
          <button class="glass-pill glass-interactive pill-btn stagger-item" style="--i:5; padding:10px; text-align:center;" data-nav="5">
            关于 · 鸣谢 ›
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="page-view">
      <div class="app-header">
        <div>
          <div class="app-title">体 感</div>
          <div class="app-sub">iOS 26 液态玻璃 · 传感器工作台</div>
        </div>
        <button class="glass-pill glass-interactive pill-btn" data-nav="5">关于 · 鸣谢 ›</button>
      </div>

      <div class="bento-grid">
        <div class="bento-hero glass-card glass-interactive stagger-item" style="--i:0" data-nav="0">
          <div class="icon-box">${iconSvg(0, TOOLS[0].color, 34)}</div>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="card-title" style="font-size:21px;">${TOOLS[0].name}</div>
              <span class="ready-badge">READY</span>
            </div>
            <div class="card-sub" style="font-size:12.5px;">${TOOLS[0].sub}</div>
            <div class="card-code" style="color:${TOOLS[0].color};">${TOOLS[0].code} · 打开仪表 ›</div>
          </div>
        </div>

        ${TOOLS.slice(1).map((t, i) => `
          <div class="bento-tile glass-card glass-interactive stagger-item" style="--i:${i + 1}" data-nav="${t.id}">
            <div class="tile-top">
              <div class="icon-box">${iconSvg(t.id, t.color, 24)}</div>
              <span class="ready-badge">READY</span>
            </div>
            <div>
              <div class="card-title">${t.name}</div>
              <div class="card-sub">${t.sub}</div>
              <div class="card-code" style="color:${t.color};">${t.code}</div>
            </div>
          </div>
        `).join("")}
      </div>

      ${renderDock(-1)}
    </div>
  `;
}

function cardinalOf(deg) {
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function renderCompass() {
  const deg = Math.round(((state.heading % 360) + 360) % 360);
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 - 90) * Math.PI / 180;
    const major = i % 6 === 0;
    const r1 = major ? 76 : 82;
    const r2 = 90;
    const stroke = i === 0 ? "#ff7a45" : (major ? "#38bdf8" : "rgba(203,213,225,0.4)");
    return `<line x1="${100 + Math.cos(a) * r1}" y1="${100 + Math.sin(a) * r1}" x2="${100 + Math.cos(a) * r2}" y2="${100 + Math.sin(a) * r2}" stroke="${stroke}" stroke-width="${major ? 2.4 : 1.2}"/>`;
  }).join("");

  return `
    <div class="tool-body">
      <div class="dial-wrap stagger-item" style="--i:0">
        <svg class="dial-svg" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="93" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.42)" stroke-width="1.5"/>
          <circle cx="100" cy="100" r="68" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
          <g transform="rotate(${-deg} 100 100)">${ticks}</g>
          <polygon points="100,12 94,4 106,4" fill="#38bdf8"/>
          <polygon points="100,48 93,100 107,100" fill="#ff7a45"/>
          <polygon points="100,136 94,100 106,100" fill="rgba(255,255,255,0.28)"/>
          <circle cx="100" cy="100" r="7" fill="#060913" stroke="#fff" stroke-width="1.8"/>
          <circle cx="100" cy="100" r="3" fill="#38bdf8"/>
        </svg>
      </div>
      <div class="hero-readout glass-card stagger-item" style="--i:1">
        <div>
          <span class="big-num">${String(deg).padStart(3, "0")}°</span>
          <span class="unit" style="color:#ff7a45;">${cardinalOf(deg)}</span>
        </div>
        <div class="sub-readout">高精度 · 拖拽下方滑块或转动手机</div>
        <input id="compassSlider" type="range" min="0" max="359" value="${deg}" style="width:85%; margin-top:8px; accent-color:#38bdf8;">
      </div>
    </div>
  `;
}

function renderAltimeter() {
  const absAlt = 44330 * (1 - Math.pow(state.pressure / 1013.25, 1 / 5.255));
  const shown = state.relativeAlt ? absAlt - state.refAlt : absAlt;
  const pts = state.pressureHistory.map((p, i) => {
    const x = 10 + (i / Math.max(1, state.pressureHistory.length - 1)) * 220;
    const y = 78 - ((p - 1007.5) / 2.2) * 58;
    return `${x},${Math.max(12, Math.min(82, y))}`;
  }).join(" ");

  return `
    <div class="tool-body">
      <div class="hero-readout glass-card stagger-item" style="--i:0">
        <div>
          <span class="big-num">${shown.toFixed(1)}</span>
          <span class="unit" style="color:#34d399;">m</span>
        </div>
        <div class="sub-readout">${state.pressure.toFixed(1)} hPa · ${state.relativeAlt ? "相对高度" : "绝对海拔"}</div>
      </div>
      <div class="chart-card glass-card stagger-item" style="--i:1">
        <svg viewBox="0 0 240 96" style="width:100%; height:100%;">
          <polyline fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" points="${pts}"/>
        </svg>
      </div>
      <div class="action-row stagger-item" style="--i:2">
        <button id="zeroAltBtn" class="glass-pill glass-interactive glass-action">${state.relativeAlt ? "还原绝对海拔" : "当前高度归零"}</button>
        <button id="simPressBtn" class="glass-pill glass-interactive glass-action">模拟气压波动</button>
      </div>
    </div>
  `;
}

function renderLight() {
  const scene = state.lux < 10 ? "微弱暗光" : state.lux < 150 ? "柔和室内" : state.lux < 800 ? "普通室内" : "明亮日光";
  const pct = ((Math.log10(Math.max(0.1, state.lux)) + 1) / 6) * 100;
  return `
    <div class="tool-body">
      <div class="hero-readout glass-card stagger-item" style="--i:0">
        <div>
          <span class="big-num">${state.lux >= 100 ? Math.round(state.lux) : state.lux.toFixed(1)}</span>
          <span class="unit" style="color:#fbbf24;">lx</span>
        </div>
        <div class="sub-readout">${scene} · 最低 ${state.minLux.toFixed(1)} / 最高 ${Math.round(state.maxLux)} lx</div>
      </div>
      <div class="chart-card glass-card stagger-item" style="--i:1">
        <div style="height:14px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden; border:1px solid rgba(255,255,255,0.2);">
          <div style="height:100%; width:${Math.max(4, Math.min(100, pct))}%; background:linear-gradient(90deg,#38bdf8,#34d399,#fbbf24,#ff7a45); border-radius:999px;"></div>
        </div>
        <input id="luxSlider" type="range" min="0" max="100" value="${Math.round(pct)}" style="width:100%; margin-top:14px; accent-color:#fbbf24;">
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--muted); margin-top:6px;">
          <span>0.1 lx</span><span>100 lx</span><span>100k lx</span>
        </div>
      </div>
    </div>
  `;
}

function renderMotion() {
  const pts = state.wave.map((v, i) => {
    const x = 8 + (i / Math.max(1, state.wave.length - 1)) * 224;
    const y = 84 - Math.min(4, v) / 4 * 68;
    return `${x},${y}`;
  }).join(" ");

  return `
    <div class="tool-body">
      <div class="counter-row stagger-item" style="--i:0">
        <div class="counter-card glass-card">
          <div class="big-num" style="font-size:28px; color:#ff7a45;">${String(state.shakes).padStart(2, "0")}</div>
          <div class="sub-readout">摇一摇</div>
        </div>
        <div class="counter-card glass-card">
          <div class="big-num" style="font-size:28px;">${String(state.flips).padStart(2, "0")}</div>
          <div class="sub-readout">翻转</div>
        </div>
      </div>
      <div class="chart-card glass-card stagger-item" style="--i:1">
        <svg viewBox="0 0 240 96" style="width:100%; height:100%;">
          <line x1="8" y1="45" x2="232" y2="45" stroke="#ff7a45" stroke-dasharray="4 3" stroke-width="1.2"/>
          <polyline fill="none" stroke="#a78bfa" stroke-width="2.4" stroke-linecap="round" points="${pts}"/>
        </svg>
      </div>
      <div class="action-row stagger-item" style="--i:2">
        <button id="simShakeBtn" class="glass-pill glass-interactive glass-action">模拟摇一摇</button>
        <button id="simFlipBtn" class="glass-pill glass-interactive glass-action">模拟翻转</button>
      </div>
    </div>
  `;
}

function renderSound() {
  const activeSegs = Math.round(((Math.max(20, Math.min(100, state.db)) - 20) / 80) * 24);
  const segs = Array.from({ length: 24 }, (_, i) => {
    let bg = "rgba(255,255,255,0.12)";
    if (i < activeSegs) {
      bg = i < 11 ? "#34d399" : i < 17 ? "#38bdf8" : i < 21 ? "#fbbf24" : "#ff7a45";
    }
    return `<div class="led-seg" style="background:${bg};"></div>`;
  }).join("");
  const label = state.db < 40 ? "安静环境" : state.db < 60 ? "轻声交谈" : state.db < 78 ? "嘈杂街道" : "高分贝环境";

  return `
    <div class="tool-body">
      <div class="hero-readout glass-card stagger-item" style="--i:0">
        <div>
          <span class="big-num">${state.db.toFixed(1)}</span>
          <span class="unit" style="color:#38bdf8;">dB</span>
        </div>
        <div class="sub-readout">${label} · 峰值 ${state.peakDb.toFixed(1)} dB</div>
      </div>
      <div class="chart-card glass-card stagger-item" style="--i:1">
        <div style="font-size:12px; color:var(--body); text-align:center;">
          ${state.micActive ? "正在通过浏览器麦克风实时采集" : "点击下方开启真实麦克风或模拟声波"}
        </div>
        <div class="led-row">${segs}</div>
      </div>
      <div class="action-row stagger-item" style="--i:2">
        <button id="micBtn" class="glass-pill glass-interactive glass-action">${state.micActive ? "停止麦克风" : "开启真实麦克风"}</button>
        <button id="simSoundBtn" class="glass-pill glass-interactive glass-action">脉冲测试音</button>
      </div>
    </div>
  `;
}

function renderAbout() {
  return `
    <div class="tool-body">
      <div class="glass-card stagger-item" style="--i:0; padding:16px; display:flex; align-items:center; gap:14px;">
        <div class="icon-box">${iconSvg(0, "#38bdf8", 30)}</div>
        <div style="flex:1;">
          <div class="card-title">体 感 Sense</div>
          <div class="card-sub">iOS 26 Liquid Glass · Web + Android + WearOS</div>
        </div>
        <span class="tool-tag">V1.2</span>
      </div>
      <div class="glass-card stagger-item" style="--i:1; padding:16px; display:flex; flex-direction:column; gap:8px; font-size:13px;">
        <div style="font-family:ui-monospace,monospace; font-size:11px; color:var(--accent);">鸣谢 · CREDITS</div>
        <div style="display:flex; justify-content:space-between;"><span>寒彻歌未竟</span><span style="color:var(--muted);">设计 · 开发</span></div>
        <div style="display:flex; justify-content:space-between;"><span>OPPO Watch 3 Pro</span><span style="color:var(--muted);">实机验证</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Web + Android APK</span><span style="color:var(--muted);">跨端统一体验</span></div>
      </div>
      <div class="glass-card stagger-item" style="--i:2; padding:14px; font-size:12px; color:var(--body);">
        本网页版支持桌面端交互模拟，并在手机浏览器下可调用真实方向传感器与麦克风；右上角可直接下载 Android / WearOS 通用安装包。
      </div>
    </div>
  `;
}

function render() {
  if (state.route === -1) {
    viewport.innerHTML = renderHome();
  } else {
    const title = state.route === 5 ? "关于 · 鸣谢" : TOOLS[state.route].name;
    const tag = state.route === 5 ? "ABOUT" : TOOLS[state.route].code.split(" ")[0];
    let body = "";
    if (state.route === 0) body = renderCompass();
    else if (state.route === 1) body = renderAltimeter();
    else if (state.route === 2) body = renderLight();
    else if (state.route === 3) body = renderMotion();
    else if (state.route === 4) body = renderSound();
    else body = renderAbout();

    viewport.innerHTML = `
      <div class="page-view">
        <div class="tool-bar glass-pill">
          <button class="back-btn glass-pill glass-interactive" data-nav="-1">‹</button>
          <span class="tool-title">${title}</span>
          <span class="tool-tag">${tag}</span>
        </div>
        ${body}
        <div class="hint-line">iOS 26 液态玻璃交互 · 实时传感器工作台</div>
        ${renderDock(state.route)}
      </div>
    `;
  }
  bindEvents();
  attachLiquidTouch(viewport);
}

function bindEvents() {
  viewport.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = Number(el.dataset.nav);
      if (target !== state.route) {
        state.route = target;
        render();
      }
    });
  });

  const cs = document.getElementById("compassSlider");
  if (cs) cs.addEventListener("input", (e) => { state.heading = Number(e.target.value); render(); });

  const zeroAlt = document.getElementById("zeroAltBtn");
  if (zeroAlt) zeroAlt.addEventListener("click", () => {
    const absAlt = 44330 * (1 - Math.pow(state.pressure / 1013.25, 1 / 5.255));
    state.relativeAlt = !state.relativeAlt;
    if (state.relativeAlt) state.refAlt = absAlt;
    render();
  });

  const simPress = document.getElementById("simPressBtn");
  if (simPress) simPress.addEventListener("click", () => {
    state.pressure = +(state.pressure + (Math.random() - 0.5) * 0.6).toFixed(2);
    state.pressureHistory = [...state.pressureHistory.slice(-11), state.pressure];
    render();
  });

  const ls = document.getElementById("luxSlider");
  if (ls) ls.addEventListener("input", (e) => {
    const logVal = (Number(e.target.value) / 100) * 6 - 1;
    state.lux = Math.pow(10, logVal);
    state.minLux = Math.min(state.minLux, state.lux);
    state.maxLux = Math.max(state.maxLux, state.lux);
    render();
  });

  const sb = document.getElementById("simShakeBtn");
  if (sb) sb.addEventListener("click", () => {
    state.shakes += 1;
    state.wave = [...state.wave.slice(-10), 2.85, 1.3];
    render();
  });

  const fb = document.getElementById("simFlipBtn");
  if (fb) fb.addEventListener("click", () => {
    state.flips += 1;
    state.wave = [...state.wave.slice(-10), 1.9, 1.05];
    render();
  });

  const simSnd = document.getElementById("simSoundBtn");
  if (simSnd) simSnd.addEventListener("click", () => {
    state.db = +(55 + Math.random() * 28).toFixed(1);
    state.peakDb = Math.max(state.peakDb, state.db);
    render();
  });

  const micBtn = document.getElementById("micBtn");
  if (micBtn) micBtn.addEventListener("click", toggleMic);
}

async function toggleMic() {
  if (state.micActive) {
    state.micActive = false;
    if (state.micStream) state.micStream.getTracks().forEach(t => t.stop());
    clearInterval(state.timer);
    render();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.micStream = stream;
    state.micActive = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    state.timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      state.db = Math.max(24, Math.min(98, 20 * Math.log10(rms + 1e-4) + 92));
      state.peakDb = Math.max(state.peakDb, state.db);
      if (state.route === 4) render();
    }, 150);
    render();
  } catch {
    state.db = 54.2;
    render();
  }
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
    stage.className = `stage mode-${state.mode}`;
    render();
  });
});

render();
