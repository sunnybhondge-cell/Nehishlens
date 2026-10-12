/**
 * One function per operation on the NehishLens mock API, grouped like the
 * wiring guide so this file and the guide read side-by-side.
 *
 * Response types below were tightened against the LIVE mock (Swagger /docs +
 * probing every GET). List endpoints return `{ items, total, cursor }` — call
 * them through `api.list` / `api.page`, which unwrap the envelope to `T[]`.
 */
import { api } from './client';
import type { Lens } from './config';

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------
export interface Citation {
  id?: string;
  label: string;
  /** Hash-route target the prototype links to, e.g. "incidents/INC-2214". */
  target?: string;
  resolvable?: boolean;
  sourceId?: string;
  sourceTitle?: string;
  unitRef?: string;
  unitTitle?: string;
}

export type Confidence = 'grounded' | 'partial' | 'ungrounded' | 'refused' | string;
export type Stage = 'observed' | 'understood' | 'acting' | 'acted' | 'remembered' | string;

export const STAGES: Stage[] = ['observed', 'understood', 'acting', 'acted', 'remembered'];
export const STAGE_LABEL: Record<string, string> = {
  observed: 'Observed',
  understood: 'Understood',
  acting: 'Acting',
  acted: 'Acted',
  remembered: 'Remembered',
};

// ---------------------------------------------------------------------------
// Today · Screen 1
// ---------------------------------------------------------------------------
export interface KpiTile {
  key: string;
  label: string;
  value: string | number;
  delta: string | null;
  deltaTone: 'ok' | 'warn' | 'crit' | null;
  caption?: string;
  derivationId?: string;
}
export interface KpiTilesResponse {
  asOf: string;
  tiles: KpiTile[];
}
export interface DerivationInput {
  label: string;
  from?: string;
  note?: string;
}
export interface DerivationResponse {
  id: string;
  metric: string;
  value: string | number;
  unit?: string;
  delta?: string;
  claim?: string;
  formula?: string;
  method?: string;
  window?: string;
  recomputed?: string;
  recomputedDays?: number;
  inputs?: DerivationInput[];
  baselineRule?: string;
  excludes?: Array<{ what: string; why: string; source?: string }>;
  confirmed?: string;
  gap?: string;
}
export interface PriorityItem {
  tone: 'warning' | 'positive' | 'critical' | string;
  label: string;
  /** null = not a loop object (a trend or a metric), e.g. exec's efficiency cards. */
  stage: Stage | null;
  title: string;
  meta?: string;
  why?: string;
  action?: string;
  target?: string;
}
export interface BriefingResponse {
  date: string | null;
  window?: string;
  confidence?: Confidence;
  /** null in the empty state — then `note` carries the server's explanation. */
  text: string | null;
  citations: Citation[];
  note?: string;
}

export const TodayApi = {
  metricsSummary: () => api.get<KpiTilesResponse>('/metrics/summary'),
  derivation: (derivationId: string, mockState?: string) =>
    api.get<DerivationResponse>(`/derivations/${encodeURIComponent(derivationId)}`, { mockState }),
  priorities: () => api.list<PriorityItem>('/priorities'),
  briefing: () => api.get<BriefingResponse>('/briefing'),
};

