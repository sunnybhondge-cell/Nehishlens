import { Link, useSearchParams } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { TodayApi, CortexApi, SourcesApi, type DerivationResponse } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { useLens } from '../context/LensContext';
import { LENS_LABEL } from '../nav';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, Conf, CiteRow, QueryState, LoopIndicator, CheckIcon } from '../components/ui';
import { Executive } from './Executive';

/**
 * Screen 1 · Today. For the Executive lens, Today *is* the Executive preview
 * (v12: `ROLE==='exec' && key==='today'` renders `#s-executive`), which keeps
 * the exec rail at two destinations — Today and Corpus (CR-05).
 */
export function Today() {
  const { lens } = useLens();
  return lens === 'exec' ? <Executive /> : <OperatingToday />;
}

/**
 * Every fragment is a live call: KPI tiles (`/metrics/summary`), priorities
 * (`/priorities`), the overnight briefing (`/briefing`), the Cortex context
 * line (`/cortex/context`) and the Hours saved derivation
 * (`/derivations/hours-saved`, deep-linkable as `?derive=hours-saved`).
 */
function OperatingToday() {
  const [search, setSearch] = useSearchParams();
  const [prioritiesOpen, setPrioritiesOpen] = useState(true);
  const { lens } = useLens();
  const kpis = useHydrated(['metrics-summary'], TodayApi.metricsSummary);
  const priorities = useHydrated(['priorities'], TodayApi.priorities);
  const briefing = useHydrated(['briefing'], TodayApi.briefing);
  const cortex = useHydrated(['cortex-context', 'today', lens], () =>
    CortexApi.context('today', lens),
  );
  const derivationId = search.get('derive');
  const derivationState = search.get('state') ?? undefined;

  // Only loop objects that are still open need a decision; a null stage is a
  // trend or a metric, not something to decide on.
  const decisions = (priorities.data ?? []).filter((p) => p.stage && p.stage !== 'remembered');

  return (
    <div className="stack">
      <ScreenHeader
        title="Today"
        subtitle={kpis.data ? `as of ${new Date(kpis.data.asOf).toLocaleString()}` : '—'}
        crumb="Operations · overnight window"
      />

      <Trace>
        A decision surface, not a KPI wall — three questions at 06:00: what happened, what it cost,
        what is still open.
      </Trace>

      <section className="kpi-top-row" aria-labelledby="operationalMetricsTitle">
        <div className="kpi-row-head">
          <div>
            <div className="t-label">OPERATING POSITION</div>
            <h2 id="operationalMetricsTitle">Overnight operating metrics</h2>
          </div>
        </div>
        <QueryState q={kpis} what="the KPI tiles" skeletonLines={4}>
          {(data) => (
            <div className="tiles">
              {data.tiles.map((t) => {
                const open = derivationId === t.derivationId;
                return (
                  <div className="tile" key={t.key}>
                    <div className="t-label">{t.label}</div>
                    <div className="t-metric">
                      {t.value}
                      {t.delta && (
                        <span className={`dl ${t.deltaTone === 'ok' ? 'd-ok' : 'd-warn'}`}>{t.delta}</span>
                      )}
                    </div>
                    <div className="bc">
                      {t.caption}
                      {/* CR-10: a real button that opens the derivation, and the route carries it. */}
                      {t.derivationId && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className={`cite cite-derive${open ? ' on' : ''}`}
                            style={{ marginTop: 4 }}
                            aria-expanded={open}
                            aria-controls="derivePanel"
                            title="How the baseline is derived"
                            aria-label="baseline — show how this figure is derived"
                            onClick={() => setSearch(open ? {} : { derive: t.derivationId! })}
                          >
                            baseline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </QueryState>
        <div id="derivePanel" hidden={!derivationId}>
          {derivationId && (
            <DerivationPanel id={derivationId} state={derivationState} onClose={() => setSearch({})} />
          )}
        </div>
      </section>

      <section className="priority-center panel" aria-labelledby="priorityTitle">
        <div className="priority-head">
          <div>
            <div className="t-label">PRIORITY NOW</div>
            <h2 id="priorityTitle">What needs attention first</h2>
            <p>Actions are ordered by urgency and impact for the bank operations team.</p>
          </div>
          <button
            type="button"
            className="collapse-btn"
            aria-expanded={prioritiesOpen}
            aria-controls="priorityBody"
            onClick={() => setPrioritiesOpen((v) => !v)}
          >
            {prioritiesOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <div id="priorityBody" hidden={!prioritiesOpen}>
          <QueryState q={priorities} what="the priority list" skeletonLines={3}>
            {(items) =>
              items.length === 0 ? (
                <div className="empty">
                  <b>Nothing needs you right now</b>
                  No item is waiting on a decision. This is the expected state most mornings — an
                  almost-empty Today is correct behaviour, not a broken page.
                </div>
              ) : (
                <div className="priority-grid">
                  {items.map((p, i) => (
                    <article className={`priority-card ${p.tone}`} key={`${p.title}-${i}`}>
                      <div className="pc-top">
                        <span className="pc-label">{p.label}</span>
                        <span className="pc-pill role">{LENS_LABEL[lens]}</span>
                      </div>
                      <div className="pc-title">{p.title}</div>
                      {p.meta && <div className="pc-meta">{p.meta}</div>}
                      {p.why && <div className="pc-why">{p.why}</div>}
                      <div className="pc-loop">
                        <LoopIndicator stage={p.stage} />
                      </div>
                      <div className="pc-actions">
                        {p.action && p.target && (
                          <Link className="btn btn-s" to={`/${p.target}`}>
                            {p.action}
                          </Link>
                        )}
                        <span className={`pc-pill ${toneClass(p.tone)}`}>{toneLabel(p.tone)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )
            }
          </QueryState>
        </div>
      </section>

      <div className="panel">
        <QueryState q={briefing} what="the overnight briefing" skeletonLines={3}>
          {(b) => (
            <>
              <PanelHead label="Overnight — Cortex briefing">
                {/* Empty state is a real answer, not a gap: no confidence badge on a note. */}
                {b.text && b.confidence && <Conf value={b.confidence} />}
              </PanelHead>
              <div style={{ fontSize: 15, lineHeight: '24px' }}>
                {b.text ?? b.note ?? 'Nothing to report for this window.'}
              </div>
              {b.text && <CiteRow citations={b.citations} />}
            </>
          )}
        </QueryState>
      </div>

      <div>
        <div className="t-label" style={{ marginBottom: 8 }}>
          Needs a decision · {decisions.length}
        </div>
        <QueryState q={priorities} what="decisions" skeletonLines={2}>
          {() =>
            decisions.length === 0 ? (
              <div className="empty">
                <b>Nothing needs you right now</b>
                The overnight run completed cleanly and there are no items requiring a decision. An
                almost-empty Today is correct behaviour most mornings, not a broken page.
              </div>
            ) : (
              <>
                {decisions.map((p, i) => (
                  <article className="inc" data-s={p.tone === 'critical' ? 'crit' : 'warn'} key={`${p.title}-${i}`}>
                    <div className="inc-t">
                      <div className="inc-ti">{p.title}</div>
                      <LoopIndicator stage={p.stage} />
                    </div>
                    {p.meta && <div className="inc-c">{p.meta}</div>}
                    {p.why && <div className="inc-d">{p.why}</div>}
                    {p.action && p.target && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                        <Link className="btn btn-p btn-s" to={`/${p.target}`}>
                          {p.action}
                        </Link>
                      </div>
                    )}
                  </article>
                ))}
              </>
            )
          }
        </QueryState>
      </div>

      <div className="panel">
        <PanelHead label="Cortex context" chip="fast path" />
        <QueryState q={cortex} what="the Cortex context" skeletonLines={2}>
          {(c) => (
            <>
              <div className="mb">{c.message}</div>
              <div className="crow" style={{ marginTop: 10 }}>
                {c.suggestions.map((s) => (
                  <Link key={s} className="cite" to="/cortex">
                    {s}
                  </Link>
                ))}
              </div>
            </>
          )}
        </QueryState>
      </div>

      <div className="note">
        <b style={{ color: 'var(--text-hi)' }}>What is deliberately absent:</b> no KPI wall, no
        system-health gauge, no chart that nobody acts on. The Operations lens at 06:00 answers three
        questions — what happened, what it cost, what is still open.
      </div>
    </div>
  );
}

const toneClass = (tone: string) =>
  tone === 'critical' ? 'critical' : tone === 'warning' ? 'warning' : 'ok';
const toneLabel = (tone: string) =>
  tone === 'critical' ? 'High' : tone === 'warning' ? 'Review' : 'Healthy';

/** Daily recompute is the expectation for a derived metric (v12 stale copy). */
const DERIVATION_STALE_AFTER_DAYS = 1;

/** Input chips link to what they were drawn from: the corpus, or an ingested source. */
function DerivationInputChip({ label, from }: { label: string; from?: string }) {
  if (from === 'corpus')
    return (
      <Link className="cite cite-src" to="/corpus" title="Corpus — open resolutions">
        {label}
      </Link>
    );
  if (from)
    return (
      <Link className="cite cite-src" to={`/sources/${encodeURIComponent(from)}`} title="Open source detail">
        {label}
      </Link>
    );
  return <span className="cite cite-derived">{label}</span>;
}

/**
 * CR-10 · Derivation panel (§5.4: "a clickable link to how the baseline is
 * derived"). The tag and freshness line are computed from the payload —
 * `recomputedDays`, `excludes`, `value` — not from the URL `state` param,
 * which is only forwarded as `X-Mock-State`. Error and denied come back as
 * HTTP errors and render through `QueryState`.
 */
function DerivationPanel({ id, state, onClose }: { id: string; state?: string; onClose: () => void }) {
  const derivation = useHydrated(['derivation', id, state], () => TodayApi.derivation(id, state));
  const d = derivation.data;
  return (
    <div className="panel derive" aria-busy={derivation.isLoading}>
      <div className="ph">
        <span className="t-label">How this is derived</span>
        {d && <DerivationTag d={d} />}
        <span className="sp" style={{ flex: 1 }} />
        <button type="button" className="btn btn-s btn-q derive-close" onClick={onClose}>
          Close
        </button>
      </div>
      <QueryState q={derivation} what="the derivation" skeletonLines={4}>
        {(d) => <DerivationBody d={d} />}
      </QueryState>
    </div>
  );
}

function isStale(d: DerivationResponse) {
  return (d.recomputedDays ?? 0) > DERIVATION_STALE_AFTER_DAYS;
}

function DerivationTag({ d }: { d: DerivationResponse }) {
  if (isStale(d)) return <span className="src-tag stale">Stale</span>;
  if (d.excludes?.length) return <span className="src-tag partial">Partial window</span>;
  return (
    <span className="src-tag ok">
      <CheckIcon /> Reconciled
    </span>
  );
}

function DerivationBody({ d }: { d: DerivationResponse }) {
  // Same cache entry as the Corpus screen; used to name an excluded range's source.
  const sources = useHydrated(['sources'], () => SourcesApi.list());
  const sourceTitle = (sid: string) => sources.data?.find((x) => x.id === sid)?.title ?? sid;
  if (d.value == null || d.value === '')
    return (
      <div className="empty">
        <b>No derivation recorded</b>This metric has not been computed for the current window. Until
        it is, the tile shows no figure rather than carrying one forward.
      </div>
    );
  if (Number(d.value) === 0)
    return (
      <div className="empty">
        <b>No matching signatures in this window</b>Nothing was closed against a corpus match
        {d.window ? ` in the ${d.window}` : ''}, so {d.metric.toLowerCase()} is <b>0.0</b> — a real
        zero, not a missing value.
      </div>
    );

  const stale = isStale(d);
  const excludes = d.excludes ?? [];
  return (
    <>
      <div className="derive-top">
        <div className="derive-fig">
          <span className="derive-num">{d.value}</span>
          {d.unit && <span className="derive-unit">{d.unit}</span>}
          {d.delta && <span className="dl d-ok">{d.delta}</span>}
        </div>
        {d.claim && <div className="derive-claim">{d.claim}</div>}
      </div>

      {d.formula && <DeriveBlock k="Formula">{d.formula}</DeriveBlock>}
      {d.method && <DeriveBlock k="Method">{d.method}</DeriveBlock>}
      {d.baselineRule && <DeriveBlock k="Baseline rule">{d.baselineRule}</DeriveBlock>}

      {d.inputs && d.inputs.length > 0 && (
        <div className="derive-block">
          <div className="derive-k">Inputs</div>
          <div className="derive-v">Each term traces to a source you can open.</div>
          <div className="crow">
            {d.inputs.map((inp) => (
              <DerivationInputChip key={inp.label} label={inp.label} from={inp.from} />
            ))}
          </div>
        </div>
      )}

      {excludes.length > 0 && (
        <div className="derive-block">
          <div className="derive-k">What this figure does not claim · {excludes.length}</div>
          {excludes.map((e) => (
            <div className="src-gap" key={e.what}>
              <div className="src-gap-what">{e.what}</div>
              <div className="src-gap-why">
                {e.why}{' '}
                {e.source && (
                  <Link className="cite cite-src" to={`/sources/${encodeURIComponent(e.source)}`} title={`${sourceTitle(e.source)} — open source detail`}>
                    {sourceTitle(e.source)}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {d.gap && <div className="regress">{d.gap}</div>}

      <div className="kvs" style={{ marginTop: 14 }}>
        {d.window && (
          <div className="kv"><div className="k">Window</div><div className="v mono">{d.window}</div></div>
        )}
        {d.recomputed && (
          <div className="kv"><div className="k">Last recomputed</div><div className="v mono">{d.recomputed}</div></div>
        )}
        <div className="kv"><div className="k">Type</div><div className="v">Derived — not an ingested source</div></div>
      </div>

      {stale ? (
        <div className="denied" style={{ marginTop: 12 }}>
          <div className="t-label">Stale derivation</div>
          <div className="msg">
            Last recomputed {d.recomputedDays} days ago, outside the daily expectation for this metric.
            Treat the figure as indicative until it recomputes.
          </div>
        </div>
      ) : (
        d.confirmed && (
          <div className="receipt-row">
            <span className="receipt">
              <CheckIcon /> {d.confirmed}
            </span>
          </div>
        )
      )}
    </>
  );
}

function DeriveBlock({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="derive-block">
      <div className="derive-k">{k}</div>
      <div className="derive-v">{children}</div>
    </div>
  );
}
