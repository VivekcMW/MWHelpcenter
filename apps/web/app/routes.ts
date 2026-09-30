import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/redirect.ts'),
  route('robots.txt', 'routes/resources/robots.ts'),
  route('sitemap.xml', 'routes/resources/sitemap.ts'),
  route('language', 'routes/language-switch.ts'),
  route(':locale', 'routes/locale.tsx', [
    index('routes/home.tsx'),
    route('products/:slug', 'routes/product.tsx'),
    route('collections/:slug', 'routes/collection.tsx'),
    route('articles/:slug', 'routes/article.tsx'),
    route('search', 'routes/search.tsx'),
    route('support', 'routes/support.tsx'),
    route('*', 'routes/not-found.tsx'),
  ]),
] satisfies RouteConfig