// ---------------------------------------------------------------------------
// Incidents · Screen 2
// ---------------------------------------------------------------------------
export interface Diagnosis {
  text: string;
  confidence: Confidence;
  confidencePct: number | null;
  notVerified: string[];
  citations: Citation[];
}
export interface PastFix {
  id: string;
  match: number;
  appliedDate: string;
  reuseCount: number;
}
export interface IncidentSummary {
  id: string;
  title: string;
  system?: string;
  branch?: string;
  owner?: string;
  severity: 'crit' | 'warn' | 'ok' | string;
  openedAt?: string;
  slaAt?: string;
  stage: Stage;
  signatureId?: string;
  impact?: string;
  diagnosis?: Diagnosis;
}
export interface IncidentDetailResponse extends IncidentSummary {
  pastFix: PastFix | null;
  proposer: string | null;
  requiredApprover: string | null;
  actionSteps: string[];
  externalInstructions?: string | null;
  loop?: { stage: Stage; log: Array<{ t: string; who: string; what: string }> };
}
export interface RecallResponse {
  match: {
    resolutionId: string;
    matchPct: number;
    appliedDate: string;
    reuseCount: number;
    title: string;
    steps: string[];
  } | null;
  thresholdPct: number;
  thresholdTuned: boolean;
  note?: string;
}
export interface ObserveIncidentPayload {
  title: string;
  message: string;
  module?: string;
  stageName?: string;
  system?: string;
  branch?: string;
  owner?: string;
  severity?: string;
  impact?: string;
}

/** POST /incidents — the message is fingerprinted; a known fingerprint arrives already understood. */
export interface ObserveIncidentResponse {
  incident: IncidentDetailResponse;
  recognised: boolean;
  resolution?: { id?: string; title?: string; [key: string]: unknown } | null;
  note?: string;
}

export const IncidentsApi = {
  list: (stage?: string) =>
    api.list<IncidentSummary>(`/incidents${stage ? `?stage=${encodeURIComponent(stage)}` : ''}`),
  create: (payload: ObserveIncidentPayload) => api.post<ObserveIncidentResponse>('/incidents', payload),
  detail: (incidentId: string) =>
    api.get<IncidentDetailResponse>(`/incidents/${encodeURIComponent(incidentId)}`),
  advanceLoop: (incidentId: string, toStage: string, actorId: string, reason?: string) =>
    api.patch<IncidentDetailResponse>(`/incidents/${encodeURIComponent(incidentId)}/loop`, {
      toStage,
      actorId,
      reason,
    }),
  recall: (incidentId: string) =>
    api.get<RecallResponse>(`/incidents/${encodeURIComponent(incidentId)}/recall`),
  rejectRecall: (incidentId: string, actorId: string, reason: string) =>
    api.post<void>(`/incidents/${encodeURIComponent(incidentId)}/recall/reject`, { actorId, reason }),
};

// ---------------------------------------------------------------------------
// Actions · Screen 2 (write path)
// ---------------------------------------------------------------------------
export interface Approver {
  id: string;
  name: string;
  role: string;
}
export interface ApproversResponse {
  required: number;
  candidates: Approver[];
  proposerMayNotApprove: boolean;
  suggested: string | null;
}
export interface ProposeActionPayload {
  incidentId: string;
  steps: string[];
  proposerId: string;
  requiredApproverId: string;
  resolutionId?: string;
}
export interface ApproveActionPayload {
  approverId: string;
  outcome?: 'applied' | 'failed';
  condition?: string;
}
export interface ActionRecord {
  id: string;
  incidentId: string;
  status: string;
  steps?: string[];
  [key: string]: unknown;
}
export interface Receipt {
  id?: string;
  actionId?: string;
  seq?: number;
  outcome?: 'applied' | 'failed' | string;
  condition?: string;
  prevHash?: string;
  writtenAt?: string;
  hash?: string;
  chain?: unknown[];
  [key: string]: unknown;
}
export interface ApproveActionResponse {
  action: ActionRecord;
  receipt: Receipt;
  incidentStage: Stage;
}

export const ActionsApi = {
  approvers: (lens: Lens, incidentId: string) =>
    api.get<ApproversResponse>(
      `/policy/approvers?lens=${encodeURIComponent(lens)}&incidentId=${encodeURIComponent(incidentId)}`,
    ),
  // Not surfaced in the UI: the mock returns `not_found` for the seed's
  // resolution ids, and `/incidents/{id}/recall` already returns the same
  // `steps` array. Kept for completeness / when the mock gains real runbooks.
  runbook: (resolutionId: string) =>
    api.get<{ steps: string[]; resolutionId: string }>(
      `/runbooks/${encodeURIComponent(resolutionId)}`,
    ),
  propose: (payload: ProposeActionPayload) => api.post<ActionRecord>('/actions', payload),
  approve: (actionId: string, payload: ApproveActionPayload) =>
    api.post<ApproveActionResponse>(`/actions/${encodeURIComponent(actionId)}/approve`, payload),
  receipt: (actionId: string) =>
    api.get<Receipt>(`/actions/${encodeURIComponent(actionId)}/receipt`),
};

