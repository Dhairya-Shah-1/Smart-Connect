// api/verify-incident.ts
/// <reference types="./deno.d.ts" />

import { createClient } from '@supabase/supabase-js';

function readServerEnv(key: string): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (processValue) {
    return processValue;
  }

  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

function getRequiredServerEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = readServerEnv(key);
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(', ')}`);
}

// Supabase client for database access
const supabaseUrl = getRequiredServerEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseKey = getRequiredServerEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

type GeminiResult = {
  verified: boolean;
  confidence: number;
  reason: string;
};

interface IncidentData {
  report_id: string;
  incident_type: string;
  incident_description: string;
  timestamp: string;
  lon: number;
  lat: number;
  incident_url: string;
}

// Helper function to determine AI flag based on confidence
function getAiFlag(verified: boolean, confidence: number): string {
  const confidencePercent = Math.round(confidence * 100);
  
  if (confidencePercent >= 90) {
    if (!verified) {
      return 'Potentially Fake';
    } else {
      return 'Potentially Real';
    }
  } else {
    return `AI has interpreted: ${confidencePercent}% real`;
  }
}

// Verify a single incident with Gemini
async function verifyIncidentWithGemini(incident: IncidentData, geminiApiKey: string): Promise<string> {
  // Fetch the image from the URL to pass to Gemini
  let imageBase64 = '';
  let imageMimeType = 'image/jpeg';

  if (incident.incident_url) {
    try {
      const imageResponse = await fetch(incident.incident_url);
      if (imageResponse.ok) {
        const imageBuffer = await imageResponse.arrayBuffer();
        const imageBytes = new Uint8Array(imageBuffer);
        imageBase64 = btoa(String.fromCharCode.apply(null, Array.from(imageBytes)));
        imageMimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
      }
    } catch (imageError) {
      console.warn('Could not fetch incident image, proceeding without it:', imageError);
    }
  }

  // Build Gemini Prompt with all incident data
  const prompt = `
You are an AI system that verifies civic incident reports.

INCIDENT DATA:
- Report ID: ${incident.report_id}
- Incident Type: ${incident.incident_type}
- Incident Description: ${incident.incident_description}
- Timestamp: ${incident.timestamp}
- Location: Latitude ${incident.lat}, Longitude ${incident.lon}

Additional Instruction:
Check the weather conditions for the given location and assess
whether the reported incident is realistic based on the incident type and description.

Your task:
1. Decide if the incident is REAL or FAKE based on the provided data.
2. Provide a confidence score between 0 and 1.
3. Give a short justification explaining your decision.

