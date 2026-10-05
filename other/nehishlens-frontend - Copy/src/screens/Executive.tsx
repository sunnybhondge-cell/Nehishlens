import { TodayApi, CorpusApi, AuditApi } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, QueryState } from '../components/ui';

/**
 * Executive preview. There is no dedicated executive endpoint — this is a
 * re-projection of live data the other screens already use: KPI tiles
 * (`/metrics/summary`), corpus metrics, chain verification and the
 * hours-saved derivation. Every number here is fetched, not authored.
 */
export function Executive() {
  const kpis = useHydrated(['metrics-summary'], TodayApi.metricsSummary);
  const corpus = useHydrated(['corpus-metrics'], CorpusApi.metrics);
  const verify = useHydrated(['audit-verify'], AuditApi.verify);
  const derivation = useHydrated(['derivation', 'hours-saved'], () =>
    TodayApi.derivation('hours-saved'),
  );

  return (
    <div className="stack">
      <ScreenHeader
        title="Executive preview"
        crumb="Executive · Phase 2 concept"
        subtitle="business position · composed from live operational data"
      />
      <Trace>
        Preview-only Phase 2 concept — a low-density business narrative over the same data the
        operational lenses use.
      </Trace>

      <div className="panel" style={{ borderLeft: '4px solid var(--lens-exec)' }}>
        <PanelHead label="Executive position">
          <span className="sev warn">Preview only</span>
        </PanelHead>
        <QueryState q={kpis} what="the operating metrics" skeletonLines={2}>
          {(k) => (
            <div style={{ fontSize: 15, lineHeight: '24px' }}>
              Core operations reported as of {new Date(k.asOf).toLocaleString()}.{' '}
              {k.tiles.map((t) => `${t.label.toLowerCase()} ${t.value}`).join(', ')}.
            </div>
          )}
        </QueryState>
      </div>

      <QueryState q={kpis} what="the KPI tiles" skeletonLines={4}>
        {(k) => (
          <div className="tiles">
            {k.tiles.map((t) => (
              <div className="tile" key={t.key}>
                <div className="t-label">{t.label}</div>
                <div className="t-metric">
                  {t.value}
                  {t.delta && (
                    <span className={`dl ${t.deltaTone === 'ok' ? 'd-ok' : 'd-warn'}`}> {t.delta}</span>
                  )}
                </div>
                {t.caption && <div className="bc">{t.caption}</div>}
              </div>
            ))}
          </div>
        )}
      </QueryState>

      <div className="g2">
        <div className="panel">
          <PanelHead label="Business lens" />
          <QueryState q={derivation} what="the hours-saved derivation" skeletonLines={2}>
            {(d) => (
              <div className="kv">
                <div className="k">Capacity recovered</div>
                <div className="v">
                  {d.value} {d.unit}
                </div>
              </div>
            )}
          </QueryState>
          <QueryState q={corpus} what="the corpus metrics" skeletonLines={2}>
            {(c) => (
              <>
                <div className="kv">
                  <div className="k">Resolution reuse this week</div>
                  <div className="v">{c.reuseEventsThisWeek}</div>
                </div>
                <div className="kv">
                  <div className="k">Recall hit rate</div>
                  <div className="v">{c.recallHitRatePct}%</div>
                </div>
                <div className="kv">
                  <div className="k">Open memory gaps</div>
                  <div className="v">{c.notCaptured}</div>
                </div>
              </>
            )}
          </QueryState>
        </div>

        <div className="panel">
          <PanelHead label="Evidence readiness" />
          <QueryState q={verify} what="the chain verification" skeletonLines={2}>
            {(v) => (
              <>
                <div className="claim">
                  <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                  <span className="lb">Audit chain</span>
                  <span className="mono t-cap">{v.intact ? 'intact' : `broken at ${v.brokenAtSeq}`}</span>
                </div>
                <div className="claim">
                  <span className="pip p-ok" />
                  <span className="lb">Records</span>
                  <span className="mono t-cap">{v.length} with full provenance</span>
                </div>
              </>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}
