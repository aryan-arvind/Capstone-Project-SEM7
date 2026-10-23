// Loads the parameter file once. Tests and the runner can pass a modified copy instead.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'config', 'params.json');
export const loadParams = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
export const PARAMS = loadParams();
