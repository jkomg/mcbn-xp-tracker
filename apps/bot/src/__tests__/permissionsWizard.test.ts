import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';

const { runAudit, runApply, listSnapshots, readSnapshot, restoreSnapshot, defaultSnapshotDir } = vi.hoisted(() => ({
  runAudit: vi.fn(),
  runApply: vi.fn(),
  listSnapshots: vi.fn(),
  readSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  defaultSnapshotDir: vi.fn(() => '/tmp/permission-snapshots'),
}));

vi.mock('../scripts/permissionRemediation/runAll', () => ({ runAudit, runApply }));
vi.mock('../scripts/permissionRemediation/snapshot', () => ({
  listSnapshots,
  readSnapshot,
  restoreSnapshot,
  defaultSnapshotDir,
}));

const STAFF_ID = 'staff-1';
const ADMIN_ROLE_ID = 'admin-role-1';

const cleanReport = {
  mention: { adminRoleIds: [], findings: [] },
  overwrite: { findings: [], totalOverwritesScanned: 0 },
  visibility: { rows: [], assertions: [] },
};

const dirtyReport = {
  mention: {
    adminRoleIds: [],
    findings: [{ kind: 'role_mentionable', roleId: 'role-a', roleName: 'Role A', editable: true }],
  },
  overwrite: {
    findings: [
      {
        kind: 'orphaned_target',
        channelId: 'chan-1',
        channelName: 'general',
        targetId: 'role-ghost',
        targetType: 0,
        allow: '1',
        deny: '0',
        reason: 'role_not_found',
      },
    ],
    totalOverwritesScanned: 1,
  },
  visibility: { rows: [], assertions: [] },
};

async function loadWizard() {
  vi.resetModules();
  vi.stubEnv('BOT_TOKEN', 'test-token');
  vi.stubEnv('WEB_APP_BASE_URL', 'http://127.0.0.1:5001');
  vi.stubEnv('BOT_TESTER_IDS', STAFF_ID);
  vi.stubEnv('STAFF_ROLE_ADMINISTRATOR_ID', ADMIN_ROLE_ID);
  return import('../permissionsWizard');
}

function makeGuild(memberHasAdminRole: boolean) {
  return {
    members: {
      fetch: vi.fn(async (id: string) => ({
        id,
        roles: { cache: { has: (roleId: string) => memberHasAdminRole && roleId === ADMIN_ROLE_ID } },
      })),
    },
  };
}

function makeChatInteraction({ userId = STAFF_ID, guild = makeGuild(true) } = {}) {
  return {
    user: { id: userId, tag: `${userId}#0001` },
    guild,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fetchReply: vi.fn().mockResolvedValue({ id: 'reply-msg-1' }),
  } as unknown as ChatInputCommandInteraction;
}

