// Local /api routes for `npm run dev`.
// In production these are Vercel serverless functions (see the api/ folder).
// The Vite dev server has no serverless runtime, so this plugin serves the
// same request/response contracts from middleware and keeps the
// report -> evidence upload -> model analysis chain fully working locally.

import { loadEnv, type Plugin } from 'vite';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'http';

type MultipartPart = { name: string; filename: string | null; type: string | null; data: Buffer };

/** Minimal multipart/form-data parser; no extra dependencies needed. */
function parseMultipart(buffer: Buffer, contentType: string): MultipartPart[] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) return [];
  const boundary = `--${(boundaryMatch[1] || boundaryMatch[2]).trim()}`;
  const boundaryBuffer = Buffer.from(boundary);
  const parts: MultipartPart[] = [];
  let start = buffer.indexOf(boundaryBuffer);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (next === -1) break;
    const segment = buffer.subarray(start + boundaryBuffer.length, next);
    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = segment.subarray(0, headerEnd).toString('utf8');
      const body = segment.subarray(headerEnd + 4);
      const disposition = /content-disposition:[^\n]*/i.exec(headerText)?.[0] || '';
      const name = /name="([^"]*)"/i.exec(disposition)?.[1] || '';
      const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] || null;
      const type = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || null;
      // The multipart body ends with CRLF right before the next boundary.
      parts.push({ name, filename, type, data: body.subarray(0, Math.max(0, body.length - 2)) });
    }
    start = next;
  }
  return parts;
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

interface EvidenceIncident {
  report_id: string;
  incident_url: string;
}

interface ModelAnalysis {
  label: string;
  confidence: number;
  confidencePercent: number;
  interpretation: string;
}

/**
 * Mirrors api/upload-evidence.ts: validates the caller's session, then stores
 * the evidence image in the incident-images bucket with server-only
 * credentials so Storage RLS cannot reject a legitimate normal-user report.
 */
