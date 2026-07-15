module.exports = async function handler(req, res) {
  try {
    const { MPEGDecoder } = await import('mpg123-decoder');

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: `Audio fetch failed: ${response.status}` });

    const buffer = Buffer.from(await response.arrayBuffer());

    const decoder = new MPEGDecoder();
    await decoder.ready;
    const { channelData, sampleRate } = decoder.decode(buffer);
    decoder.free();

    // Mix to mono
    const mono = channelData.length > 1
      ? channelData[0].map((s, i) => (s + channelData[1][i]) / 2)
      : channelData[0];

    // Low-pass filter at 80Hz — sub-bass and kick drum range
    const rc = 1.0 / (80 * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    const filtered = new Float32Array(mono.length);
    filtered[0] = mono[0];
    for (let i = 1; i < mono.length; i++) {
      filtered[i] = filtered[i - 1] + alpha * (mono[i] - filtered[i - 1]);
    }

    // RMS energy in 20ms windows with 10ms hop
    const winSamples = Math.floor(sampleRate * 0.02);
    const hopSamples = Math.floor(sampleRate * 0.01);
    const energy = [];
    for (let i = 0; i + winSamples < filtered.length; i += hopSamples) {
      let sum = 0;
      for (let j = i; j < i + winSamples; j++) sum += filtered[j] * filtered[j];
      energy.push(Math.sqrt(sum / winSamples));
    }

    // Adaptive threshold: beat must be 1.5x louder than local 500ms average
    // Raise multiplier to get fewer stronger hits, lower for more sensitivity
    const localFrames = 50;
    const multiplier = 1.5;
    const minGap = Math.floor(0.25 / (hopSamples / sampleRate));

    const peaks = [];
    let lastPeak = -minGap;

    for (let i = localFrames; i < energy.length - 1; i++) {
      const localAvg = energy.slice(i - localFrames, i).reduce((a, b) => a + b, 0) / localFrames;
      const curr = energy[i];

      if (
        curr > multiplier * localAvg &&
        curr > energy[i - 1] &&
        curr >= energy[i + 1] &&
        i - lastPeak >= minGap
      ) {
        peaks.push({ time: (i * hopSamples) / sampleRate, strength: curr });
        lastPeak = i;
      }
    }

    const maxStr = Math.max(...peaks.map(p => p.strength), 1);
    const beats = peaks
      .map(p => `${p.time.toFixed(2)}:${(p.strength / maxStr).toFixed(2)}`)
      .join(',');

    res.json({ beats, count: peaks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
