import { z } from "zod";

// Zod's z.object() fast path probes for eval support with `new Function("")`.
// Under our CSP (no 'unsafe-eval', see src/proxy.ts) the throw is swallowed,
// but the browser still reports a CSP violation (#1448). jitless skips the
// probe; it must run before any client-side schema is constructed, which is
// what instrumentation-client guarantees.
z.config({ jitless: true });
