import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { jsonConfigSchema } from '../src/scorers/schema';

const schema = z.toJSONSchema(jsonConfigSchema);
writeFileSync(path.join(process.cwd(), 'schema.json'), JSON.stringify(schema, null, 2) + '\n');
console.log('Wrote schema.json');
