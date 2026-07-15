module.exports = async function handler(req, res) {
  try {
    const { MPEGDecoder } = await import('mpg123-decoder');
    const MusicTempo = require('music-tempo');

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });

    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: `Failed to fetch audio: ${response.status}` });

    const buffer = Buffer.from(await response.arrayBuffer());

    const decoder = new MPEGDecoder();
    await decoder.ready;
    const { channelData, sampleRate } = decoder.decode(buffer);
    decoder.free();

    // Mix to mono
    const mono = channelData.length > 1
      ? channelData[0].map((s, i) => (s + channelData[1][i]) / 2)
      : channelData[0];

    // Low-pass filter to isolate bass
    const rc = 1.0 / (5 * 2 * Math.PI);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);
    const filtered = new Float32Array(mono.length);
    filtered[0] = mono[0];
    for (let i = 1; i < mono.length; i++) {
      filtered[i] = filtered[i - 1] + alpha * (mono[i] - filtered[i - 1]);
    }

    const mt = new MusicTempo(Array.from(filtered), { sampleRate });

    // For each beat, sample peak amplitude in a 50ms window to get strength
    const windowSamples = Math.floor(sampleRate * 0.05);
    const peaks = mt.beats.map(beatTime => {
      const center = Math.floor(beatTime * sampleRate);
      const start = Math.max(0, center - windowSamples);
      const end = Math.min(filtered.length, center + windowSamples);
      let maxAmp = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(filtered[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
      return { time: beatTime, strength: maxAmp };
    });

    // Normalize strength to 0-1
    const maxStr = Math.max(...peaks.map(p => p.strength), 1e-10);
    const beats = peaks
      .map(p => `${p.time.toFixed(2)}:${(p.strength / maxStr).toFixed(2)}`)
      .join(',');

    res.json({ bpm: mt.tempo, beats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
