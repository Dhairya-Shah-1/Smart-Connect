// api/verify-incident.ts

type GeminiResult = {
  verified: boolean;
  confidence: number;
  reason: string;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405 }
    );
  }

  try {
    const body = await req.json();

    const {
      incidentType,
      description,
      lat,
      lng,
      photoUrl, // Supabase public URL
    } = body;

    if (
      !incidentType ||
      !description ||
      lat == null ||
      lng == null ||
      !photoUrl
    ) {
      return new Response(
        JSON.stringify({ error: 'Missing required incident data' }),
        { status: 400 }
      );
    }

    // -----------------------------
    // 1. Gemini Prompt
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
    // 2. Call Gemini API
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
                  // IMPORTANT:
                  // Gemini DOES NOT accept image URLs directly.
                  // We pass the URL as text context instead.
                  text: `Incident image URL (Supabase Storage): ${photoUrl}`,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const geminiData = await geminiRes.json();

    // -----------------------------
    // 3. Parse Gemini Response
    // -----------------------------
    const textResponse =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('Invalid Gemini response structure');
    }

    let parsed: GeminiResult;

    try {
      parsed = JSON.parse(textResponse);
    } catch {
      throw new Error('Gemini response is not valid JSON');
    }

    // -----------------------------
    // 4. Return to frontend
    // -----------------------------
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Gemini verification failed:', err);

    return new Response(
      JSON.stringify({
        error: err.message || 'Verification failed',
      }),
      { status: 500 }
    );
  }
}