import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { jsonConfigSchema } from '../src/scorers/schema';

describe('schema generation', () => {
  it('toJSONSchema does not throw and is strict', () => {
    const schema = z.toJSONSchema(jsonConfigSchema) as any;
    expect(schema.additionalProperties).toBe(false);
  });
});
