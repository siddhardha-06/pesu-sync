// Loaded with `node --import` before the tests: redirects `next/headers` to the test stub.
import { registerHooks } from 'node:module';

const stub = new URL('./next-headers.cjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/headers') return { url: stub, format: 'commonjs', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
