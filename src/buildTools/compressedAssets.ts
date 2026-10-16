import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

/** Keep the original assets as fallback; only their transport encoding changes. */
export function compressedAssets(): Plugin {
  return {
    name: 'cruush-compressed-assets',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [fileName, entry] of Object.entries(bundle)) {
          if (!fileName.startsWith('assets/') || !/\.(js|css)$/.test(fileName)) continue;
          const source = Buffer.from(entry.type === 'chunk' ? entry.code : entry.source);
          if (source.length < 1024) continue;
          const encoded = {
            br: brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
            gz: gzipSync(source, { level: 9 }),
          };
          for (const [extension, bytes] of Object.entries(encoded)) {
            if (bytes.length < source.length) {
              this.emitFile({ type: 'asset', fileName: `${fileName}.${extension}`, source: bytes });
            }
          }
        }
      },
    },
  };
}
