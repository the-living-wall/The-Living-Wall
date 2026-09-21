/** Original, unpitched local audition candidates; not the approved breathing V3. */
export function makeAirCandidate(context: BaseAudioContext, seconds: number) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 173, low = 0, body = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    low += 0.035 * (noise - low);
    body += 0.006 * (low - body);
    const t = i / data.length;
    // Asymmetric soft exhale, no oscillator or tonal drone.
    const envelope = Math.pow(Math.sin(Math.PI * t), 1.5) * (1 - 0.35 * t);
    data[i] = (low - body) * envelope * 1.6;
  }
  return buffer;
}

/**
 * Original curiosity B: three uneven, soft core pulses. It uses a smoothed
 * noise body with quiet resonant partials, so it feels alive without becoming
 * a clean electronic beep or a recognizable animal call.
 */
export function makeCuriosityCandidate(context: BaseAudioContext) {
  const seconds = 0.78;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 907, smooth = 0;
  const pulses = [
    { start: 0.03, length: 0.16, hz: 286, level: 0.42 },
    { start: 0.28, length: 0.11, hz: 368, level: 0.26 },
    { start: 0.49, length: 0.2, hz: 316, level: 0.34 },
  ];
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    smooth += 0.018 * (noise - smooth);
    let sample = 0;
    for (const pulse of pulses) {
      const local = (t - pulse.start) / pulse.length;
      if (local >= 0 && local <= 1) {
        const envelope = Math.sin(Math.PI * local) ** 1.35;
        const wobble = 1 + 0.035 * Math.sin(t * 41);
        sample += Math.sin(2 * Math.PI * pulse.hz * wobble * t) * envelope * pulse.level;
        sample += smooth * envelope * pulse.level * 0.22;
      }
    }
    data[i] = sample * 0.32;
  }
  return buffer;
}
