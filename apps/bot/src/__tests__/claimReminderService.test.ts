import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    playerWebUrl: 'https://mcbn.example/player/',
  },
}));

import { buildClaimReminderText } from '../services/claimReminderService';

describe('buildClaimReminderText', () => {
  it('uses player portal url call-to-action when provided', () => {
    const message = buildClaimReminderText(
      'Night 88',
      'Lucien',
      '123456789',
      'https://mcbn.example/player/',
    );

    expect(message).toContain('Submit your claim at https://mcbn.example/player/.');
    expect(message).not.toContain('/xp submit');
  });

  it('uses player portal fallback call-to-action when url missing', () => {
    const message = buildClaimReminderText('Night 88', 'Lucien', '123456789');

    expect(message).toContain('Open the player portal to submit your claim.');
    expect(message).not.toContain('/xp submit');
  });
});
