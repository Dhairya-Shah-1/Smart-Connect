import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { issueType, description } = req.body;

  const prompt = `
You are an AI system verifying civic incident reports.

Incident Location:
Latitude ${location.lat}, Longitude ${location.lng}

Incident Type:
${issueType}

Incident Description:
${description}

Task (Strict instruction):

1. Check the details , "Incident Type", "Incident Desciption" and "Incident Proof (image)" Check that incident type matches with incident proof (image) or not. If not then mark "Invalid - incident type and proof mismatched."

2. If there is no Incident Description or any random value is entered but incident type and proof matches then mark as "Valid - incident type and proof matches."

3. Conclusion: Decide whether this incident is realistic and valid.

4. Respond only with JSON:
{
  "isValid": true | false,
  "confidence" : number (0-100)(how much you are sure about your decision),
  "reason": "short explanation as given above"
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: photoUrl // if base64 → remove header part
                  }
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text;

    res.status(200).json({ result: text });
  } catch (err) {
    res.status(500).json({ error: 'Gemini verification failed' });
  }
}