function makeButtonInteraction({ customId, userId = STAFF_ID, guild = makeGuild(true), messageId = 'reply-msg-1' } = {} as {
  customId: string;
  userId?: string;
  guild?: ReturnType<typeof makeGuild>;
  messageId?: string;
}) {
  return {
    customId,
    user: { id: userId, tag: `${userId}#0001` },
    guild,
    message: { id: messageId },
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ButtonInteraction;
}

describe('permissionsWizard', () => {
  beforeEach(() => {
    runAudit.mockReset();
    runApply.mockReset();
    listSnapshots.mockReset();
    readSnapshot.mockReset();
    restoreSnapshot.mockReset();
  });

  describe('startPermissionsApply gating', () => {
    it('rejects a staff-listed user who lacks the Administrator role', async () => {
      const { startPermissionsApply } = await loadWizard();
      const interaction = makeChatInteraction({ guild: makeGuild(false) });

      await startPermissionsApply(interaction, {} as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Administrator role'), ephemeral: true }),
      );
      expect(runAudit).not.toHaveBeenCalled();
    });

    it('reaches the confirm prompt for a staff admin and stores the pending report', async () => {
      runAudit.mockResolvedValue(dirtyReport);
      const { startPermissionsApply } = await loadWizard();
      const interaction = makeChatInteraction();

      await startPermissionsApply(interaction, {} as never);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('mention issue'),
          components: expect.any(Array),
        }),
      );
      expect(interaction.fetchReply).toHaveBeenCalled();
    });

    it('reports nothing to fix when the audit is clean', async () => {
      runAudit.mockResolvedValue(cleanReport);
      const { startPermissionsApply } = await loadWizard();
      const interaction = makeChatInteraction();

      await startPermissionsApply(interaction, {} as never);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Nothing to fix') }),
      );
      expect(interaction.fetchReply).not.toHaveBeenCalled();
    });
  });

  describe('handlePermissionsApplyButton', () => {
    it('cancel clears pending state without applying', async () => {
      runAudit.mockResolvedValue(dirtyReport);
      const wizard = await loadWizard();
      const startInteraction = makeChatInteraction();
      await wizard.startPermissionsApply(startInteraction, {} as never);

      const cancelInteraction = makeButtonInteraction({ customId: wizard.PERMISSIONS_APPLY_CANCEL_ID });
      const handled = await wizard.handlePermissionsApplyButton(cancelInteraction, {} as never);

      expect(handled).toBe(true);
      expect(cancelInteraction.update).toHaveBeenCalledWith({ content: 'Cancelled.', components: [] });
      expect(runApply).not.toHaveBeenCalled();
    });

    it('re-checks the admin gate on the clicking user, not the original invoker', async () => {
      runAudit.mockResolvedValue(dirtyReport);
      const wizard = await loadWizard();
      const startInteraction = makeChatInteraction(); // admin
      await wizard.startPermissionsApply(startInteraction, {} as never);

      // A different, non-admin user clicks confirm on the (ephemeral, but defense-in-depth) prompt.
      const confirmInteraction = makeButtonInteraction({
        customId: wizard.PERMISSIONS_APPLY_CONFIRM_ID,
        userId: 'someone-else',
        guild: makeGuild(false),
      });
      const handled = await wizard.handlePermissionsApplyButton(confirmInteraction, {} as never);

      expect(handled).toBe(true);
      expect(confirmInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Administrator role') }),
      );
      expect(runApply).not.toHaveBeenCalled();
    });

    it('applies fixes and reports the snapshot path on confirm', async () => {
      runAudit.mockResolvedValue(dirtyReport);
      runApply.mockResolvedValue({
        snapshotPath: '/tmp/snapshot-1.json',
        mention: { fixedMentionableRoleIds: ['role-a'], fixedMentionEveryoneRoleIds: [], fixedOverwrites: [], skipped: [] },
        overwrite: { removedByChannel: [], errors: [] },
      });
      const wizard = await loadWizard();
      const startInteraction = makeChatInteraction();
      await wizard.startPermissionsApply(startInteraction, {} as never);

      const confirmInteraction = makeButtonInteraction({ customId: wizard.PERMISSIONS_APPLY_CONFIRM_ID });
      await wizard.handlePermissionsApplyButton(confirmInteraction, {} as never);

      expect(runApply).toHaveBeenCalled();
      expect(confirmInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('/tmp/snapshot-1.json') }),
      );
    });
  });

  describe('handlePermissionsRollbackButton', () => {
    it('shows session expired when no snapshot was selected', async () => {
      const wizard = await loadWizard();
      const confirmInteraction = makeButtonInteraction({ customId: wizard.PERMISSIONS_ROLLBACK_CONFIRM_ID });

      const handled = await wizard.handlePermissionsRollbackButton(confirmInteraction, {} as never);

      expect(handled).toBe(true);
      expect(confirmInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Session expired') }),
      );
      expect(restoreSnapshot).not.toHaveBeenCalled();
    });

    it('cancel clears pending rollback state', async () => {
      const wizard = await loadWizard();
      const cancelInteraction = makeButtonInteraction({ customId: wizard.PERMISSIONS_ROLLBACK_CANCEL_ID });

      const handled = await wizard.handlePermissionsRollbackButton(cancelInteraction, {} as never);

      expect(handled).toBe(true);
      expect(cancelInteraction.update).toHaveBeenCalledWith({ content: 'Rollback cancelled.', components: [] });
      expect(restoreSnapshot).not.toHaveBeenCalled();
    });
  });
});
