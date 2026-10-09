# MapLibre 5.24.0 security backport

The package is pinned to 5.24.0 and patched during the frozen pnpm install.
The Docker build copies this directory before dependency installation.

This backports the static attribute snapshot from the upstream fix for
[GHSA-jrc7-96c5-q579](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579):
iterate `Array.from(elem.attributes)` before removing unsafe attributes, so
removing one cannot skip the next item in the live attribute collection.
The source, normal and CSP development bundles, and both minified runtime
bundles contain the same fix. Source maps are unchanged.

The version-based advisory may still be reported for 5.24.0. This is not a
claim that an unpatched 5.24.0 is safe or that the version audit is clean.
`src/app/lib/maplibreAttributionSecurity.test.ts` exercises the installed
runtime with adjacent unsafe attributes and preserves safe attribution links.
Remove this backport only with a separately verified upgrade containing the
upstream fix; the 6.x major upgrade is not part of this security-only change.
