/**
 * Public asset paths. The data under public/blackbox is fetched at run time, so
 * the URL has to follow the app's base (`/` on the portfolio, `/blackbox/` on a
 * GitHub Pages project site). Vite injects BASE_URL at build time.
 */
const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
export function publicUrl(rel) {
  return base.replace(/\/?$/, '/') + 'blackbox/' + rel.replace(/^\//, '')
}
