// Utility functions for AI verification with Gemini

/**
 * Process a single incident with Gemini AI
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

    const result = await response.json();

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

    const result = await response.json();

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
