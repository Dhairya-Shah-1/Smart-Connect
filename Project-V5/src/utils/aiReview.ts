import { supabase } from '../components/supabaseClient';
import { classifyIncidentImage, IncidentPrediction } from './incidentClassifier';

/**
 * Smart-Connect ONNX verdict engine.
 *
 * Turns the YOLO detections from the Render /predict endpoint into a single
 * human-readable interpretation persisted in `incident_reports.ai_interpretation`,
 * plus a verdict that drives the report status:
 *
 *   - auto-approved -> status 'in-progress'  (shows under Verified Reports)
 *   - auto-rejected -> status 'rejected'     (shows under AI rejected)
 *   - manual review -> status unchanged      (stays under Check Reports)
 *
 * Thresholds are conservative: anything the model cannot confidently tie to
 * the reported incident type goes to a human, and any image the model cannot
 * read at all is rejected as fake or unrecognizable.
 */

export type AiVerdict = 'approved' | 'rejected' | 'manual' | 'none';

export interface AiInterpretation {
  text: string;
  verdict: Exclude<AiVerdict, 'none'>;
  /** New status for the report, or null to leave the status unchanged. */
  status: 'in-progress' | 'rejected' | null;
}

/** Confidence needed to confirm or reject without a human. */
const CONFIRM_CONFIDENCE = 0.65;
/** Below this the model has effectively found nothing usable. */
const MIN_USEFUL_CONFIDENCE = 0.45;
/** Many mid-confidence boxes = classic YOLO hallucination on noise. */
const JUNK_DETECTION_COUNT = 8;
/**
 * 3+ DIFFERENT labels all in the unsure band means the model is guessing -
 * the classic signature of a random / non-incident image (every class hovers
 * around the 50% coin-flip).
 */
const JUNK_LABEL_COMPETITION = 3;
/** Label competition only counts when the best label is below this. */
const JUNK_SOUP_MAX_CONF = 0.60;

/** Model labels (normalised) that count as a match for each report type. */
const MATCH_GROUPS: Record<string, string[]> = {
  pothole: ['pothole'],
  garbage: ['garbage'],
  flood: ['flood', 'waterlogging'],
  waterleakage: ['waterlogging', 'flood'],
  accident: ['accident'],
  landslide: ['landslide'],
  fire: ['fire'],
};

const normalize = (value: string): string =>
  (value || '').toLowerCase().replace(/[^a-z]/g, '');

function matchesIncidentType(label: string, incidentType: string): boolean {
  const normalizedType = normalize(incidentType);
  const normalizedLabel = normalize(label);
  const group = MATCH_GROUPS[normalizedType];
  if (group) return group.includes(normalizedLabel);
  return normalizedLabel === normalizedType;
}

/**
 * Collapse duplicate detections: one entry per label keeping the highest
 * confidence, sorted high -> low. This stops the popup from listing dozens of
 * stacked boxes when the model fires on every anchor.
 */
