import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

type Chunk = { type: 'chunk'; fileName: string; facadeModuleId: string | null; imports: string[] };
type Bundle = Record<string, Chunk | { type: 'asset' }>;
const routeModules: Record<string, string[]> = {
  '/': ['MapHome', 'MapView'],
  '/map': ['MapHome', 'MapView'],
  '/feed': ['LocalFeed'],
  '/profile': ['ProfileView'],
  '/profile/edit': ['ProfileEdit'],
  '/messages': ['DirectMessages'],
  '/cruush': ['CruushActivity'],
  '/settings': ['Settings'],
};

export function routePreloadFiles(bundle: Bundle) {
  const chunks = Object.values(bundle).filter((entry): entry is Chunk => entry.type === 'chunk');
  return Object.fromEntries(Object.entries(routeModules).map(([route, modules]) => {
    const files = new Set<string>();
    const add = (file: string) => {
      if (files.has(file)) return;
      const chunk = bundle[file];
      if (chunk?.type !== 'chunk') return;
      files.add(file);
      chunk.imports.forEach(add);
    };
    for (const name of modules) {
      const chunk = chunks.find((entry) => entry.facadeModuleId?.replaceAll('\\', '/').endsWith(`/src/app/components/${name}.tsx`));
      if (chunk) add(chunk.fileName);
    }
    return [route, [...files]];
  }));
}

/** Fetch the requested route while the entry bundle downloads; execute it only through React's existing lazy boundary. */
export function routePreload(): Plugin {
  let base = '/';
  return {
    name: 'cruush-route-preload',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { base = config.base; },
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (html?.type !== 'asset' || typeof html.source !== 'string') return;
      const routes = routePreloadFiles(bundle);
      const source = routePreloadScript(routes, base);
      const fileName = `assets/route-preload-${createHash('sha256').update(source).digest('hex').slice(0,10)}.js`;
      this.emitFile({ type: 'asset', fileName, source });
      html.source = html.source.replace('</head>', `<script async src="${base}${fileName}"></script>\n    </head>`);
    },
  };
}

export function routePreloadScript(routes: Record<string, string[]>, base: string) {
  return `(function(){var q=new URLSearchParams(location.search);if(['verifyEmailToken','resetPasswordToken','confirmEmailToken'].some(function(k){return q.has(k)}))return;var routes=${JSON.stringify(routes)},route=location.pathname;if(route.length>1&&route.endsWith('/'))route=route.slice(0,-1);var files=routes[route]||[];files.forEach(function(file){var href=new URL(${JSON.stringify(base)}+file,document.baseURI).href;if(Array.from(document.querySelectorAll('link[rel="modulepreload"],script[type="module"]')).some(function(e){return(e.href||e.src)===href}))return;var link=document.createElement('link');link.rel='modulepreload';link.crossOrigin='';link.href=href;document.head.appendChild(link)})})();`;
}