// ---------------------------------------------------------------------------
// EOD & Batch · Screen 3
// ---------------------------------------------------------------------------
export interface RunStage {
  name: string;
  expectedMin: number;
  actualMin: number;
  state: 'ok' | 'warn' | 'crit' | string;
  note?: string;
  incidentId?: string;
}
export interface RunTimeline {
  id: string;
  cutoff: string;
  bodDeadline: string;
  completedAt: string;
  deviationMinutes: number;
  bodBreached: boolean;
  stages: RunStage[];
  gap?: string | { message?: string; missing?: string[] };
}
export interface FeedHealth {
  sourceId: string;
  name: string;
  lastHeartbeat: string | null;
  state: 'ok' | 'silent' | string;
  note?: string;
}

export const EodApi = {
  run: (runId: string, mockState?: string) =>
    api.get<RunTimeline>(`/runs/${encodeURIComponent(runId)}`, { mockState }),
  feedHealth: () => api.list<FeedHealth>('/feeds/health'),
};

// ---------------------------------------------------------------------------
// Audit & Evidence · Screen 4
// ---------------------------------------------------------------------------
export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  actorKind: 'ai' | 'human' | string;
  verb: string;
  object: string;
  payload?: Record<string, unknown>;
  prevHash?: string;
  hash: string;
}
export interface AuditVerifyResponse {
  intact: boolean;
  length: number;
  brokenAtSeq?: number;
}

export const AuditApi = {
  list: (limit = 50) => api.list<AuditEntry>(`/audit?limit=${limit}`),
  verify: () => api.get<AuditVerifyResponse>('/audit/verify'),
  byHash: (entryHash: string) => api.get<AuditEntry>(`/audit/${encodeURIComponent(entryHash)}`),
};

// ---------------------------------------------------------------------------
// Corpus · Screen 5
// ---------------------------------------------------------------------------
export interface CorpusMetrics {
  resolutions: number;
  reuseEventsThisWeek: number;
  recallHitRatePct: number;
  notCaptured: number;
  addedToday: number;
}
export interface Resolution {
  id: string;
  slug: string;
  title: string;
  problem: string;
  cause: string;
  fix: string;
  verification: string;
  citations: Citation[];
  approvedBy: string;
  approvedOn: string;
  reuseCount: number;
  lastReused: string;
  confidence: Confidence;
  status: string;
  supersedesId?: string | null;
  relatedIncidents?: string[];
  signatureId?: string;
}
export interface CaptureResolutionPayload {
  incidentId: string;
  title: string;
  problem: string;
  cause: string;
  fix: string;
  verification: string;
  draftedBy?: string;
  approvedBy: string;
}
export interface Signature {
  id: string;
  facetsIncluded: string[];
  facetsExcluded: string[];
  occurrenceCount: number;
  resolutionIds: string[];
  note?: string;
}

export const CorpusApi = {
  metrics: () => api.get<CorpusMetrics>('/corpus/metrics'),
  resolutions: () => api.list<Resolution>('/resolutions'),
  // ids contain '#' (res#1198) — encodeURIComponent turns it into res%231198.
  resolution: (resolutionId: string) =>
    api.get<Resolution>(`/resolutions/${encodeURIComponent(resolutionId)}`),
  capture: (payload: CaptureResolutionPayload) => api.post<Resolution>('/resolutions', payload),
  reuse: (resolutionId: string) =>
    api.post<Resolution>(`/resolutions/${encodeURIComponent(resolutionId)}/reuse`),
  signature: (signatureId: string) =>
    api.get<Signature>(`/signatures/${encodeURIComponent(signatureId)}`),
  signatureOccurrences: (signatureId: string) =>
    api.list<IncidentSummary>(`/signatures/${encodeURIComponent(signatureId)}/occurrences`),
};

