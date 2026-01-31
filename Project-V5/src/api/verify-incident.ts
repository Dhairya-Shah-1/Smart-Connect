import type { NextApiRequest, NextApiResponse } from 'next';

type GeminiResult = {
  verified: boolean;
  confidence: number;
  reason: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeminiResult | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // -----------------------------
    // 1. Extract data from frontend
    // -----------------------------
    const {
      incidentType,
      description,
      lat,
      lng,
      photoUrl, // Supabase Storage public URL
    } = req.body;

    if (!incidentType || !description || !lat || !lng || !photoUrl) {
      return res.status(400).json({
        error: 'Missing required incident data',
      });
    }

    // -----------------------------
    // 2. Gemini Prompt (TEXT + IMAGE)
    // -----------------------------
    const prompt = `
You are an AI system that verifies civic incident reports.

Incident Type:
${incidentType}

Incident Description:
${description}

Incident Location:
Latitude: ${lat}
Longitude: ${lng}

Additional Instruction:
Check the weather conditions for the given location and assess
whether the reported incident is realistic.

Incident Proof:
An image is provided as evidence.

Your task:
1. Decide if the incident is REAL or FAKE.
2. Provide a confidence score between 0 and 1.
3. Give a short justification.

Respond ONLY in JSON format:
{
  "verified": true | false,
  "confidence": number,
  "reason": "string"
}
`;

    // -----------------------------
    // 3. Call Gemini API
    // -----------------------------
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: photoUrl, // Gemini supports URL-based image analysis
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();

    // -----------------------------
    // 4. Parse Gemini Response
    // -----------------------------
    const textResponse =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Invalid Gemini response');
    }

    const parsed: GeminiResult = JSON.parse(textResponse);

    // -----------------------------
    // 5. Return result to frontend
    // -----------------------------
    return res.status(200).json(parsed);

  } catch (err: any) {
    console.error('Gemini verification failed:', err);
    return res.status(500).json({
      error: err.message || 'Verification failed',
    });
  }
}