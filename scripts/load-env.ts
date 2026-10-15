// Loads .env / .env.local exactly like Next.js does, for standalone scripts and tests.
// Import this FIRST in any script that touches the databases.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
