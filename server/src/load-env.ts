/**
 * Load .env from monorepo root so that pnpm --filter imagiverse-server dev
 * picks up the root .env (cwd is server/, so root is ..).
 */
import path from 'node:path';
import { config } from 'dotenv';

const rootDir = path.resolve(process.cwd(), '..');
config({ path: path.join(rootDir, '.env') });
