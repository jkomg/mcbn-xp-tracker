import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ config: { lasombraCommandName: 'lasombra' } }));

import { isRequestEntityTooLarge } from '../commands/lasombra';

describe('isRequestEntityTooLarge', () => {
  it('matches the error Discord throws when an attachment exceeds the guild upload cap', () => {
    expect(isRequestEntityTooLarge(new Error('Request entity too large'))).toBe(true);
    expect(isRequestEntityTooLarge(new Error('413: Request Entity Too Large'))).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isRequestEntityTooLarge(new Error('Missing Access'))).toBe(false);
    expect(isRequestEntityTooLarge(new Error('Unknown Channel'))).toBe(false);
  });

  it('does not throw on non-Error values', () => {
    expect(isRequestEntityTooLarge('some string')).toBe(false);
    expect(isRequestEntityTooLarge(null)).toBe(false);
    expect(isRequestEntityTooLarge(undefined)).toBe(false);
  });
});
