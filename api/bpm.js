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

    const samples = channelData.length > 1
      ? Array.from(channelData[0]).map((s, i) => (s + channelData[1][i]) / 2)
      : Array.from(channelData[0]);

    const mt = new MusicTempo(samples, { sampleRate });

    res.json({ bpm: mt.tempo, offset: mt.beats[0] || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
