// Utility functions for incident analysis with the deployed Smart Connect model.

const MODEL_API_URL = 'https://smartconnect-api.onrender.com/predict';

type ModelPrediction = {
  label: string;
  confidence: number;
};

export type ModelProgress = 'sending' | 'received' | 'processing' | 'completed' | 'failed';

type AnalysisResult = {
  success: boolean;
  data?: { ai_interpretation: string; confidence_percent: number; detected_label: string };
  error?: string;
};

async function readJsonResponse(response: Response): Promise<{ data?: any; error?: string }> {
  const body = await response.text();
  if (!body.trim()) {
    return { error: `The analysis service returned an empty response (HTTP ${response.status}).` };
  }

  try {
    return { data: JSON.parse(body) };
  } catch {
    return { error: `The analysis service returned an invalid response (HTTP ${response.status}).` };
  }
}

function formatAnalysisResult(modelData: any): AnalysisResult {
  const predictions = modelData?.predictions as ModelPrediction[] | undefined;
  if (!modelData?.success || !Array.isArray(predictions)) {
    return { success: false, error: 'The model returned an invalid prediction response.' };
  }

  const bestPrediction = predictions.reduce<ModelPrediction | undefined>(
      (best, prediction) => !best || prediction.confidence > best.confidence ? prediction : best,
      undefined,
  );
  const confidencePercent = bestPrediction
    ? Math.round(Math.max(0, Math.min(1, bestPrediction.confidence)) * 100)
    : 0;
  const label = bestPrediction?.label || 'No supported incident detected';
  const interpretation = bestPrediction
    ? `Model confidence: ${confidencePercent}% | Detected: ${label}`
    : 'Model confidence: 0% | No supported incident was detected in the evidence image.';

  return {
    success: true,
    data: { ai_interpretation: interpretation, confidence_percent: confidencePercent, detected_label: label },
  };
}

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

/**
 * Shows true model progress when the Render deployment includes the job routes.
 * It falls back to the original endpoint whenever the job routes are missing
 * from an older deployment or failing (e.g. HTTP 500 on a stale build).
 */
export async function analyzeIncidentImage(
  file: File,
  onProgress?: (progress: ModelProgress) => void,
): Promise<AnalysisResult> {
  try {
    onProgress?.('sending');
    const formData = new FormData();
    formData.append('file', file, file.name);
    const jobResponse = await fetch(`${MODEL_API_URL}/jobs`, { method: 'POST', body: formData });

    // Older Render deployments do not expose the job endpoint, and a stale
    // deployment can fail it outright (e.g. HTTP 500). Any job-route failure
    // must fall back to the original blocking endpoint so analysis still works.
    if (!jobResponse.ok) {
      onProgress?.('processing');
      const response = await fetch(MODEL_API_URL, { method: 'POST', body: formData });
      const parsed = await readJsonResponse(response);
      if (!response.ok || parsed.error) {
        onProgress?.('failed');
        return { success: false, error: parsed.error || `Model analysis failed (HTTP ${response.status}).` };
      }
      onProgress?.('completed');
      return formatAnalysisResult(parsed.data);
    }

    const jobParsed = await readJsonResponse(jobResponse);
    if (jobParsed.error || !jobParsed.data?.job_id) {
      return { success: false, error: jobParsed.error || 'The model did not accept the image.' };
    }

    onProgress?.('received');
    let consecutivePollFailures = 0;
    for (let attempt = 0; attempt < 120; attempt++) {
      await wait(1000);

      let statusResponse: Response;
      try {
        statusResponse = await fetch(`${MODEL_API_URL}/jobs/${jobParsed.data.job_id}`);
      } catch {
        // Free Render instances can restart between polls; tolerate short gaps.
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= 10) throw new Error('Lost contact with the model service.');
        continue;
      }
      const statusParsed = await readJsonResponse(statusResponse);
      if (statusParsed.error || statusParsed.data?.status === 'not_found') {
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= 10) {
          onProgress?.('failed');
          return { success: false, error: statusParsed.error || 'The model lost this analysis job.' };
        }
        continue;
      }
      consecutivePollFailures = 0;

      if (statusParsed.data.status === 'received') onProgress?.('received');
      if (statusParsed.data.status === 'processing') onProgress?.('processing');
      if (statusParsed.data.status === 'failed') {
        onProgress?.('failed');
        return { success: false, error: statusParsed.data.error || 'Model processing failed.' };
      }
      if (statusParsed.data.status === 'completed') {
        onProgress?.('completed');
        return formatAnalysisResult(statusParsed.data);
      }
    }

    onProgress?.('failed');
    return { success: false, error: 'Model processing timed out. Please try again later.' };
  } catch (error: any) {
    onProgress?.('failed');
    return { success: false, error: error.message || 'Could not reach the deployed model.' };
  }
}

/**
 * Process a single incident with the deployed image-analysis model.
 * @param reportId - The report ID to verify
 * @returns Promise with verification results
 */
export async function verifySingleIncident(reportId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    // Call the Edge Function
    const response = await fetch('/api/verify-incident', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reportId }),
    });

    const parsed = await readJsonResponse(response);
    if (parsed.error) return { success: false, error: parsed.error };
    const result = parsed.data;

    if (!response.ok) {
      return { success: false, error: result.error || 'Verification failed' };
    }

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Process all pending/in-progress reports that don't have AI interpretation yet
 * @returns Promise with batch processing results
 */
export async function processAllUnprocessedReports(): Promise<{
  success: boolean;
  processed?: number;
  failed?: number;
  errors?: string[];
  error?: string;
}> {
  try {
    // Call the Edge Function with processAll flag
    const response = await fetch('/api/verify-incident', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ processAll: true }),
    });

    const parsed = await readJsonResponse(response);
    if (parsed.error) return { success: false, error: parsed.error };
    const result = parsed.data;

    if (!response.ok) {
      return { success: false, error: result.error || 'Batch processing failed' };
    }

    return {
      success: true,
      processed: result.processed,
      failed: result.failed,
      errors: result.errors,
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Get count of reports pending AI verification
 * @param supabase - Supabase client instance
 * @returns Promise with count of unprocessed reports
 */
export async function getUnprocessedReportsCount(supabase: any): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('incident_reports')
      .select('*', { count: 'exact', head: true })
      .or('status.eq.pending,status.eq.in-progress')
      .is('ai_interpretation', null);

    if (error) {
      console.error('Error getting unprocessed count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error getting unprocessed count:', error);
    return 0;
  }
}
