import { expect, test } from 'vitest'
import type { EvalConfig, EvalResult } from '../src'

test('types are exported', () => {
  // Verify that types can be imported
  const config: EvalConfig = {
    name: 'test',
    prompt: 'test prompt',
    projectDir: '/tmp/test'
  }

  expect(config.name).toBe('test')
})

test('scorers are exported', async () => {
  const { scorers } = await import('../src')

  // Verify scorers are available
  expect(scorers).toBeDefined()
  expect(typeof scorers.buildSuccess).toBe('function')
  expect(typeof scorers.testSuccess).toBe('function')
  expect(typeof scorers.lintSuccess).toBe('function')
})
