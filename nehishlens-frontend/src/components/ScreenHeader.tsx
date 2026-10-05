import type { ReactNode } from 'react';

/** `.chead` block from the prototype — crumb, title, subtitle, accent rule. */
export function ScreenHeader({
  title,
  subtitle,
  crumb,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="chead">
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          {crumb != null && <div className="crumb">{crumb}</div>}
          <h1 className="t-title">{title}</h1>
          {subtitle != null && (
            <div className="t-cap mono" style={{ marginTop: 3 }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions}
      </div>
      <div className="ul" />
    </div>
  );
}