async function handleUploadEvidence(
  req: IncomingMessage,
  res: ServerResponse,
  authClient: any,
  adminClient: any,
): Promise<void> {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Your login session is missing. Please sign in again.');

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) throw new Error('Your login session has expired. Please sign in again.');

    const raw = await readRawBody(req);
    const parts = parseMultipart(raw, String(req.headers['content-type'] || ''));
    const filePart = parts.find((part) => part.name === 'file');
    if (!filePart || !filePart.type?.startsWith('image/')) throw new Error('Please provide an image file.');
    if (filePart.data.length > 10 * 1024 * 1024) throw new Error('Image must be 10 MB or smaller.');

    const safeName = (filePart.filename || 'evidence-image').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `reports/${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await adminClient.storage
      .from('incident-images')
      .upload(path, new Blob([filePart.data], { type: filePart.type }), {
        cacheControl: '3600',
        upsert: false,
        contentType: filePart.type,
      });
    if (uploadError) throw new Error(`Evidence upload failed: ${uploadError.message}`);

    const { data } = adminClient.storage.from('incident-images').getPublicUrl(path);
    sendJson(res, 200, { success: true, publicUrl: data.publicUrl });
  } catch (error: any) {
    sendJson(res, 400, { error: error.message || 'Evidence upload failed' });
  }
}

/** Mirrors api/verify-incident.ts: evidence photo in, deployed-model score out. */
async function analyzeIncidentImage(incident: EvidenceIncident): Promise<ModelAnalysis> {
  const MODEL_API_URL = 'https://smartconnect-api.onrender.com/predict';
  if (!incident.incident_url) throw new Error('This report has no evidence image to analyse.');

  const imageResponse = await fetch(incident.incident_url);
  if (!imageResponse.ok) throw new Error(`Could not download the incident image (HTTP ${imageResponse.status}).`);

  const imageType = imageResponse.headers.get('content-type') || 'image/jpeg';
  if (!imageType.startsWith('image/')) throw new Error('The report attachment is not an image.');

  const imageBlob = new Blob([await imageResponse.arrayBuffer()], { type: imageType });
  const formData = new FormData();
  // The deployed FastAPI endpoint requires this exact multipart field name.
  formData.append('file', imageBlob, getEvidenceFileName(imageType));

  const modelResponse = await fetch(MODEL_API_URL, { method: 'POST', body: formData });
  if (!modelResponse.ok) throw new Error(`Model analysis failed (HTTP ${modelResponse.status}).`);

  const modelData = await modelResponse.json() as { success: boolean; predictions: { label: string; confidence: number }[] };
  if (!modelData.success || !Array.isArray(modelData.predictions)) throw new Error('The model returned an invalid response.');

  const bestPrediction = modelData.predictions.reduce<{ label: string; confidence: number } | undefined>(
    (best, prediction) => !best || prediction.confidence > best.confidence ? prediction : best,
    undefined,
  );

  if (!bestPrediction) {
    return {
      label: 'No supported incident detected',
      confidence: 0,
      confidencePercent: 0,
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

function getEvidenceFileName(contentType: string | null): string {
  const extension = contentType?.split('/')[1]?.split(';')[0] || 'jpg';
  return `incident.${extension === 'jpeg' ? 'jpg' : extension}`;
}

/**
 * Mirrors api/verify-incident.ts: verifies one report, or every pending report
 * when { processAll: true } is posted, and saves the returned interpretation.
 */
async function handleVerifyIncident(
  req: IncomingMessage,
  res: ServerResponse,
  adminClient: any,
): Promise<void> {
  try {
    const raw = await readRawBody(req);
    let reportId: string | undefined;
    let processAll = false;
    try {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      reportId = body.reportId;
      processAll = body.processAll === true;
    } catch {
      throw new Error('Request body must be valid JSON.');
    }

    if (processAll) {
      const { data: reports, error } = await adminClient
        .from('incident_reports_view')
        .select('report_id, incident_url')
        .or('status.eq.pending,status.eq.in-progress')
        .is('ai_interpretation', null);
      if (error) throw new Error(`Failed to fetch reports: ${error.message}`);

      let processed = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const report of reports || []) {
        try {
          const analysis = await analyzeIncidentImage(report as EvidenceIncident);
          const { error: saveError } = await adminClient
            .from('incident_reports')
            .update({ ai_interpretation: analysis.interpretation })
            .eq('report_id', (report as EvidenceIncident).report_id);
          if (saveError) throw saveError;
          processed += 1;
        } catch (reportError: any) {
          failed += 1;
          errors.push(`Error processing ${(report as EvidenceIncident).report_id}: ${reportError.message || 'Unknown error'}`);
        }
      }
      sendJson(res, 200, { success: true, processed, failed, errors });
      return;
    }

    if (!reportId) throw new Error('Missing required field: reportId');

    const { data: incident, error } = await adminClient
      .from('incident_reports_view')
      .select('report_id, incident_type, incident_description, timestamp, lon, lat, incident_url')
      .eq('report_id', reportId)
      .single();
    if (error || !incident) {
      sendJson(res, 404, { error: 'Incident not found' });
      return;
    }

    const analysis = await analyzeIncidentImage(incident as EvidenceIncident);
    const { error: saveError } = await adminClient
      .from('incident_reports')
      .update({ ai_interpretation: analysis.interpretation })
      .eq('report_id', reportId);
    if (saveError) throw new Error(`Failed to save model analysis: ${saveError.message}`);

    sendJson(res, 200, {
      success: true,
      report_id: reportId,
      detected_label: analysis.label,
      confidence: analysis.confidence,
      confidence_percent: analysis.confidencePercent,
      ai_interpretation: analysis.interpretation,
    });
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Model analysis failed' });
  }
}

export function devApiPlugin(mode: string): Plugin {
  // Load every .env key (not only VITE_*) so server-only variables work too.
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || anonKey;

  const authClient = supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    : null;
  const adminClient = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

  const missingClientError = () =>
    new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to use the local API routes.');

  return {
    name: 'smart-connect-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/api/upload-evidence' && url !== '/api/verify-incident') {
          next();
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          if (!authClient || !adminClient) throw missingClientError();
          if (url === '/api/upload-evidence') await handleUploadEvidence(req, res, authClient, adminClient);
          else await handleVerifyIncident(req, res, adminClient);
        } catch (error: any) {
          sendJson(res, 500, { error: error.message || 'Local API error' });
        }
      });
    },
  };
}


