/**
 * Maps a citation `target` from the API to an app route. The API speaks in its
 * own resource paths (`runs/2026-07-28`, `resolutions/res-1204`); linking those
 * verbatim lands on the catch-all route and bounces to Today.
 */
export function appRoute(target: string): string {
  const t = target.replace(/^[#/]+/, '');
  const [head, ...rest] = t.split('/');
  const tail = rest.join('/');
  switch (head) {
    case 'runs':
      return `/eod/${tail}`;
    case 'resolutions':
      return `/corpus/${tail}`;
    case 'sources':
      return `/sources/${tail}`;
    default:
      return `/${t}`;
  }
}
