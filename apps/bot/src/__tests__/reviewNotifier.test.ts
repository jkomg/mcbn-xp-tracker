import { describe, expect, it } from 'vitest';
import type { ClaimReviewEvent, SpendReviewEvent } from '../types';
import { buildReviewNotificationMessage } from '../services/reviewNotifier';

describe('review notifier message formatting', () => {
  it('adds sheet upload instruction for approved spends', () => {
    const event: SpendReviewEvent = {
      eventKey: 'spend:1:approved:1',
      kind: 'spend',
      rowIndex: 1,
      characterName: 'Alice',
      status: 'approved',
      reviewedBy: 'Storyteller',
      reviewDate: '20260309 12:00:00',
      reviewedAtEpoch: 1,
      staffNotes: 'Looks good.',
      spendCategory: 'Attribute',
      traitName: 'Strength',
      currentDots: 2,
      newDots: 3,
      requestedCost: 15,
      verifiedCost: 15,
      playerDiscordId: '123456789012345678',
    };

    const message = buildReviewNotificationMessage(event);
    expect(message).toContain('**XP Spend** Approved for Alice <@123456789012345678>');
    expect(message).toContain('Next step: upload your updated character sheet and notify a system helper.');
  });

  it('does not add sheet upload instructions for denied spends', () => {
    const event: SpendReviewEvent = {
      eventKey: 'spend:2:denied:2',
      kind: 'spend',
      rowIndex: 2,
      characterName: 'Bob',
      status: 'denied',
      reviewedBy: 'Storyteller',
      reviewDate: '20260309 12:00:00',
      reviewedAtEpoch: 2,
      staffNotes: 'Need more RP support.',
      spendCategory: 'Skill',
      traitName: 'Stealth',
      currentDots: 1,
      newDots: 2,
      requestedCost: 6,
      verifiedCost: 0,
    };

    const message = buildReviewNotificationMessage(event);
    expect(message).not.toContain('Next step: upload your updated character sheet and notify a system helper.');
  });

  it('does not add sheet upload instructions for approved claims', () => {
    const event: ClaimReviewEvent = {
      eventKey: 'claim:1:approved:1',
      kind: 'claim',
      rowIndex: 1,
      characterName: 'Charlie',
      status: 'approved',
      reviewedBy: 'Storyteller',
      reviewDate: '20260309 12:00:00',
      reviewedAtEpoch: 1,
      staffNotes: '',
      playPeriod: 'Night 77',
      requestedXp: 5,
      approvedXp: 5,
    };

    const message = buildReviewNotificationMessage(event);
    expect(message).toContain('**XP Claim** Approved for Charlie');
    expect(message).not.toContain('Next step: please upload your updated character sheet in this cubby.');
    expect(message).not.toContain('**Helper requested:** @system helper');
  });

  it('omits mention when playerDiscordId is absent', () => {
    const event: ClaimReviewEvent = {
      eventKey: 'claim:2:approved:2',
      kind: 'claim',
      rowIndex: 2,
      characterName: 'Dana',
      status: 'approved',
      reviewedBy: 'Storyteller',
      reviewDate: '20260309 12:10:00',
      reviewedAtEpoch: 2,
      staffNotes: '',
      playPeriod: 'Night 77',
      requestedXp: 3,
      approvedXp: 3,
    };

    const message = buildReviewNotificationMessage(event);
    expect(message).toContain('**XP Claim** Approved for Dana');
    expect(message).not.toContain('<@');
  });
});
