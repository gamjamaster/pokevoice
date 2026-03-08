/**
 * Next.js API Route: POST /api/identify
 * Calls the Gemini API via the official @google/genai SDK.
 * GEMINI_API_KEY is kept server-side — never exposed to the browser.
 */
import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  const GEMINI_MODEL   = process.env.GEMINI_MODEL   || 'gemma-3-27b-it';

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model:    GEMINI_MODEL,
      contents: req.body.contents,
    });

    // Return in the same shape as the REST API so the client works unchanged
    res.status(200).json({ candidates: response.candidates });
  } catch (err) {
    const status = err.status ?? 500;
    res.status(status).json({ error: { message: err.message } });
  }
}
