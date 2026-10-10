/* 거인과 도망자 — 사운드 (Web Audio API로 직접 합성: 외부 음원·저작권 음악 없음)
 * BGM: 낮은 베이스 펄스 + 마이너 패드 + 아르페지오 + (위험할 때) 심장 박동·킥. 거인이 가까울수록 빨라지고 커짐.
 * SFX: 샷건·기절·벽 부수기·벽넘기·열쇠·문 열림·탈출 팡파르·잡힘·뷱 꿀꺽·아이템·부활·거인 +1
 * ?sound=0 끄기 · ?vol=0..1 (기본 0.6) · ?bgm=0 음악만 끄기. 브라우저 전용(노드 시뮬레이션에는 로드되지 않음). */
(function () {
  'use strict';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- 합성 엔진 (실시간 AudioContext / OfflineAudioContext 공용) ----------
  function createEngine(ctx, out) {
    const master = ctx.createGain(); master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 7000; tone.Q.value = 0.3; // 전체 고역 순화
    master.connect(tone); tone.connect(comp); comp.connect(out || ctx.destination);
    const bgmBus = ctx.createGain(); bgmBus.gain.value = 0.55; bgmBus.connect(master);
    const bgmLP = ctx.createBiquadFilter(); bgmLP.type = 'lowpass'; bgmLP.frequency.value = 2600; bgmLP.Q.value = 0.4; bgmLP.connect(bgmBus);
    const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
    // 간단한 공간감(피드백 딜레이)
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.33; const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.18;
    const dlyLP = ctx.createBiquadFilter(); dlyLP.type = 'lowpass'; dlyLP.frequency.value = 1800;
    dly.connect(dlyLP); dlyLP.connect(fb); fb.connect(dly); dlyLP.connect(wet); wet.connect(bgmBus);
    // 노이즈 버퍼
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    let seed = 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; nd[i] = (seed / 4294967296) * 2 - 1; }

    const E = { ctx, master, bgmBus, sfxBus, counts: {}, total: 0, intensity: 0, target: 0, bgmOn: true, sfxOn: true, active: 0 };

    // ---- 기본 소리 블록 ----
    function env(g, t, a, peak, d, sus, r, len) { // ADSR (len = 누르고 있는 시간)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * sus, t + a, d / 3);
      g.gain.setValueAtTime(peak * sus, t + Math.max(a, len)); g.gain.setTargetAtTime(0.0001, t + Math.max(a, len), r / 4);
    }
    function osc(type, f, t, dur, vol, dest, opt) {
      opt = opt || {};
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + (opt.glide || dur));
      if (opt.detune) o.detune.value = opt.detune;
      let node = o;
      if (opt.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opt.lp; f2.Q.value = opt.q || 0.7; o.connect(f2); node = f2; }
      node.connect(g); g.connect(dest);
      const a = opt.a ?? 0.005, r = opt.r ?? Math.min(0.3, dur * 0.6);
      env(g, t, a, vol, opt.d ?? dur * 0.5, opt.s ?? 0.6, r, dur - r * 0.5);
      o.start(t); o.stop(t + dur + r + 0.1);
      if (opt.send) { const s = ctx.createGain(); s.gain.value = opt.send; g.connect(s); s.connect(dly); }
      return o;
    }
    function noise(t, dur, vol, dest, opt) {
      opt = opt || {};
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = opt.type || 'lowpass'; f.frequency.setValueAtTime(opt.f || 1200, t); f.Q.value = opt.q || 0.7;
      if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
      const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (opt.a || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    }

    // ---------- BGM ----------
    // 진행: A단조 계열 4마디 패턴 여러 개 (8마디마다 교체), 32마디마다 조 이동
    const PROGS = [
      [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-1, 2, 7]],      // i - VI - iv - V(sus)
      [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2]],       // i - i - VI - V
      [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]],      // i - VII - VI - V
      [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-5, -1, 2]],        // i - bII - i - V (긴장)
      [[0, 3, 7], [-7, -4, 0], [-4, 0, 3], [-2, 2, 5]],      // i - iv - VI - VII
    ];
    const ARPS = [[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3], [2, 1, 0, 1], [0, 2, 3, 1], [0, 0, 2, 1]];
    const KEYS = [45, 43, 48, 41, 46]; // A, G, C, F, Bb (루트 MIDI, 베이스 옥타브)
    const S = { step: 0, bar: 0, next: 0, prog: 0, arp: 0, key: 0, rest: false };
    let rng = 7;
    const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    const bpm = () => 82 + E.intensity * 34;
    function scheduleStep(t, dur) {
      const I = E.intensity, st = S.step % 16;
      if (st === 0) { // 새 마디
        if (S.bar % 8 === 0) { S.prog = Math.floor(rnd() * PROGS.length); S.arp = Math.floor(rnd() * ARPS.length); }
        if (S.bar % 32 === 0 && S.bar > 0) S.key = (S.key + 1 + Math.floor(rnd() * 2)) % KEYS.length;
        S.rest = I < 0.25 && S.bar % 16 === 15 && rnd() < 0.7; // 가끔 숨 돌리는 마디 (평온할 때)
      }
      const chord = PROGS[S.prog][S.bar % 4], root = KEYS[S.key] + chord[0];
      if (st === 0) { // 패드: 마디 전체, 느린 어택
        const len = dur * 16;
        for (let i = 0; i < 3; i++) {
          const n = KEYS[S.key] + 12 + chord[i] + (i === 0 ? 12 : 0);
          osc('sawtooth', mtof(n), t, len, 0.022 + I * 0.01, bgmLP, { a: len * 0.35, d: len * 0.3, s: 0.8, r: len * 0.4, lp: 700 + I * 500, detune: (i - 1) * 7, send: 0.4 });
        }
        osc('sine', mtof(KEYS[S.key] + 24 + chord[1]), t, len, 0.015, bgmLP, { a: len * 0.4, s: 0.8, r: len * 0.4 });
      }
      // 베이스 펄스: 평온 = 4분음표, 긴장 = 8분음표, 아주 가까움 = 8분 + 옥타브
      const bassEvery = I > 0.45 ? 2 : 4;
      if (!S.rest && st % bassEvery === 0) {
        const oct = I > 0.75 && st % 4 === 2 ? 12 : 0;
        osc('triangle', mtof(root - 12 + oct), t, dur * bassEvery * 0.8, 0.16 + I * 0.08, bgmLP, { a: 0.006, d: 0.12, s: 0.35, r: 0.08, lp: 380 + I * 300 });
        osc('sine', mtof(root - 12), t, dur * bassEvery * 0.8, 0.12, bgmLP, { a: 0.006, d: 0.15, s: 0.3, r: 0.08 });
      }
      // 아르페지오: 평온 = 8분음표 띄엄띄엄, 긴장 = 16분음표
      const arpEvery = I > 0.55 ? 1 : 2, pat = ARPS[S.arp];
      if (!S.rest && st % arpEvery === 0 && (I > 0.12 || st % 4 === 0 || rnd() < 0.35)) {
        const idx = pat[(st / arpEvery) % pat.length], up = idx === 3 ? 12 : 0;
        const n = KEYS[S.key] + 24 + chord[idx % 3] + up + (S.bar % 8 >= 4 && st >= 8 ? 12 : 0);
        osc('triangle', mtof(Math.min(n, 81)), t, dur * 0.9, 0.035 + I * 0.02, bgmLP, { a: 0.004, d: 0.08, s: 0.25, r: 0.12, lp: 1800 + I * 600, send: 0.5 });
      }
      // 심장 박동: 위험 0.45 이상, 한 박에 쿵-쿵
      if (I > 0.45 && st % 4 === 0) {
        const v = 0.18 * Math.min(1, (I - 0.45) / 0.4);
        osc('sine', 62, t, 0.14, v, bgmBus, { to: 38, glide: 0.12, a: 0.003, r: 0.08 });
        osc('sine', 55, t + dur * 1.1, 0.12, v * 0.7, bgmBus, { to: 34, glide: 0.1, a: 0.003, r: 0.07 });
      }
      // 킥 + 부드러운 하이햇 (중간 이상 긴장)
      if (I > 0.3 && (st === 0 || st === 8 || (I > 0.7 && st === 10))) osc('sine', 110, t, 0.18, 0.12 + I * 0.08, bgmBus, { to: 42, glide: 0.12, a: 0.002, r: 0.1 });
      if (I > 0.6 && st % 4 === 2) noise(t, 0.05, 0.012 + (I - 0.6) * 0.03, bgmBus, { type: 'bandpass', f: 4500, q: 1.2 });
      // 긴장 레이어: 아주 가까우면 낮은 반음 진동 드론
      if (I > 0.7 && st === 0) osc('sawtooth', mtof(root - 11), t, dur * 16, 0.02 * (I - 0.6) / 0.4, bgmLP, { a: 0.4, s: 0.9, r: 0.5, lp: 300, detune: 15 });
      S.step++; if (S.step % 16 === 0) S.bar++;
    }
    E.scheduleUntil = function (until) {
      if (S.next < ctx.currentTime) S.next = ctx.currentTime + 0.05; // 탭 비활성 등으로 밀리면 따라잡지 않고 건너뜀
      while (S.next < until) {
        E.intensity += (E.target - E.intensity) * 0.06; // 부드럽게 따라감
        const dur = 60 / bpm() / 4;
        if (E.bgmOn) scheduleStep(S.next, dur); else { S.step++; if (S.step % 16 === 0) S.bar++; }
        S.next += dur;
      }
    };
    E.setIntensity = (v) => { E.target = Math.max(0, Math.min(1, v)); };

    // ---------- SFX ----------
    const MIN_GAP = { shot: 0.12, miss: 0.12, stun: 0.25, smash: 0.35, vault: 0.2, key: 0.2, door: 1, win: 2, caught: 2, gulp: 0.4, item: 0.12, respawn: 0.4, grow: 2, roar: 0.8, barricade: 0.25, mission: 0.2, cloak: 0.4, boost: 0.4, smoke: 0.4 };
    const lastAt = {};
    const F = {
      shot(t) { noise(t, 0.35, 0.5, sfxBus, { f: 3200, to: 260, q: 0.8, a: 0.002 }); osc('sine', 150, t, 0.25, 0.45, sfxBus, { to: 40, glide: 0.2, a: 0.002, r: 0.12 }); noise(t + 0.06, 0.5, 0.08, sfxBus, { f: 700, to: 200 }); },
      miss(t) { F.shot(t); noise(t + 0.08, 0.3, 0.06, sfxBus, { type: 'bandpass', f: 1500, to: 600, q: 2 }); },
      stun(t) { [0, 0.09, 0.18, 0.27].forEach((d, i) => osc('triangle', mtof(79 - i * 3), t + d, 0.12, 0.07, sfxBus, { to: mtof(74 - i * 3), glide: 0.1, a: 0.004, r: 0.08 })); },
      smash(t) { osc('sine', 90, t, 0.6, 0.55, sfxBus, { to: 30, glide: 0.5, a: 0.003, r: 0.3 }); noise(t, 0.7, 0.45, sfxBus, { f: 900, to: 120, a: 0.003 });
        for (let i = 0; i < 6; i++) noise(t + 0.12 + i * 0.07 + Math.random() * 0.04, 0.12, 0.08, sfxBus, { type: 'bandpass', f: 600 + Math.random() * 900, q: 3 }); },
      vault(t) { osc('triangle', 330, t, 0.22, 0.12, sfxBus, { to: 780, glide: 0.16, a: 0.005, r: 0.1 }); noise(t, 0.15, 0.04, sfxBus, { type: 'bandpass', f: 1200, to: 2400, q: 1 }); },
      key(t) { [76, 83, 88].forEach((n, i) => { osc('sine', mtof(n), t + i * 0.07, 0.35, 0.09, sfxBus, { a: 0.003, d: 0.1, s: 0.3, r: 0.25 }); osc('sine', mtof(n + 12), t + i * 0.07, 0.15, 0.02, sfxBus, { a: 0.003, r: 0.1 }); }); },
      door(t) { osc('sawtooth', 70, t, 0.6, 0.08, sfxBus, { to: 110, glide: 0.5, lp: 500, a: 0.05 }); [60, 64, 67, 72].forEach((n, i) => osc('triangle', mtof(n), t + 0.15 + i * 0.09, 0.5, 0.09, sfxBus, { a: 0.005, s: 0.5, r: 0.3, lp: 2500 })); },
      win(t) { const seq = [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36]]; seq.forEach(([n, d]) => osc('triangle', mtof(n), t + d, 0.16, 0.14, sfxBus, { a: 0.004, s: 0.6, r: 0.08, lp: 3000 }));
        [60, 64, 67, 72, 76].forEach((n) => { osc('sawtooth', mtof(n), t + 0.5, 1.2, 0.035, sfxBus, { a: 0.02, s: 0.7, r: 0.6, lp: 1800, detune: (Math.random() - 0.5) * 10 }); osc('triangle', mtof(n), t + 0.5, 1.2, 0.05, sfxBus, { a: 0.01, s: 0.6, r: 0.6 }); });
        osc('sine', mtof(36), t + 0.5, 1.2, 0.2, sfxBus, { a: 0.01, s: 0.5, r: 0.5 }); },
      caught(t) { [[64, 0], [63, 0.22], [62, 0.44]].forEach(([n, d]) => osc('sawtooth', mtof(n - 12), t + d, 0.24, 0.07, sfxBus, { a: 0.01, s: 0.7, r: 0.1, lp: 900 }));
        [50, 53, 56].forEach((n) => osc('sawtooth', mtof(n - 12), t + 0.66, 1.4, 0.05, sfxBus, { a: 0.02, s: 0.7, r: 0.8, lp: 700, detune: (Math.random() - 0.5) * 16 }));
        osc('sine', 70, t + 0.66, 0.8, 0.4, sfxBus, { to: 30, glide: 0.7, a: 0.003, r: 0.3 }); noise(t + 0.66, 1.0, 0.12, sfxBus, { f: 400, to: 80 }); },
      gulp(t) { [0, 0.22].forEach((d) => { osc('sine', 420, t + d, 0.18, 0.2, sfxBus, { to: 90, glide: 0.16, a: 0.005, r: 0.08 }); noise(t + d, 0.15, 0.06, sfxBus, { type: 'bandpass', f: 500, to: 150, q: 4 }); }); },
      item(t) { osc('triangle', mtof(79), t, 0.08, 0.08, sfxBus, { a: 0.003, r: 0.05 }); osc('triangle', mtof(84), t + 0.07, 0.14, 0.08, sfxBus, { a: 0.003, r: 0.1 }); },
      respawn(t) { noise(t, 0.6, 0.12, sfxBus, { f: 200, to: 2000, a: 0.4 }); osc('sine', 50, t, 0.65, 0.2, sfxBus, { to: 120, glide: 0.6, a: 0.35, r: 0.15 }); },
      grow(t) { [0, 0.35, 0.7].forEach((d) => { osc('sine', 80, t + d, 0.4, 0.4, sfxBus, { to: 35, glide: 0.35, a: 0.003, r: 0.2 }); noise(t + d, 0.25, 0.1, sfxBus, { f: 500, to: 100 }); });
        [45, 48, 52].forEach((n) => osc('sawtooth', mtof(n), t + 1.05, 1.3, 0.04, sfxBus, { a: 0.03, s: 0.7, r: 0.7, lp: 600 })); },
      roar(t) { noise(t, 0.8, 0.14, sfxBus, { type: 'bandpass', f: 300, to: 160, q: 2, a: 0.08 }); osc('sawtooth', 75, t, 0.8, 0.07, sfxBus, { to: 55, glide: 0.7, lp: 400, a: 0.08 }); },
      barricade(t) { noise(t, 0.12, 0.15, sfxBus, { f: 1500, to: 300 }); osc('sine', 140, t, 0.12, 0.2, sfxBus, { to: 70, a: 0.002 }); },
      mission(t) { osc('triangle', mtof(72), t, 0.1, 0.07, sfxBus, { a: 0.003 }); osc('triangle', mtof(76), t + 0.08, 0.16, 0.07, sfxBus, { a: 0.003 }); },
      smoke(t) { noise(t, 0.9, 0.12, sfxBus, { f: 2500, to: 400, a: 0.02 }); },
      cloak(t) { osc('sine', mtof(84), t, 0.5, 0.05, sfxBus, { to: mtof(72), glide: 0.45, a: 0.01, r: 0.2 }); },
      boost(t) { noise(t, 0.5, 0.1, sfxBus, { type: 'bandpass', f: 400, to: 2200, q: 1.5 }); osc('sawtooth', 110, t, 0.45, 0.05, sfxBus, { to: 330, glide: 0.4, lp: 900 }); },
    };
    E.play = function (name, t) {
      if (!E.sfxOn || !F[name]) return false;
      t = t ?? ctx.currentTime + 0.01;
      if (lastAt[name] != null && t - lastAt[name] < (MIN_GAP[name] || 0.1)) return false;
      if (E.active >= 6) return false; // 동시에 너무 많이 → 클리핑 방지
      lastAt[name] = t; E.active++; setTimeout(() => { E.active--; }, 400);
      F[name](t); E.counts[name] = (E.counts[name] || 0) + 1; E.total++;
      return true;
    };
    E.setVolume = (v) => master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    return E;
  }

  // ---------- 오프라인 미리듣기 (WAV) ----------
  async function renderPreview(sec) {
    sec = sec || 20; const sr = 44100;
    const oc = new OfflineAudioContext(2, sr * sec, sr), E = createEngine(oc);
    E.master.gain.value = 0.6; E.active = -1000; // 오프라인에선 동시 제한 없음
    const plan = [[1.5, 'item'], [3, 'key'], [4.5, 'shot'], [4.75, 'stun'], [6, 'vault'], [7.5, 'smash'], [9, 'gulp'], [10.5, 'respawn'], [12, 'miss'], [13, 'door'], [14.5, 'win'], [17, 'caught'], [19, 'grow']];
    for (let t = 0; t < sec; t += 0.1) { const tt = t; E.setIntensity(tt < 5 ? 0.05 : tt < 9 ? (tt - 5) / 4 : tt < 14 ? 0.95 : 0.3); E.target = E.target; E.scheduleUntil(Math.min(sec, tt + 0.1)); for (const [pt, n] of plan) if (pt >= tt && pt < tt + 0.1) E.play(n, pt); }
    const buf = await oc.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0; i < n; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); peak = Math.max(peak, Math.abs(l), Math.abs(r)); dv.setInt16(44 + i * 4, l * 32767, true); dv.setInt16(46 + i * 4, r * 32767, true); }
    return { wav: new Uint8Array(ab), peak, counts: E.counts };
  }

  // ---------- 실시간 관리자 ----------
  const Q = new URLSearchParams(location.search);
  const PREF_KEY = 'giantEscape.sound.v1'; // 두뇌 저장 키와 별개
  let pref = { vol: 0.6, mute: false, bgm: true, sfx: true };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 무시 */ }
  if (Q.has('vol')) { const v = parseFloat(Q.get('vol')); if (isFinite(v)) pref.vol = Math.max(0, Math.min(1, v)); }
  if (Q.get('bgm') === '0') pref.bgm = false;
  if (Q.get('bgm') === '1') pref.bgm = true;
  const DISABLED = Q.get('sound') === '0' || !(window.AudioContext || window.webkitAudioContext);
  const STREAM = /[?&]stream=1(\b|$)/.test(location.search);

  const S = { enabled: !DISABLED, ctx: null, E: null, pref, stream: STREAM, renderPreview, createEngine };
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) { /* 무시 */ } }
  function applyPref() { if (!S.E) return; S.E.setVolume(pref.mute ? 0 : pref.vol); S.E.bgmOn = pref.bgm; S.E.sfxOn = pref.sfx; syncUI(); }
  function ensure() {
    if (!S.enabled) return null;
    if (!S.ctx) {
      try { S.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }); } catch (e) { S.enabled = false; return null; }
      S.E = createEngine(S.ctx); applyPref();
      setInterval(() => { if (S.ctx.state === 'running') S.E.scheduleUntil(S.ctx.currentTime + 0.25); }, 50);
      S.ctx.onstatechange = updateHint;
    }
    if (S.ctx.state !== 'running') S.ctx.resume().then(updateHint, () => {});
    return S.E;
  }
  S.unlock = () => ensure();
  S.running = () => !!(S.ctx && S.ctx.state === 'running');
  S.state = () => (S.ctx ? S.ctx.state : DISABLED ? 'disabled' : 'none');
  S.counts = () => (S.E ? { ...S.E.counts, total: S.E.total } : {});
  S.quiet = false; // 빠른 훈련 중 등
  S.play = (name) => { if (!S.running() || S.quiet || !S.E) return false; return S.E.play(name); };
  S.setDanger = (v) => { if (S.E) S.E.setIntensity(S.quiet ? 0 : v); };
  S.setVol = (v) => { pref.vol = Math.max(0, Math.min(1, v)); if (pref.vol > 0) pref.mute = false; savePref(); applyPref(); };
  S.toggleMute = () => { pref.mute = !pref.mute; savePref(); ensure(); applyPref(); };
  S.setBgm = (on) => { pref.bgm = !!on; savePref(); applyPref(); };
  S.setSfx = (on) => { pref.sfx = !!on; savePref(); applyPref(); };

  // 클릭 안내 (자동재생이 막힌 경우에만, 작게)
  let hintEl = null;
  function updateHint() {
    if (!hintEl) return;
    const show = S.enabled && !pref.mute && S.ctx && S.ctx.state !== 'running';
    hintEl.style.display = show ? '' : 'none';
    syncUI();
  }
  function syncUI() {
    const b = document.getElementById('btnSound'); if (!b) return;
    const on = S.enabled && !pref.mute;
    b.textContent = on ? (S.running() ? '🔊' : '🔈') : '🔇';
    b.classList.toggle('on', on && S.running());
    const v = document.getElementById('sndVol'); if (v && document.activeElement !== v) v.value = Math.round(pref.vol * 100);
    const cb = document.getElementById('sndBgm'); if (cb) cb.checked = pref.bgm;
    const cs = document.getElementById('sndSfx'); if (cs) cs.checked = pref.sfx;
  }
  function buildUI() {
    const ctl = document.querySelector('.controls');
    if (ctl) {
      const w = document.createElement('span'); w.className = 'sound-ctl';
      w.innerHTML = `<button id="btnSound" title="Sound on/off">🔇</button>
        <label class="slider"><span data-i18n="vol">볼륨</span> <input type="range" id="sndVol" min="0" max="100" value="60"></label>
        <label class="chk"><input type="checkbox" id="sndBgm" checked> <span data-i18n="bgm">배경음악</span></label>
        <label class="chk"><input type="checkbox" id="sndSfx" checked> <span data-i18n="sfx">효과음</span></label>`;
      ctl.appendChild(w);
      document.getElementById('btnSound').onclick = (ev) => { ev.stopPropagation(); if (!S.ctx || S.ctx.state !== 'running') { pref.mute = false; savePref(); ensure(); applyPref(); } else S.toggleMute(); };
      document.getElementById('sndVol').oninput = (ev) => { ensure(); S.setVol(ev.target.value / 100); };
      document.getElementById('sndBgm').onchange = (ev) => { ensure(); S.setBgm(ev.target.checked); };
      document.getElementById('sndSfx').onchange = (ev) => { ensure(); S.setSfx(ev.target.checked); };
      if (DISABLED) w.style.display = 'none';
    }
    hintEl = document.createElement('div'); hintEl.className = 'sound-hint'; hintEl.textContent = '🔊 클릭하면 소리 켜짐'; hintEl.style.display = 'none';
    const stage = document.getElementById('stage3d') || document.body; stage.appendChild(hintEl);
    syncUI();
  }
  window.GSound = S;
  if (DISABLED) { S.enabled = false; return; }
  const kick = () => { ensure(); };
  ['pointerdown', 'keydown', 'touchstart', 'click'].forEach((ev) => window.addEventListener(ev, kick, { capture: true, passive: true }));
  document.addEventListener('DOMContentLoaded', buildUI);
  if (document.readyState !== 'loading') buildUI();
  if (STREAM) { // OBS 브라우저 소스(CEF)는 자동재생 허용 → 바로 시작, 계속 재시도
    ensure();
    let tries = 0; const iv = setInterval(() => { if (S.running() || ++tries > 120) { clearInterval(iv); updateHint(); return; } ensure(); if (tries === 3) updateHint(); }, 1000);
    window.addEventListener('focus', kick); document.addEventListener('visibilitychange', kick);
  }
})();
