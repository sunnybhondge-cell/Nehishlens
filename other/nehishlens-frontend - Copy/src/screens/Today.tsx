import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { TodayApi, CortexApi, STAGES } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { useLens } from '../context/LensContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, Conf, CiteRow, QueryState } from '../components/ui';

/**
 * Screen 1 · Today. Every fragment is a live call: KPI tiles
 * (`/metrics/summary`), priorities (`/priorities`), the overnight briefing
 * (`/briefing`) and the Cortex context line (`/cortex/context`). Nothing on
 * this screen is bundled data.
 */
export function Today() {
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

  const decisions = (priorities.data ?? []).filter((p) => p.stage !== 'remembered');

  // ─── DEMO: incident CTAs open the (working) Incidents list, not the blank
  // incident-detail page. Delete this and use `/${p.target}` directly to revert.
  const demoTarget = (t: string) => (t.startsWith('incidents/') ? 'incidents' : t);

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

      <section className="kpi-top-row">
        <div className="kpi-row-head">
          <div>
            <div className="t-label">OPERATING POSITION</div>
            <h2>Overnight operating metrics</h2>
          </div>
        </div>
        <QueryState q={kpis} what="the KPI tiles" skeletonLines={4}>
          {(data) => (
            <div className="tiles">
              {data.tiles.map((t) => (
                <div className="tile" key={t.key}>
                  <div className="t-label">{t.label}</div>
                  <div className="t-metric">
                    {t.value}
                    {t.delta && (
                      <span className={`dl ${t.deltaTone === 'ok' ? 'd-ok' : 'd-warn'}`}>
                        {' '}
                        {t.delta}
                      </span>
                    )}
                  </div>
                  {t.caption && <div className="bc">{t.caption}</div>}
                  {t.derivationId && (
                    <button
                      className="cite"
                      style={{ marginTop: 4 }}
                      aria-expanded={derivationId === t.derivationId}
                      onClick={() => setSearch({ derive: t.derivationId! })}
                    >
                      how this is derived
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </QueryState>
        {derivationId && (
          <DerivationPanel id={derivationId} state={derivationState} onClose={() => setSearch({})} />
        )}
      </section>

      <section className="priority-center panel">
        <div className="priority-head">
          <div>
            <div className="t-label">PRIORITY NOW</div>
            <h2>What needs attention first</h2>
            <p>Highest-impact work is surfaced before the broader operational context.</p>
          </div>
          <button className="collapse-btn" aria-expanded={prioritiesOpen} onClick={() => setPrioritiesOpen((v) => !v)}>
            {prioritiesOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {prioritiesOpen && <QueryState q={priorities} what="priorities" skeletonLines={3}>
          {(items) =>
            items.length === 0 ? (
              <p className="muted">Nothing needs attention right now.</p>
            ) : (
              <div className="priority-grid">
                {items.map((p, i) => (
                  <div className={`priority-card ${p.tone}`} key={i}>
                    <div className="pc-top">
                      <span className="pc-label">{p.label}</span>
                      <span className="t-cap mono">{p.stage}</span>
                    </div>
                    <div className="pc-title">{p.title}</div>
                    {p.meta && <div className="pc-meta">{p.meta}</div>}
                    {p.why && <div className="pc-why">{p.why}</div>}
                    {p.action && p.target && (
                      <div className="pc-actions">
                        <Link className="btn btn-s btn-p" to={`/${demoTarget(p.target)}`}>
                          {p.action}
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          }
        </QueryState>}
      </section>

      <div className="panel">
        <QueryState q={briefing} what="the overnight briefing" skeletonLines={3}>
          {(b) => (
            <>
              <PanelHead label="Overnight — Cortex briefing">
                <Conf value={b.confidence} />
              </PanelHead>
              <div style={{ fontSize: 15, lineHeight: '24px' }}>{b.text}</div>
              <CiteRow citations={b.citations} />
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
                An almost-empty Today is correct behaviour most mornings, not a broken page.
              </div>
            ) : (
              <>
                {decisions.map((p, i) => (
                  <article className="inc" data-s={p.tone === 'critical' ? 'crit' : 'warn'} key={i}>
                    <div className="inc-t">
                      <div className="inc-ti">{p.title}</div>
                      <div className="loop">
                        {STAGES.map((s, si) => (
                          <i
                            key={s}
                            className={
                              si < STAGES.indexOf(p.stage)
                                ? 'd'
                                : si === STAGES.indexOf(p.stage)
                                  ? 'a'
                                  : ''
                            }
                          />
                        ))}
                      </div>
                    </div>
                    {p.meta && <div className="inc-c">{p.meta}</div>}
                    {p.why && <div className="inc-d">{p.why}</div>}
                    {p.action && p.target && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                        <Link className="btn btn-p btn-s" to={`/${demoTarget(p.target)}`}>
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
    </div>
  );
}

function DerivationPanel({ id, state, onClose }: { id: string; state?: string; onClose: () => void }) {
  const derivation = useHydrated(['derivation', id, state], () => TodayApi.derivation(id, state));
  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <PanelHead label="How this is derived">
        <button className="btn btn-s btn-q" onClick={onClose}>Close</button>
      </PanelHead>
      <QueryState q={derivation} what="the derivation" skeletonLines={4}>
        {(d) => (
          <>
            <div className="t-metric">{d.value} <span className="t-cap">{d.unit}</span></div>
            {d.claim && <p className="body-copy">{d.claim}</p>}
            {d.formula && <div className="kv"><div className="k">Formula</div><div className="v">{d.formula}</div></div>}
            {d.method && <div className="kv"><div className="k">Method</div><div className="v">{d.method}</div></div>}
            {d.baselineRule && <div className="kv"><div className="k">Baseline rule</div><div className="v">{d.baselineRule}</div></div>}
            {d.inputs?.map((input) => <div className="claim" key={input.label}><span className="lb">{input.label}</span><span className="t-cap">{input.note}</span></div>)}
            {d.excludes?.map((item) => <div className="regress" key={item.what}><b>{item.what}</b><br />{item.why}</div>)}
            {d.gap && <div className="regress">{d.gap}</div>}
            {d.confirmed && <div className="receipt">Recorded: {d.confirmed}</div>}
          </>
        )}
      </QueryState>
    </div>
  );
}
