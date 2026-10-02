import { env } from '../config/env';

export interface IncidentPrediction {
  class_id: number;
  label: string;
  confidence: number;
  bbox: number[];
}

interface PredictionResponse {
  success?: boolean;
  predictions?: IncidentPrediction[];
  detail?: string;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 120_000;

const getClassifierUrl = () => {
  const configuredUrl = env.incidentAiUrl?.trim();
  if (!configuredUrl) {
    throw new Error('Incident AI is not configured. Add VITE_INCIDENT_AI_URL to your local .env and Vercel environment variables, then restart/redeploy.');
  }

  return `${configuredUrl.replace(/\/$/, '')}/predict`;
};

export async function classifyIncidentImage(imageUrl: string): Promise<IncidentPrediction[]> {
  if (!imageUrl) throw new Error('This incident has no image for AI classification.');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let imageResponse: Response;
    try {
      imageResponse = await fetch(imageUrl, { signal: controller.signal });
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('The incident image request timed out.');
      throw new Error('The incident image could not be read. Check Supabase Storage public access/CORS.');
    }

    if (!imageResponse.ok) {
      throw new Error(`The incident image returned HTTP ${imageResponse.status}.`);
    }

    const imageBlob = await imageResponse.blob();
    const formData = new FormData();
    formData.append('file', imageBlob, 'incident-image.jpg');
    const classifierUrl = getClassifierUrl();

    let predictionResponse: Response;
    try {
      predictionResponse = await fetch(classifierUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('Render AI timed out after 120 seconds (the Render free tier cold start can take 30-60 seconds).');
      throw new Error('Render AI could not be reached. Verify VITE_INCIDENT_AI_URL and the backend CORS settings.');
    }

    const responseText = await predictionResponse.text();
    let payload: PredictionResponse = {};
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      // Render returns an empty body with HTTP 502 when the Uvicorn worker
      // is killed (OOM on the free tier). There is no JSON to parse and,
      // because the proxy generates the response, CORS headers are missing.
      if (predictionResponse.status === 502) {
        throw new Error(
          'Render AI returned HTTP 502 (Bad Gateway): the backend worker crashed while running inference, usually out-of-memory on the free tier. Check Render Logs for "Killed"/"Out of memory", then retry, downscale the image, or upgrade the plan.'
        );
      }
      const preview = responseText.slice(0, 200);
      throw new Error(
        `Render AI returned a non-JSON response (HTTP ${predictionResponse.status})${preview ? `: ${preview}` : '.'}`
      );
    }

    if (!predictionResponse.ok) {
      if (predictionResponse.status === 502) {
        throw new Error(
          payload.detail ||
            payload.error ||
            'Render AI returned HTTP 502 (Bad Gateway): the backend worker crashed during inference (likely OOM). See Render Logs.'
        );
      }
      throw new Error(payload.detail || payload.error || `Render AI returned HTTP ${predictionResponse.status}.`);
    }

    if (!Array.isArray(payload.predictions)) {
      throw new Error('Render AI response is missing the predictions array.');
    }

    return payload.predictions;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
