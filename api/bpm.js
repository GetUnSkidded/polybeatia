import { AudioContext } from 'node-web-audio-api';
import { guess } from 'web-audio-beat-detector';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: `Failed to fetch audio: ${response.status}` });
    }

    const arrayBuffer = await response.arrayBuffer();

    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();

    const { bpm, offset } = await guess(audioBuffer);

    res.json({ bpm, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
