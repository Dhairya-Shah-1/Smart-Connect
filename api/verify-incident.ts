// api/verify-incident.ts
/// <reference types="./deno.d.ts" />

import { createClient } from '@supabase/supabase-js';

const MODEL_API_URL = 'https://smartconnect-api.onrender.com/predict';

function readServerEnv(key: string): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (processValue) return processValue;
  try { return Deno.env.get(key); } catch { return undefined; }
}

function getRequiredServerEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = readServerEnv(key);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(', ')}`);
}

const supabase = createClient(
  getRequiredServerEnv('SUPABASE_URL', 'VITE_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
);

interface IncidentData {
  report_id: string;
  incident_type: string;
  incident_description: string;
  timestamp: string;
  lon: number;
  lat: number;
  incident_url: string;
}

interface Prediction { class_id: number; label: string; confidence: number; bbox: number[]; }
interface ModelResponse { success: boolean; predictions: Prediction[]; }
interface ModelAnalysis { label: string; confidence: number; confidencePercent: number; interpretation: string; }

function getFileName(contentType: string | null): string {
  const extension = contentType?.split('/')[1]?.split(';')[0] || 'jpg';
  return `incident.${extension === 'jpeg' ? 'jpg' : extension}`;
}

/** Sends the stored evidence photo to the deployed YOLO model and returns only its score. */
async function analyzeIncidentImage(incident: IncidentData): Promise<ModelAnalysis> {
  if (!incident.incident_url) throw new Error('This report has no evidence image to analyse.');

  const imageResponse = await fetch(incident.incident_url);
  if (!imageResponse.ok) throw new Error(`Could not download the incident image (HTTP ${imageResponse.status}).`);

  const imageType = imageResponse.headers.get('content-type') || 'image/jpeg';
  if (!imageType.startsWith('image/')) throw new Error('The report attachment is not an image.');

  const imageBlob = new Blob([await imageResponse.arrayBuffer()], { type: imageType });
  const formData = new FormData();
  // The deployed FastAPI endpoint requires this exact multipart field name.
  formData.append('file', imageBlob, getFileName(imageType));

  const modelResponse = await fetch(MODEL_API_URL, { method: 'POST', body: formData });
  if (!modelResponse.ok) throw new Error(`Model analysis failed (HTTP ${modelResponse.status}).`);

  const modelData = await modelResponse.json() as ModelResponse;
  if (!modelData.success || !Array.isArray(modelData.predictions)) {
    throw new Error('The model returned an invalid response.');
  }

  const bestPrediction = modelData.predictions.reduce<Prediction | undefined>(
    (best, prediction) => !best || prediction.confidence > best.confidence ? prediction : best,
    undefined,
  );

  if (!bestPrediction) {
    return {
      label: 'No supported incident detected', confidence: 0, confidencePercent: 0,
      interpretation: 'Model confidence: 0% | No supported incident was detected in the evidence image.',
    };
  }

  const confidencePercent = Math.round(Math.max(0, Math.min(1, bestPrediction.confidence)) * 100);
  return {
    label: bestPrediction.label,
    confidence: bestPrediction.confidence,
    confidencePercent,
    interpretation: `Model confidence: ${confidencePercent}% | Detected: ${bestPrediction.label}`,
  };
}

async function saveAnalysis(reportId: string, analysis: ModelAnalysis): Promise<void> {
  const { error } = await supabase.from('incident_reports')
    .update({ ai_interpretation: analysis.interpretation }).eq('report_id', reportId);
  if (error) throw new Error(`Failed to save model analysis: ${error.message}`);
}

async function processAllUnprocessedReports(): Promise<{ processed: number; failed: number; errors: string[] }> {
  const { data: reports, error } = await supabase.from('incident_reports_view')
    .select('report_id, incident_type, incident_description, timestamp, lon, lat, incident_url')
    .or('status.eq.pending,status.eq.in-progress').is('ai_interpretation', null);
  if (error) throw new Error(`Failed to fetch reports: ${error.message}`);

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const report of reports || []) {
    try {
      const incident = report as IncidentData;
      await saveAnalysis(incident.report_id, await analyzeIncidentImage(incident));
      processed++;
    } catch (error: any) {
      failed++;
      errors.push(`Error processing ${report.report_id}: ${error.message || 'Unknown error'}`);
    }
  }
  return { processed, failed, errors };
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { reportId, processAll } = await req.json() as { reportId?: string; processAll?: boolean };
    if (processAll) {
      const result = await processAllUnprocessedReports();
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!reportId) throw new Error('Missing required field: reportId');

    const { data: incident, error } = await supabase.from('incident_reports_view')
      .select('report_id, incident_type, incident_description, timestamp, lon, lat, incident_url')
      .eq('report_id', reportId).single();
    if (error || !incident) {
      return new Response(JSON.stringify({ error: 'Incident not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const analysis = await analyzeIncidentImage(incident as IncidentData);
    await saveAnalysis(reportId, analysis);
    // The image is intentionally not returned. The client receives only model metadata.
    return new Response(JSON.stringify({
      success: true, report_id: reportId, detected_label: analysis.label,
      confidence: analysis.confidence, confidence_percent: analysis.confidencePercent,
      ai_interpretation: analysis.interpretation,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Model analysis failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
