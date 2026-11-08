import { config } from "zod";

// zod's one-time `new Function("")` JIT probe trips our CSP (no 'unsafe-eval'):
// the browser reports a script-src violation even though zod catches the throw.
// jitless skips the probe; this file loads before any client module builds a schema.
config({ jitless: true });
