// `server-only` throws on import outside a React Server Component, which would
// make every server-side module untestable. Vitest aliases the package to this
// no-op so adapters and services can be unit tested directly.
export {};
