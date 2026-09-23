import { Creature } from '/lib/creature.ts';
import { CreatureAudio } from '/lib/creature-audio.ts';
const output = document.querySelector('#result');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
document.querySelector('#run').onclick = async () => {
  document.querySelector('#run').disabled = true;
  const engine = new CreatureAudio(0.45),
    events = [],
    levels = {},
    checks = [];
  const check = (condition, label) => {
    checks.push({ label, passed: !!condition });
    if (!condition) throw Error(label);
  };
  let analyser,
    samples,
    peak = 0,
    raf;
  const play = engine.play.bind(engine);
  engine.play = (cue, preview) => {
    const lane =
      cue === 'purr'
        ? 'purrBed'
        : cue === 'move'
          ? 'movement'
          : cue === 'roll' || cue === 'scales'
            ? 'body'
            : 'active';
    const before = engine[lane];
    play(cue, preview);
    if (engine[lane] && engine[lane] !== before)
      events.push({
        cue,
        preview: !!preview,
        at: +engine.context.currentTime.toFixed(2),
      });
  };
  const meter = () => {
    analyser.getFloatTimeDomainData(samples);
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    raf = requestAnimationFrame(meter);
  };
  const show = (stage) => {
    output.textContent = JSON.stringify(
      { stage, levels, checks, events },
      null,
      2,
    );
  };
  try {
    await engine.start();
    analyser = engine.context.createAnalyser();
    engine.master.connect(analyser);
    samples = new Float32Array(analyser.fftSize);
    meter();
    for (const [cue, seconds] of [
      ['rest', 2.4],
      ['curiosity', 0.78],
      ['touch', 0.4],
      ['voice', 2],
      ['purr', 2.8],
      ['scales', 1.2],
      ['roll', 2],
      ['move', 1],
      ['startle', 0.82],
      ['settle', 0.8],
    ]) {
      peak = 0;
      engine.audition(cue);
      show('单独波形：' + cue);
      await pause((seconds + 0.3) * 1000);
      levels[cue] = +peak.toFixed(6);
      check(peak > 0.00001 && peak < 0.98, cue + ' 有效输出且未削波');
    }
    check(!engine.purrBed, '呼噜试听有限时长');
    const c = new Creature();
    c.resize(1280, 900);
    engine.director.reset();
    engine.update(c);
    let purrVisible = false;
    for (let i = 0; i < 240; i++) {
      c.step(0.05, { x: c.x + 0.065, y: c.y, speed: 0.15, seen: true });
      engine.update(c);
      if (c.enjoyment > 0.45 && c.stroked) {
        check(!!engine.purrBed, '享受文字阈值与呼噜同步');
        purrVisible = true;
      }
      if (i % 20 === 0) show('真实 Creature 慢抚');
      await pause(50);
    }
    check(purrVisible, '真实慢抚可达享受');
    check(
      events.some((e) => e.cue === 'touch' && !e.preview),
      '实际接触回应',
    );
    check(
      events.some((e) => e.cue === 'voice' && !e.preview),
      '实际抚摸出现核心回应',
    );
    const oldPurr = engine.purrBed;
    peak = 0;
    for (let i = 0; i < 35; i++) {
      // Heading is the same orientation used by the renderer; this block tests
      // simultaneous channel behaviour separately from Creature trajectory.
      engine.update({
        time: c.time + 0.05 * (i + 1),
        phase: 'bond',
        stroked: true,
        touching: true,
        enjoyment: 0.8,
        resting: false,
        alarm: 0,
        heading: c.heading + 0.13 * (i + 1),
        motionSpeed: 0.2,
        frightCount: 0,
      });
      check(engine.purrBed === oldPurr, '动作不抢断享受');
      await pause(50);
    }
    for (const cue of ['scales', 'roll', 'move'])
      check(
        events.some((e) => e.cue === cue && !e.preview),
        cue + ' 实际动作触发',
      );
    levels.combined = +peak.toFixed(6);
    check(peak > 0.00001 && peak < 0.98, '身体与享受混音有输出且未削波');
    engine.update({
      time: c.time + 2,
      phase: 'startle',
      stroked: false,
      touching: false,
      enjoyment: 0,
      resting: false,
      alarm: 0.8,
      heading: 0,
      motionSpeed: 0.3,
      frightCount: 1,
    });
    check(
      !engine.purrBed && !engine.body && !engine.movement,
      '受惊清除其他通道',
    );
    check(engine.active?.cue === 'startle', '受惊独立声');
    await pause(1000);
    engine.director.reset();
    const idle = new Creature();
    idle.resize(1280, 900);
    engine.update(idle);
    for (let i = 0; i < 220; i++) {
      idle.step(0.05, { x: 0.5, y: 0.5, speed: 0, seen: false });
      engine.update(idle);
      if (i % 20 === 0) show('独处呼吸');
      await pause(50);
    }
    check(
      events.some((e) => e.cue === 'rest' && !e.preview),
      '独处无需疲劳即可呼吸',
    );
    engine.stop();
    check(
      !engine.active && !engine.body && !engine.movement && !engine.purrBed,
      '停止关闭全部通道',
    );
    // Collapse repeated per-frame assertions into a readable evidence record.
    const summary = [...new Map(checks.map((x) => [x.label, x])).values()];
    output.textContent = JSON.stringify(
      { passed: true, levels, checks: summary, events },
      null,
      2,
    );
  } catch (error) {
    output.textContent = JSON.stringify(
      { passed: false, error: String(error), levels, checks, events },
      null,
      2,
    );
  } finally {
    cancelAnimationFrame(raf);
    engine.close();
    document.querySelector('#run').disabled = false;
  }
};
