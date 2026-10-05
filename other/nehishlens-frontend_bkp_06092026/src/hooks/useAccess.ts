import { useLocation } from 'react-router-dom';
import { useLens } from '../context/LensContext';
import { accessFor, type Access } from '../nav';

/**
 * Access level of the current lens for the current route (or a given path).
 * `readOnly` is true when the lens has `view` (not `full`) access — screens use
 * it to suppress write controls.
 */
export function useAccess(path?: string): { access: Access; readOnly: boolean } {
  const { lens } = useLens();
  const { pathname } = useLocation();
  const access = accessFor(lens, path ?? pathname);
  return { access, readOnly: access === 'view' };
}
