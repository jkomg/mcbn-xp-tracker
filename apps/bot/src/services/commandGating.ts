/**
 * Per-command/subcommand kill switches, driven by `liveConfig.disabledCommands`
 * (staff-editable from the web dashboard's Settings page — see
 * apps/web/app/blueprints/settings.py's toggle_bot_command route).
 *
 * A bare token ("xp") disables the whole command, cascading to every
 * subcommand. A dotted token ("xp.submit", "lasombra.permissions.apply")
 * disables just that leaf. Staff (config.testerDiscordIds) always bypass —
 * this module only answers "is it disabled," callers decide whether to
 * enforce that for a given user.
 */

export function buildDisableTokens(
  commandName: string,
  subcommandGroup: string | null,
  subcommand: string | null,
): string[] {
  if (!subcommand) {
    return [commandName];
  }
  const leaf = subcommandGroup
    ? `${commandName}.${subcommandGroup}.${subcommand}`
    : `${commandName}.${subcommand}`;
  return [leaf, commandName];
}

export function isAnyTokenDisabled(tokens: string[], disabledSet: Set<string>): boolean {
  return tokens.some((token) => disabledSet.has(token));
}