// ---------------------------------------------------------------------------
// Corpus · Sources · Screen 5
// ---------------------------------------------------------------------------
export interface SourceCoverage {
  indexed: number;
  total: number;
  unit: string;
  skipped?: Array<{ what: string; why: string }>;
}
export interface SourceUnit {
  ref: string;
  title: string;
  cited: number;
}
export interface SourceSummary {
  id: string;
  title: string;
  type: string;
  version?: string;
  dated?: string;
  size?: string;
  owner?: string;
  system?: string;
  ingested?: string;
  ingestedDays?: number;
  staleAfter?: number;
  citedBy?: number;
  status: 'ok' | 'partial' | 'stale' | string;
  coverage?: SourceCoverage;
  units?: SourceUnit[];
  lenses?: string[];
  note?: string;
  /** Set locally by Sources.tsx when a per-lens detail call 403s. */
  denied?: boolean;
  deniedReason?: string;
}
export type SourceDetail = SourceSummary;

export const SourcesApi = {
  // `mockState` carries the v12 deep-linkable `?state=loading|empty|error` view state.
  list: (q?: string, mockState?: string) =>
    api.list<SourceSummary>(`/sources${q ? `?q=${encodeURIComponent(q)}` : ''}`, { mockState }),
  // Can 403 not_granted per lens — fan out through fetchAllSettled (rule 5).
  detail: (sourceId: string) => api.get<SourceDetail>(`/sources/${encodeURIComponent(sourceId)}`),
  citations: () => api.list<Citation>('/citations'),
  citation: (citationId: string) =>
    api.get<Citation>(`/citations/${encodeURIComponent(citationId)}`),
};

// ---------------------------------------------------------------------------
// Settings · Screen 7
// ---------------------------------------------------------------------------
export interface ThresholdEntry {
  value: number;
  unit: string;
  tuned: boolean;
  note?: string;
}
export interface ThresholdsResponse {
  recallMinMatch?: ThresholdEntry;
  refuseBelowConfidence?: ThresholdEntry;
  staleSourceDays?: ThresholdEntry;
}

export const SettingsApi = {
  thresholds: () => api.get<ThresholdsResponse>('/config/thresholds'),
};

// ---------------------------------------------------------------------------
// Cortex · its own screen
// ---------------------------------------------------------------------------
export interface CortexContextResponse {
  screen: string;
  lens: string;
  context: string;
  message: string;
  suggestions: string[];
}
export interface CortexAnswer {
  answerId: string;
  question: string;
  askedAt: string;
  confidence: Confidence;
  confidencePct: number | null;
  answer: string;
  citations: Citation[];
  notVerified: string[];
  threshold?: { refuseBelowConfidence: number; applied: boolean };
  context?: { screen: string; lens: string; objectId: string | null };
}
export interface CortexAskPayload {
  question: string;
  context: { screen: string; lens: string; objectId?: string | null };
}

export const CortexApi = {
  context: (screen: string, lens: Lens, objectId?: string) =>
    api.get<CortexContextResponse>(
      `/cortex/context?screen=${encodeURIComponent(screen)}&lens=${encodeURIComponent(lens)}${
        objectId ? `&objectId=${encodeURIComponent(objectId)}` : ''
      }`,
    ),
  ask: (payload: CortexAskPayload) => api.post<CortexAnswer>('/cortex/ask', payload),
};

// ---------------------------------------------------------------------------
// Mock control — not tied to a screen
// ---------------------------------------------------------------------------
export const MockControlApi = {
  reset: () => api.post<void>('/_reset'),
  states: () => api.get<{ states: string[]; howToUse: string; note: string }>('/_states'),
};
