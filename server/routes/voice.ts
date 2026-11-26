import { Hono } from 'hono';
import { transcribeVoiceAudio } from '../services/gemini';

export const voiceRoutes = new Hono();

/**
 * POST /api/voice/transcribe
 * Universal fallback voice transcription powered by Gemini multimodal audio.
 * Accepts `{ audioBase64, mimeType }` (max ~6MB base64) and returns `{ transcript }`.
 */
voiceRoutes.post('/transcribe', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    audioBase64?: string;
    mimeType?: string;
  } | null;

  const audioBase64 = (body?.audioBase64 || '').trim();
  const mimeType = (body?.mimeType || 'audio/webm').trim();

  if (!audioBase64) {
    return c.json({ error: 'Missing audio payload' }, 400);
  }
  if (audioBase64.length > 8_000_000) {
    return c.json({ error: 'Audio clip is too long — please keep voice prompts under 45 seconds.' }, 413);
  }

  const transcript = await transcribeVoiceAudio(audioBase64, mimeType);
  return c.json({ transcript });
});
