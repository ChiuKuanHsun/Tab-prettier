import { describe, expect, it } from 'vitest';
import { PERF, tierFor } from '../lib/perf';

describe('tierFor', () => {
  it('trusts a GPU unless memory is very short', () => {
    expect(tierFor({ webgpu: true, memoryGB: 8, cores: 8 })).toBe('high');
    expect(tierFor({ webgpu: true, memoryGB: 2, cores: 4 })).toBe('medium');
  });

  it('goes low on the CPU, unless the machine is big', () => {
    expect(tierFor({ webgpu: false, memoryGB: 4, cores: 4 })).toBe('low');
    expect(tierFor({ webgpu: false, memoryGB: 8, cores: 4 })).toBe('low');
    expect(tierFor({ webgpu: false, memoryGB: 8, cores: 12 })).toBe('medium');
  });

  it('assumes an ordinary machine when the browser hides memory and cores', () => {
    expect(tierFor({ webgpu: true })).toBe('high');
    expect(tierFor({ webgpu: false })).toBe('low');
  });
});

describe('PERF budgets', () => {
  it('asks less of each lower tier', () => {
    expect(PERF.low.candidates).toBeLessThan(PERF.medium.candidates);
    expect(PERF.medium.candidates).toBeLessThan(PERF.high.candidates);
    expect(PERF.low.depth).toBe(false);
    expect(PERF.low.idleOnly).toBe(true);
    expect(PERF.high.idleOnly).toBe(false);
  });
});
