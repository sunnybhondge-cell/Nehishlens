import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditApi, PacksApi, type EvidencePack, type PackScope } from '../api/endpoints';
import { api, type ApiError } from '../api/client';
import { useHydrated } from '../hooks/useHydrated';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, QueryState } from '../components/ui';

/**
 * Route /audit/packs/new — Assurance only. Scope → review checks → inspect
 * gaps → export. Kept apart from the trail: building a pack is an action with
 * a named person behind it, the trail is a record. Access is the server's
 * call — a lens without pack:create sees GET /packs refuse, in its words.
 */
export function PackBuilder() {
  const packs = useQuery<EvidencePack[], ApiError>({ queryKey: ['packs'], queryFn: PacksApi.list });

  return (
    <div className="stack">
      <ScreenHeader
        title="Evidence pack builder"
        crumb={<Link to="/audit">← Audit</Link>}
        subtitle="/audit/packs/new · Assurance"
      />
      <Trace>Scope → review checks → inspect gaps → export. A separate workflow from the trail.</Trace>

      {packs.error?.status === 403 ? (
        <div className="denied">
          <div className="t-label">Not granted</div>
          <div className="msg">{packs.error.message}</div>
          <Link className="btn btn-s" to="/audit">
            Back to the audit trail
          </Link>
        </div>
      ) : (
        <>
          <Builder />
          <div className="panel">
            <PanelHead label="Recent packs" />
            <QueryState q={{ data: packs.data, isLoading: packs.isLoading, error: packs.error }} what="the pack list" skeletonLines={2}>
              {(list) =>
                list.length === 0 ? (
                  <p className="muted">No packs built yet.</p>
                ) : (
                  <>
                    {list.map((p) => (
                      <div className="kv" key={p.id}>
                        <div className="k mono">
                          {p.id} · {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
                        </div>
                        <div className="v mono">
                          {p.status} · {p.rows?.toLocaleString() ?? '—'} rows · {p.gaps?.length ?? 0} gap(s) declared
                        </div>
                      </div>
                    ))}
                  </>
                )
              }
            </QueryState>
          </div>
        </>
      )}
    </div>
  );
}

function Builder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<PackScope>({ range: '30', types: 'all', systems: 'all' });
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [packId, setPackId] = useState<string | null>(null);

  const verify = useHydrated(['audit-verify'], AuditApi.verify);
  // The live count as scope changes; its gaps are part of what the pack will say.
  const preview = useQuery({ queryKey: ['pack-preview', scope], queryFn: () => PacksApi.preview(scope) });
  const gaps = preview.data?.gaps ?? [];
  const undeclared = gaps.filter((g) => !acknowledged.has(g.id));

  const create = useMutation<EvidencePack, ApiError>({
    mutationFn: () =>
      PacksApi.create(
        scope,
        user?.id ?? '',
        gaps.filter((g) => acknowledged.has(g.id)).map((g) => g.id),
      ),
    onSuccess: (p) => {
      setPackId(p.id);
      qc.invalidateQueries({ queryKey: ['packs'] });
    },
  });

  const setScopeField = <K extends keyof PackScope>(key: K, value: PackScope[K]) => {
    setScope((s) => ({ ...s, [key]: value }));
    setPackId(null);
    create.reset();
  };

  return (
    <>
      <div className="panel">
        <PanelHead label="1 · Scope the request" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label>
            <div className="t-cap" style={{ marginBottom: 5 }}>Date range</div>
            <select className="sel" value={scope.range} onChange={(e) => setScopeField('range', e.target.value as PackScope['range'])}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label>
            <div className="t-cap" style={{ marginBottom: 5 }}>Action types</div>
            <select className="sel" value={scope.types} onChange={(e) => setScopeField('types', e.target.value as PackScope['types'])}>
              <option value="all">All actions</option>
              <option value="human">Human actions only</option>
              <option value="ai">AI actions only</option>
            </select>
          </label>
          <label>
            <div className="t-cap" style={{ marginBottom: 5 }}>Systems</div>
            <select className="sel" value={scope.systems} disabled>
              <option value="all">All systems</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          {preview.error ? (
            <ApiErrorBanner error={preview.error as ApiError} what="the scope preview" />
          ) : (
            <span className="mono t-cap">
              {preview.data
                ? `${preview.data.rows.toLocaleString()} rows · ${preview.data.artifacts} artifacts · ${preview.data.sources} sources · ~${preview.data.estSeconds}s to build`
                : 'Counting…'}
            </span>
          )}
        </div>
      </div>

      <div className="panel">
        <PanelHead label="2 · Review the checks" />
        <QueryState q={verify} what="the chain verification" skeletonLines={2}>
          {(v) => (
            <>
              <div className="claim">
                <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                <span className="lb">Integrity</span>
                <span className="mono t-cap">{v.intact ? 'chain intact' : `broken at seq ${v.brokenAtSeq}`}</span>
              </div>
              <div className="claim">
                <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                <span className="lb">Continuity</span>
                <span className="mono t-cap">
                  {v.intact ? `${v.length} of ${v.length} rows` : `rows after seq ${v.brokenAtSeq} unverified`}
                </span>
              </div>
              <div className="claim">
                <span className={`pip ${gaps.length ? 'p-warn' : 'p-ok'}`} />
                <span className="lb">Coverage</span>
                <span className="mono t-cap">
                  {preview.data ? (gaps.length ? `${gaps.length} gap(s) — declared below` : 'no gaps in this scope') : '…'}
                </span>
              </div>
            </>
          )}
        </QueryState>
      </div>

      <div className="panel">
        <PanelHead label="3 · Inspect the gaps" />
        {!preview.data ? (
          <p className="muted">Waiting for the scope preview…</p>
        ) : gaps.length === 0 ? (
          <p className="muted">No coverage gaps in this scope.</p>
        ) : (
          <>
            <p className="t-cap" style={{ marginBottom: 8 }}>
              The pack will state each of these as coverage it does not claim. Acknowledge each one to include that
              statement — a completeness claim that omits what was not covered is worse than no claim.
            </p>
            {gaps.map((g) => (
              <label key={g.id} className="claim" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={acknowledged.has(g.id)}
                  onChange={(e) =>
                    setAcknowledged((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(g.id);
                      else next.delete(g.id);
                      return next;
                    })
                  }
                  style={{ marginTop: 3 }}
                />
                <span>
                  <b>{g.source}</b>
                  <br />
                  <span className="t-cap">{g.reason}</span>
                </span>
              </label>
            ))}
          </>
        )}
      </div>

      <div className="panel">
        <PanelHead label="4 · Export" />
        {!packId ? (
          <>
            <button
              className="btn btn-p"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={!preview.data || undeclared.length > 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Starting build…' : 'Build signed evidence pack'}
            </button>
            {preview.data && undeclared.length > 0 && (
              <p className="t-cap" style={{ marginTop: 8 }}>
                Acknowledge {undeclared.length} gap{undeclared.length === 1 ? '' : 's'} in step 3 first.
              </p>
            )}
            <p className="t-cap" style={{ marginTop: 8 }}>
              Requested by <b>{user?.id}</b>. The export is recorded in the audit trail.
            </p>
            {create.error && <ApiErrorBanner error={create.error} what="the pack build" />}
          </>
        ) : (
          <PackStatus packId={packId} />
        )}
      </div>
    </>
  );
}

/** Polls GET /packs/{id} while it is building — the loading state is real. */
function PackStatus({ packId }: { packId: string }) {
  const qc = useQueryClient();
  const pack = useQuery<EvidencePack, ApiError>({
    queryKey: ['pack', packId],
    queryFn: () => PacksApi.get(packId),
    refetchInterval: (q) => (q.state.data?.status === 'building' || !q.state.data ? 1000 : false),
  });
  const ready = pack.data?.status === 'ready';

  // The export writes pack.exported into the trail; find that row so the confirmation links to it.
  const exported = useQuery({
    queryKey: ['audit', 'pack-exported', packId],
    queryFn: () => AuditApi.search({ q: packId }),
    enabled: ready,
    select: (page) => page.items.find((e) => e.verb === 'pack.exported' && e.object === packId),
  });
  useEffect(() => {
    // The new row also changes the chain length shown by verify and the trail.
    if (ready) void qc.invalidateQueries({ queryKey: ['audit-verify'] });
  }, [ready, qc]);

  const download = useMutation<void, ApiError>({
    mutationFn: async () => {
      const blob = await api.download(pack.data!.downloadUrl!);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${packId}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  });

  if (pack.error) return <ApiErrorBanner error={pack.error} what="the pack status" />;
  if (!pack.data || pack.data.status === 'building')
    return (
      <div className="claim">
        <span className="pip p-warn" />
        <span className="lb">Building</span>
        <span className="mono t-cap">{packId} — assembling and signing…</span>
      </div>
    );

  const p = pack.data;
  return (
    <>
      <div className="claim">
        <span className="pip p-ok" />
        <span className="lb">{p.status}</span>
        <span className="mono t-cap">{p.id}</span>
      </div>
      {[
        ['Rows', p.rows?.toLocaleString()],
        ['Signed by', p.signedBy],
        ['Signed at', p.signedAt && new Date(p.signedAt).toLocaleString()],
        ['Gaps declared', String(p.gaps?.length ?? 0)],
      ].map(([k, v]) => (
        <div className="kv" key={k}>
          <div className="k">{k}</div>
          <div className="v mono">{v ?? '—'}</div>
        </div>
      ))}
      <div className="kv">
        <div className="k">Manifest hash</div>
        <div className="v mono wrap-anywhere">{p.manifestHash ?? '—'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {exported.data ? (
          <Link className="btn btn-s" to={`/audit/${exported.data.hash.slice(0, 8)}`}>
            View the pack.exported audit entry →
          </Link>
        ) : (
          <span className="t-cap">{exported.isLoading ? 'Finding the audit entry…' : 'Audit entry not found yet.'}</span>
        )}
        {p.downloadUrl && (
          <button type="button" className="btn btn-s btn-p" disabled={download.isPending} onClick={() => download.mutate()}>
            {download.isPending ? 'Downloading…' : 'Download pack'}
          </button>
        )}
      </div>
      {download.error && <ApiErrorBanner error={download.error} what="the pack download" />}
    </>
  );
}
