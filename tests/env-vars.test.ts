import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateEnvironmentVariables, validateEnvironmentVariables } from '../src/env-generator';
import type { EvalConfig, EnvGeneratorContext } from '../src/types';

describe('Environment Variable Generation', () => {
  const mockContext: EnvGeneratorContext = {
    iteration: 0,
    evalName: 'test-eval',
    totalIterations: 3
  };

  it('should return empty object when no env vars configured', async () => {
    const config: Partial<EvalConfig> = {};
    const result = await generateEnvironmentVariables(config as EvalConfig, mockContext);
    expect(result).toEqual({});
  });

  it('should return static env vars', async () => {
    const config: Partial<EvalConfig> = {
      environmentVariables: {
        NODE_ENV: 'test',
        API_KEY: 'test-key'
      }
    };
    const result = await generateEnvironmentVariables(config as EvalConfig, mockContext);
    expect(result).toEqual({
      NODE_ENV: 'test',
      API_KEY: 'test-key'
    });
  });

  it('should generate dynamic env vars from function', async () => {
    const config: Partial<EvalConfig> = {
      environmentVariables: (ctx) => ({
        ITERATION: String(ctx.iteration),
        DB_NAME: `test_${ctx.iteration}`
      })
    };
    const result = await generateEnvironmentVariables(config as EvalConfig, mockContext);
    expect(result).toEqual({
      ITERATION: '0',
      DB_NAME: 'test_0'
    });
  });

  it('should support async generators', async () => {
    const config: Partial<EvalConfig> = {
      environmentVariables: async (ctx) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ASYNC_VALUE: `async-${ctx.iteration}`
        };
      }
    };
    const result = await generateEnvironmentVariables(config as EvalConfig, mockContext);
    expect(result).toEqual({
      ASYNC_VALUE: 'async-0'
    });
  });

  it('should validate env var names', () => {
    expect(() => validateEnvironmentVariables({ VALID_NAME: 'value' })).not.toThrow();
    expect(() => validateEnvironmentVariables({ _UNDERSCORE: 'value' })).not.toThrow();
    expect(() => validateEnvironmentVariables({ 'INVALID-NAME': 'value' })).toThrow();
    expect(() => validateEnvironmentVariables({ '123START': 'value' })).toThrow();
  });

  it('should warn about critical system vars', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnvironmentVariables({ PATH: '/custom/path' });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Overriding system environment variable')
    );
    consoleSpy.mockRestore();
  });

  it('should handle context with different iterations', async () => {
    const config: Partial<EvalConfig> = {
      environmentVariables: (ctx) => ({
        ITER: String(ctx.iteration),
        EVAL_NAME: ctx.evalName,
        TOTAL: String(ctx.totalIterations || 0)
      })
    };

    const ctx1: EnvGeneratorContext = { iteration: 0, evalName: 'test', totalIterations: 5 };
    const result1 = await generateEnvironmentVariables(config as EvalConfig, ctx1);
    expect(result1.ITER).toBe('0');

    const ctx2: EnvGeneratorContext = { iteration: 4, evalName: 'test', totalIterations: 5 };
    const result2 = await generateEnvironmentVariables(config as EvalConfig, ctx2);
    expect(result2.ITER).toBe('4');
  });

  it('should throw on invalid value types', () => {
    expect(() => validateEnvironmentVariables({ VAR: 123 as any })).toThrow(
      'must be a string'
    );
  });
});