export function summarizePredictions(
  predictions: IncidentPrediction[]
): IncidentPrediction[] {
  const byLabel = new Map<string, IncidentPrediction>();
  for (const prediction of predictions || []) {
    const existing = byLabel.get(prediction.label);
    if (!existing || prediction.confidence > existing.confidence) {
      byLabel.set(prediction.label, prediction);
    }
  }
  return Array.from(byLabel.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * True when detections look like model noise rather than a real incident:
 * nothing found, everything weak, a spray of boxes, or several DIFFERENT
 * incident types all hovering in the unsure band.
 */
export function isJunkDetection(predictions: IncidentPrediction[]): boolean {
  const summary = summarizePredictions(predictions);
  const top = summary[0];
  if (!top) return true;
  if (top.confidence < MIN_USEFUL_CONFIDENCE) return true;
  if (
    predictions.length >= JUNK_DETECTION_COUNT &&
    top.confidence < CONFIRM_CONFIDENCE
  ) {
    return true;
  }
  if (
    summary.length >= JUNK_LABEL_COMPETITION &&
    top.confidence < JUNK_SOUP_MAX_CONF
  ) {
    return true;
  }
  return false;
}

/**
 * Decide the verdict for one report from its detections.
 *
 * Rules (in order):
 *  1. No detections / max confidence < 45% / a spray of >=8 mid-confidence
 *     boxes -> the image is fake or unrecognizable -> auto-rejected.
 *  2. Accident reports always go to a human, however confident the model is.
 *  3. Top label matches the reported type at >= 65% -> auto-approved.
 *  4. Top label confidently shows a DIFFERENT incident (>= 65%) -> auto-rejected.
 *  5. Everything else ("the model is a bit confused") -> manual review.
 */
export function buildInterpretation(
  predictions: IncidentPrediction[],
  incidentType: string
): AiInterpretation {
  const summary = summarizePredictions(predictions);
  const top = summary[0];
  const topConfidence = top?.confidence ?? 0;
  const percent = Math.round(topConfidence * 100);

  const isJunk = isJunkDetection(predictions);

  if (isJunk) {
    return {
      verdict: 'rejected',
      status: 'rejected',
      text: `The image is fake or unrecognizable - no supported incident could be confirmed (highest ${percent}% confidence).\nVerdict: auto-rejected.`,
    };
  }

  const isAccident = normalize(incidentType) === 'accident';

  if (isAccident) {
    return {
      verdict: 'manual',
      status: null,
      text: `Accident reports always need a human decision: ${top.label} detected at ${percent}% confidence. Manual review required. Verdict: manual review required.`,
    };
  }

  const isMatch = matchesIncidentType(top.label, incidentType);

  if (isMatch && topConfidence >= CONFIRM_CONFIDENCE) {
    return {
      verdict: 'approved',
      status: 'in-progress',
      text: `${top.label} confirmed at ${percent}% confidence. Verdict: auto-approved.`,
    };
  }

  if (!isMatch && topConfidence >= CONFIRM_CONFIDENCE) {
    return {
      verdict: 'rejected',
      status: 'rejected',
      text: `The image shows ${top.label} (${percent}% confidence), which does not match the reported ${incidentType}. Verdict: auto-rejected.`,
    };
  }

  return {
    verdict: 'manual',
    status: null,
    text: `The model is unsure: detected ${top.label} at ${percent}% confidence for the reported ${incidentType}. Manual review required. Verdict: manual review required.`,
  };
}

/**
 * Read a verdict back out of a stored ai_interpretation string.
 * Handles the new "Verdict: ..." markers as well as the legacy Gemini texts
 * ("Potentially Real" / "Potentially Fake" / "...% real").
 */
export function parseAiVerdict(text: string | null | undefined): AiVerdict {
  if (!text || !text.trim()) return 'none';

  const lower = text.toLowerCase();
  if (
    lower.includes('verdict: auto-rejected') ||
    lower.includes('potentially fake') ||
    lower.includes('fake')
  ) {
    return 'rejected';
  }
  if (lower.includes('manual review required')) return 'manual';
  // Everything else (incl. "Verdict: auto-approved", "Potentially Real" and
  // legacy "AI has interpreted: 85% real") counts as approved - same
  // behaviour the old `!text.includes('fake')` heuristic had.
  return 'approved';
}

/** Extract "87%" from interpretation texts like "... at 87% confidence ...". */
export function parseAiConfidence(
  text: string | null | undefined
): number | undefined {
  const match = text?.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i);
  return match ? Number(match[1]) / 100 : undefined;
}

export interface AiReviewTarget {
  reportId: string;
  photoUrl?: string | null;
  incidentType: string;
}

export interface AiReviewData {
  interpretation: string;
  verdict: Exclude<AiVerdict, 'none'>;
  status?: 'in-progress' | 'rejected';
}

/**
 * Run the ONNX model over a report image and persist the result into
 * `incident_reports.ai_interpretation` (plus the verdict status when the
 * model is sure enough to decide on its own).
 */
export async function reviewReportWithAI(
  target: AiReviewTarget
): Promise<{ success: boolean; data?: AiReviewData; error?: string }> {
  try {
    let interpretation: AiInterpretation;

    if (!target.photoUrl) {
      // No image to look at - a human has to decide.
      interpretation = {
        verdict: 'manual',
        status: null,
        text: 'No incident image is available for the model to review. Manual review required. Verdict: manual review required.',
      };
    } else {
      const predictions = await classifyIncidentImage(target.photoUrl);
      interpretation = buildInterpretation(predictions, target.incidentType);
    }

    const payload: Record<string, unknown> = {
      ai_interpretation: interpretation.text,
    };
    if (interpretation.status) payload.status = interpretation.status;

    const { error: updateError } = await supabase
      .from('incident_reports')
      .update(payload)
      .eq('report_id', target.reportId);

    if (updateError && interpretation.status) {
      // Row-level security may block status changes for this role; the
      // interpretation is the important part, so retry without the status.
      console.warn(
        'Could not apply AI verdict status, saving interpretation only:',
        updateError.message
      );
      const { error: retryError } = await supabase
        .from('incident_reports')
        .update({ ai_interpretation: interpretation.text })
        .eq('report_id', target.reportId);
      if (retryError) throw new Error(retryError.message);
    } else if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      success: true,
      data: {
        interpretation: interpretation.text,
        verdict: interpretation.verdict,
        ...(interpretation.status ? { status: interpretation.status } : {}),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Smart-Connect AI review failed.',
    };
  }
}

/**
 * Persist an AI review as plain text into `incident_reports.ai_interpretation`.
 *
 * The text is exactly the human-readable interpretation produced by
 * {@link buildInterpretation} - no detection label lists and no
 * "Run AI review:" prefix - so every consumer of the column (map popup,
 * CheckReports, ReportHistory, parseAiVerdict) reads one consistent format.
 * A rejected image therefore reads simply:
 *   "The image is fake or unrecognizable - no supported incident could be
 *    confirmed (highest 50% confidence).\nVerdict: auto-rejected."
 *
 * The report status is intentionally NOT touched here: the automatic
 * upload/login flows own the status transitions.
 *
 * NOTE: currently unused - the manual "Run AI review" button was removed from
 * the admin Map tab, so the upload/login flows in {@link reviewReportWithAI}
 * are the only writers of the column. Kept so the button can be re-enabled.
 */
export async function saveAiReviewToReport(
  reportId: string,
  predictions: IncidentPrediction[],
  incidentType: string
): Promise<{ success: boolean; text: string; error?: string }> {
  const text = buildInterpretation(predictions, incidentType).text;

  try {
    const { error } = await supabase
      .from('incident_reports')
      .update({ ai_interpretation: text })
      .eq('report_id', reportId);

    if (error) return { success: false, text, error: error.message };
    return { success: true, text };
  } catch (err: any) {
    return { success: false, text, error: err?.message || 'Network error' };
  }
}