Respond ONLY in JSON format:
{
  "verified": true | false,
  "confidence": number,
  "reason": "string"
}
`;

  // Call Gemini API
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  // Add image if available
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64,
      },
    });
  } else {
    // Pass the URL as text context if image fetch failed
    parts.push({
      text: `\nIncident Image URL: ${incident.incident_url || 'Not available'}`,
    });
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: parts,
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    throw new Error(`Gemini API error: ${errText}`);
  }

  const geminiData = await geminiRes.json() as { 
    candidates?: Array<{ 
      content?: { 
        parts?: Array<{ text?: string }> 
      } 
    }> 
  };

  // Parse Gemini Response
  const textResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textResponse) {
    throw new Error('Invalid Gemini response structure');
  }

  let parsed: GeminiResult;

  try {
    // Try to extract JSON from the response (in case there's any wrapping text)
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(textResponse);
    }
  } catch {
    throw new Error('Gemini response is not valid JSON');
  }

  // Validate parsed result
  if (typeof parsed.verified !== 'boolean' || 
      typeof parsed.confidence !== 'number' || 
      typeof parsed.reason !== 'string') {
    throw new Error('Invalid Gemini response format');
  }

  // Generate the interpretation text
  const aiFlag = getAiFlag(parsed.verified, parsed.confidence);
  const confidencePercent = Math.round(parsed.confidence * 100);
  const interpretationText = `${aiFlag} | Confidence: ${confidencePercent}% | ${parsed.reason}`;

  return interpretationText;
}

// Process all pending/in-progress reports without AI interpretation
async function processAllUnprocessedReports(): Promise<{ processed: number; failed: number; errors: string[] }> {
  const geminiApiKey = readServerEnv('GEMINI_API_KEY');
  
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured in Supabase Environment Variables');
  }

  // Fetch all pending and in-progress reports without AI interpretation
  const { data: reports, error: fetchError } = await supabase
    .from('incident_reports_view')
    .select('report_id, incident_type, incident_description, timestamp, lon, lat, incident_url')
    .or('status.eq.pending,status.eq.in-progress')
    .is('ai_interpretation', null);

  if (fetchError) {
    throw new Error(`Failed to fetch reports: ${fetchError.message}`);
  }

  if (!reports || reports.length === 0) {
    return { processed: 0, failed: 0, errors: [] };
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process each report
  for (const report of reports) {
    try {
      const typedIncident = report as IncidentData;
      
      // Verify with Gemini
      const interpretationText = await verifyIncidentWithGemini(typedIncident, geminiApiKey);
      
      // Save to incident_reports table
      const { error: updateError } = await supabase
        .from('incident_reports')
        .update({ ai_interpretation: interpretationText })
        .eq('report_id', report.report_id);

      if (updateError) {
        failed++;
        errors.push(`Failed to update ${report.report_id}: ${updateError.message}`);
      } else {
        processed++;
        console.log(`Processed report ${report.report_id}`);
      }
    } catch (err: any) {
      failed++;
      errors.push(`Error processing ${report.report_id}: ${err.message}`);
      console.error(`Error processing ${report.report_id}:`, err);
    }

    // Add a small delay to avoid hitting Gemini API rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { processed, failed, errors };
}

export default async function handler(req: Request): Promise<Response> {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json() as { reportId?: string; processAll?: boolean };
    const { reportId, processAll } = body;

    // If processAll is true, process all pending/in-progress reports without AI interpretation
    if (processAll === true) {
      const result = await processAllUnprocessedReports();
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Batch processing completed',
        processed: result.processed,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Original single report verification
    if (!reportId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: reportId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -----------------------------
    // 1. Fetch incident from Supabase (using view for display)
    // -----------------------------
    const { data: incident, error: fetchError } = await supabase
      .from('incident_reports_view')
      .select('report_id, incident_type, incident_description, timestamp, lon, lat, incident_url')
      .eq('report_id', reportId)
      .single();

    if (fetchError || !incident) {
      return new Response(
        JSON.stringify({ error: 'Incident not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const typedIncident = incident as IncidentData;

    // -----------------------------
    // 2. Get Gemini API Key from Supabase Environment Variables
    // -----------------------------
    const geminiApiKey = readServerEnv('GEMINI_API_KEY');

    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured in Supabase Environment Variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -----------------------------
    // 3. Verify with Gemini and get interpretation
    // -----------------------------
    const interpretationText = await verifyIncidentWithGemini(typedIncident, geminiApiKey);

    // -----------------------------
    // 4. Save AI interpretation to incident_reports table
    // -----------------------------
    const { error: updateError } = await supabase
      .from('incident_reports')
      .update({ ai_interpretation: interpretationText })
      .eq('report_id', reportId);

    if (updateError) {
      console.error('Failed to save AI interpretation:', updateError);
      // Don't fail the whole request, just log the error
    } else {
      console.log('AI interpretation saved for report:', reportId);
    }

    // -----------------------------
    // 5. Return to frontend with verification results
    // -----------------------------
    // Parse the interpretation text for response
    const confidenceMatch = interpretationText.match(/Confidence: (\d+)%/);
    const confidencePercent = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;
    const isReal = interpretationText.includes('Potentially Real');
    const isFake = interpretationText.includes('Potentially Fake');

    return new Response(JSON.stringify({
      success: true,
      report_id: typedIncident.report_id,
      verified: isReal,
      confidence: confidencePercent / 100,
      confidence_percent: confidencePercent,
      reason: interpretationText,
      ai_flag: isReal ? 'Potentially Real' : isFake ? 'Potentially Fake' : 'AI Interpretation',
      ai_interpretation: interpretationText,
      incident_type: typedIncident.incident_type,
      incident_description: typedIncident.incident_description,
      timestamp: typedIncident.timestamp,
      location: {
        lat: typedIncident.lat,
        lon: typedIncident.lon,
      },
      incident_url: typedIncident.incident_url,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Gemini verification failed:', err);

    return new Response(
      JSON.stringify({
        error: err.message || 'Verification failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
