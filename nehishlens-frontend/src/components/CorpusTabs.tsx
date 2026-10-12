import { Link } from 'react-router-dom';
import { useLens } from '../context/LensContext';
import { isRouteAllowed } from '../nav';

/**
 * Resolutions / Sources tab row shared by the two Corpus screens (CR-02).
 * Sources is a tab inside Corpus, deliberately not a rail destination — §6.1
 * caps the rail at seven and Engineering already uses all seven.
 */
export function CorpusTabs({ active }: { active: 'resolutions' | 'sources' }) {
  const { lens } = useLens();
  const tab = (key: 'resolutions' | 'sources', to: string, label: string) => (
    <Link
      className={`ctab${active === key ? ' on' : ''}`}
      to={to}
      aria-current={active === key ? 'page' : undefined}
    >
      {label}
    </Link>
  );
  return (
    <div className="corpus-tabs" role="group" aria-label="Corpus sections">
      {tab('resolutions', '/corpus', 'Resolutions')}
      {/* Same menu rule as the rail: exec has no Sources route. */}
      {isRouteAllowed(lens, '/sources') && tab('sources', '/sources', 'Sources')}
      <span className="ctab-cap">
        Corpus is what the system knows — earned memory, plus given knowledge.
      </span>
    </div>
  );
}
