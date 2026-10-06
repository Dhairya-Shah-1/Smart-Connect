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
 * A reported-type / detected-type mismatch (user filed A, the model
 * confidently sees B) is never auto-rejected: it is kept for admin review so
 * a human can re-categorise instead of losing a genuine report.
 *
 * Thresholds are conservative: anything the model cannot confidently tie to
 * the reported incident type goes to a human, and any image the model cannot
 * read at all is rejected as fake or unrecognizable. Garbage, accident and
 * landslide reports use a lowered 35% bar, because the detector is weaker on
 * those classes (see LOW_CONFIDENCE_TYPES).
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

/**
 * The detector is noticeably weaker on these three incident types, so they run
 * with a lowered confidence bar: 35% instead of the default 45% floor / 65%
 * confirmation.
 *
 * Without this, genuine reports get auto-rejected - the model returns a real
 * Garbage box at ~56% next to a few ~50% noise labels, and the label-soup rule
 * below treated that mix as an unrecognizable image.
 */
export const LOW_CONFIDENCE_TYPES: Record<string, number> = {
  garbage: 0.35,
  accident: 0.35,
  landslide: 0.35,
};

/** Floor used for every report type that has no override above. */
const DEFAULT_CONFIDENCE_FLOOR = MIN_USEFUL_CONFIDENCE;

/**
 * Model labels (normalised) that count as a match for each report type.
 *
 * NOTE: the model only emits the labels below plus 'waterlogging'. Labels the
 * model has never seen (for example a 'water logging' report row) are matched
 * through the RAW label, so a confident Flood box on a Water Logging report is
 * still a MATCH - and conversely a confident wrong-class box on any report is
 * a mismatch that must be kept for human review, never auto-rejected.
 */
const MATCH_GROUPS: Record<string, string[]> = {
  pothole: ['pothole'],
  garbage: ['garbage'],
  flood: ['flood', 'waterlogging'],
  // Report rows are stored as "Water Logging" while the model emits
  // "waterlogging" - match the raw label too but ALSO accept flood (standing
  // water and flood boxes look the same), so a confident Flood box on a Water
  // Logging report stays a MATCH.
  waterlogging: ['waterlogging', 'flood'],
  accident: ['accident'],
  landslide: ['landslide'],
  fire: ['fire'],
};

/** Model labels the detector can actually emit (normalised). */
const KNOWN_MODEL_LABELS = new Set<string>([
  'pothole',
  'garbage',
  'flood',
  'waterlogging',
  'accident',
  'landslide',
  'fire',
]);

const normalize = (value: string): string =>
  (value || '').toLowerCase().replace(/[^a-z]/g, '');

export function matchesIncidentType(label: string, incidentType: string): boolean {
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
 * Lowest confidence that still counts as "the model saw something" for a
 * report type: 35% for garbage / accident / landslide, 45% for the rest.
 */
export function confidenceFloor(incidentType?: string): number {
  const override = incidentType
    ? LOW_CONFIDENCE_TYPES[normalize(incidentType)]
    : undefined;
  return override ?? DEFAULT_CONFIDENCE_FLOOR;
}

/**
 * Confidence needed to accept (or reject) a detection without a human for a
 * report type: 35% for garbage / accident / landslide, 65% for the rest.
 */
export function confirmConfidence(incidentType?: string): number {
  const override = incidentType
    ? LOW_CONFIDENCE_TYPES[normalize(incidentType)]
    : undefined;
  return override ?? CONFIRM_CONFIDENCE;
}

/**
 * True when detections look like model noise rather than a real incident:
 * nothing found, everything below the type's confidence floor, a spray of
 * boxes, or several DIFFERENT incident types all hovering in the unsure band.
 *
 * Passing `incidentType` applies that type's floor and - more importantly -
 * stops the "label soup" rule from rejecting a real detection: when the
 * reported incident is itself detected at or above its floor, the image is
 * accepted even if a few weak ~50% labels ride along. That is what keeps a
 * genuine garbage report detected at 56% from being auto-rejected as
 * unrecognizable.
 */
export function isJunkDetection(
  predictions: IncidentPrediction[],
  incidentType?: string
): boolean {
  const summary = summarizePredictions(predictions);
  const top = summary[0];
  if (!top) return true;

  const floor = confidenceFloor(incidentType);
  if (top.confidence < floor) return true;

  if (
    incidentType &&
    summary.some(
      (prediction) =>
        matchesIncidentType(prediction.label, incidentType) &&
        prediction.confidence >= floor
    )
  ) {
    return false;
  }

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
 *  1. No detections / max confidence below the type's floor (35% for garbage,
 *     accident and landslide, 45% otherwise) / a spray of >=8 mid-confidence
 *     boxes / several competing ~50% labels -> the image is fake or
 *     unrecognizable -> auto-rejected.
 *  2. Accident reports always go to a human, however confident the model is.
 *     The lowered 35% bar above still applies, so an accident image is no
 *     longer rejected as unrecognizable - it says "Manual review required".
 *  3. Top label matches the reported type at >= its confirmation bar (35% for
 *     garbage / accident / landslide, 65% otherwise) -> auto-approved.
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
  // Garbage / accident / landslide run with a lowered 35% bar (see
  // LOW_CONFIDENCE_TYPES); every other type keeps the 45% / 65% defaults.
  const confirmBar = confirmConfidence(incidentType);

  const isJunk = isJunkDetection(predictions, incidentType);

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

  if (isMatch && topConfidence >= confirmBar) {
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

/**
 * Extract the model's predicted incident label from a stored
 * `ai_interpretation` string, or null when the text contains no prediction
 * (AI still pending, "fake / unrecognizable" images, legacy Gemini texts).
 *
 * Handles every format buildInterpretation can emit:
 *   - "The image shows Garbage (70% confidence), which does not match ..."
 *   - "The model is unsure: detected Landslide at 56% confidence ..."
 *   - "Accident reports always need a human decision: Pothole detected at ..."
 *   - "Pothole confirmed at 70% confidence. ..." (incl. the legacy
 *     "Run AI review: ..." prefix, which is why the pattern is unanchored)
 * The returned label is the raw model label (e.g. "Water_Logging"); callers
 * that compare it against an incident type must go through
 * matchesIncidentType so case/underscore differences do not read as a
 * mismatch.
 */
export function parseAiPredictedLabel(
  text: string | null | undefined
): string | null {
  if (!text || !text.trim()) return null;

  const shows = text.match(
    /The image shows ([A-Za-z_ ]+?) \(\d+(?:\.\d+)?% confidence\)/i
  );
  if (shows) return shows[1].trim();

  const detected = text.match(
    /detected ([A-Za-z_ ]+?) at \d+(?:\.\d+)?% confidence/i
  );
  if (detected) return detected[1].trim();

  // The accident branch words it the other way around:
  // "Pothole detected at 49% confidence" (label BEFORE "detected").
  const labelDetected = text.match(
    /([A-Za-z_ ]+?) detected at \d+(?:\.\d+)?% confidence/i
  );
  if (labelDetected) return labelDetected[1].trim();

  const confirmed = text.match(
    /([A-Za-z_ ]+?) confirmed at \d+(?:\.\d+)?% confidence/i
  );
  if (confirmed) return confirmed[1].trim();

  return null;
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
