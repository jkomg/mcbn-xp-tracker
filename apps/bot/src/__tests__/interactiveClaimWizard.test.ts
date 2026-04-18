import { describe, expect, it, vi } from 'vitest';
import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
  handleClaimWizardButton,
  handleClaimWizardModal,
  handleClaimWizardSelect,
} from '../interactiveClaimWizard';

const NO_ACTIVE_WIZARD_MESSAGE = 'No active claim wizard. Open the player portal to submit your claim.';

describe('interactiveClaimWizard stale-session fallbacks', () => {
  it('returns portal guidance when select interaction has no active draft', async () => {
    const reply = vi.fn();
    const interaction = {
      customId: 'xp:submit:character',
      user: { id: 'user-no-draft-select' },
      values: ['Any'],
      reply,
    } as unknown as StringSelectMenuInteraction;

    const handled = await handleClaimWizardSelect(interaction);

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith({ content: NO_ACTIVE_WIZARD_MESSAGE, ephemeral: true });
  });

  it('returns portal guidance when button interaction has no active draft', async () => {
    const reply = vi.fn();
    const interaction = {
      customId: 'xp:submit:confirm',
      user: { id: 'user-no-draft-button' },
      reply,
    } as unknown as ButtonInteraction;

    const handled = await handleClaimWizardButton(interaction, {} as never);

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith({ content: NO_ACTIVE_WIZARD_MESSAGE, ephemeral: true });
  });

  it('returns portal guidance when links modal submit has no active draft', async () => {
    const reply = vi.fn();
    const interaction = {
      customId: 'xp:submit:links-modal:posted_once',
      user: { id: 'user-no-draft-modal' },
      reply,
    } as unknown as ModalSubmitInteraction;

    const handled = await handleClaimWizardModal(interaction);

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith({ content: NO_ACTIVE_WIZARD_MESSAGE, ephemeral: true });
  });
});
