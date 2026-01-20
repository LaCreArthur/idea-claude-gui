import { describe, it, expect } from 'vitest';

describe('Test Infrastructure', () => {
  it('vitest is configured correctly', () => {
    expect(true).toBe(true);
  });

  it('assertions work', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toContain('ell');
  });
});
