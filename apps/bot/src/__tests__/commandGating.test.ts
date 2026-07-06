import { describe, expect, it } from 'vitest';
import { buildDisableTokens, isAnyTokenDisabled } from '../services/commandGating';

describe('buildDisableTokens', () => {
  it('returns just the command name when there is no subcommand', () => {
    expect(buildDisableTokens('ping', null, null)).toEqual(['ping']);
  });

  it('returns the leaf + command name for a flat subcommand', () => {
    expect(buildDisableTokens('xp', null, 'submit')).toEqual(['xp.submit', 'xp']);
  });

  it('returns the leaf + command name for a subcommand-group subcommand', () => {
    expect(buildDisableTokens('lasombra', 'permissions', 'apply')).toEqual([
      'lasombra.permissions.apply',
      'lasombra',
    ]);
  });
});

describe('isAnyTokenDisabled', () => {
  it('is false when nothing in the disabled set matches', () => {
    const disabled = new Set(['cobweb']);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, 'submit'), disabled)).toBe(false);
  });

  it('is true when the specific leaf token is disabled', () => {
    const disabled = new Set(['xp.submit']);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, 'submit'), disabled)).toBe(true);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, 'summary'), disabled)).toBe(false);
  });

  it('cascades: disabling the whole command disables every subcommand', () => {
    const disabled = new Set(['xp']);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, 'submit'), disabled)).toBe(true);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, 'summary'), disabled)).toBe(true);
    expect(isAnyTokenDisabled(buildDisableTokens('xp', null, null), disabled)).toBe(true);
  });

  it('cascades through a subcommand group when the whole command is disabled', () => {
    const disabled = new Set(['lasombra']);
    expect(isAnyTokenDisabled(buildDisableTokens('lasombra', 'permissions', 'apply'), disabled)).toBe(true);
  });

  it('a command with no subcommands is disabled only by its own bare token', () => {
    const disabled = new Set(['ping']);
    expect(isAnyTokenDisabled(buildDisableTokens('ping', null, null), disabled)).toBe(true);
    expect(isAnyTokenDisabled(buildDisableTokens('cobweb', null, null), disabled)).toBe(false);
  });
});
