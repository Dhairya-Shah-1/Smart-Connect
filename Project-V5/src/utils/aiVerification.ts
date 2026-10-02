// aiVerification.ts
//
// Smart-Connect AI verification.
//
// These helpers used to call the Vercel `/api/verify-incident` (Gemini)
// endpoint. They now run the project's own ONNX incident model (Render
// /predict) and persist the verdict into `incident_reports.ai_interpretation`
// so the reports view, the map popup and the history tab all read one
// consistent answer.

import { supabase } from '../components/supabaseClient';
import { reviewReportWithAI } from './aiReview';

/**
 * Review a single incident with the ONNX model.
 * @param reportId - The report ID to review
 */
export async function verifySingleIncident(reportId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const { data: report, error } = await supabase
      .from('incident_reports_view')
      // Select * on purpose: a hard-coded column list broke this flow once
      // (the view has no `incident_url` -> PostgREST 400 -> no AI review).
      .select('*')
      .eq('report_id', reportId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!report) {
      return { success: false, error: `Report ${reportId} was not found.` };
    }

    const result = await reviewReportWithAI({
      reportId,
      photoUrl: report.photo_url || null,
      incidentType: report.incident_type || '',
    });

    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Network error' };
  }
}

/** Report statuses the login-time backfill considers "still open". */
const DEFAULT_REVIEW_STATUSES = ['pending', 'in-progress'];

export interface UnprocessedReportFilter {
  /** Statuses to look at. Defaults to pending + in-progress. */
  statuses?: string[];
}

/** Build the PostgREST `or` expression for a list of statuses. */
function statusOrExpression(statuses: string[]): string {
  return statuses.map((status) => `status.eq.${status}`).join(',');
}

/**
 * Review every report whose ai_interpretation is still NULL or an empty string
 * (the login-time backfill).
 *
 * `options.statuses` narrows the scan: the admin / super admin login flow only
 * looks at 'pending' reports, while the user dashboard keeps the wider
 * pending + in-progress default.
 */
export async function processAllUnprocessedReports(
  options: UnprocessedReportFilter = {}
): Promise<{
  success: boolean;
  processed?: number;
  failed?: number;
  errors?: string[];
  error?: string;
}> {
  const statuses =
    options.statuses && options.statuses.length > 0
      ? options.statuses
      : DEFAULT_REVIEW_STATUSES;

  try {
    const { data, error } = await supabase
      .from('incident_reports_view')
      // Select * - see the note in verifySingleIncident: hard-coded column
      // lists against this view return 400 when the view changes.
      .select('*')
      .or(statusOrExpression(statuses))
      .order('timestamp', { ascending: true })
      .limit(50);

    if (error) return { success: false, error: error.message };

    // Rows that are still NULL or empty have never been reviewed.
    const unprocessed = (data || []).filter(
      (row: any) => !row.ai_interpretation || !String(row.ai_interpretation).trim()
    );

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of unprocessed) {
      const result = await reviewReportWithAI({
        reportId: row.report_id,
        photoUrl: row.photo_url || null,
        incidentType: row.incident_type || '',
      });

      if (result.success) {
        processed += 1;
      } else {
        failed += 1;
        errors.push(`${row.report_id}: ${result.error}`);
      }
    }

    return { success: true, processed, failed, errors };
  } catch (error: any) {
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Requirement (admin / super admin login): look at the reports whose
 * `ai_interpretation` column is still NULL / empty, keep the ones whose status
 * is still 'pending', send each one to the ONNX model and write the answer back
 * into that report's `ai_interpretation` column.
 *
 * This is the pending-only subset of {@link processAllUnprocessedReports}, so
 * already work-in-progress rows are left alone.
 */
export async function processPendingUnreviewedReports() {
  return processAllUnprocessedReports({ statuses: ['pending'] });
}

/**
 * Get count of reports pending AI review (ai_interpretation NULL or '').
 *
 * Pass `options.statuses` to narrow the count the same way
 * {@link processAllUnprocessedReports} does (the admin login flow counts
 * 'pending' only).
 */
export async function getUnprocessedReportsCount(
  client: any,
  options: UnprocessedReportFilter = {}
): Promise<number> {
  try {
    const statuses =
      options.statuses && options.statuses.length > 0
        ? options.statuses
        : DEFAULT_REVIEW_STATUSES;
    const statusFilter = statusOrExpression(statuses);

    const [nullRes, emptyRes] = await Promise.all([
      client
        .from('incident_reports')
        .select('*', { count: 'exact', head: true })
        .or(statusFilter)
        .is('ai_interpretation', null),
      client
        .from('incident_reports')
        .select('*', { count: 'exact', head: true })
        .or(statusFilter)
        .eq('ai_interpretation', ''),
    ]);

    if (nullRes.error) {
      console.error('Error getting unprocessed count:', nullRes.error);
      return 0;
    }
    if (emptyRes.error) {
      console.error('Error getting unprocessed count:', emptyRes.error);
      return nullRes.count || 0;
    }

    return (nullRes.count || 0) + (emptyRes.count || 0);
  } catch (error) {
    console.error('Error getting unprocessed count:', error);
    return 0;
  }
}