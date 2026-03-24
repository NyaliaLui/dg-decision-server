// ---------------------------------------------------------------------------
// strategyPrompt.ts — Builds the Claude system + user prompt for squad strategy.
//
// Claude is asked to output a strict JSON object so the response can be parsed
// deterministically without regex or heuristics. The schema is embedded in the
// prompt and enforced via instructions.
// ---------------------------------------------------------------------------

import type { GameState } from '../../types/gameState';

export interface StrategyPromptContext {
  state: GameState;
  playerAttackPattern: 'aggressive' | 'reactive' | 'unknown';
  playerHPTrend: 'falling' | 'stable' | 'rising';
  currentStrategy: string;
}

// ---------------------------------------------------------------------------
// System prompt — sets Claude's role and output format contract.
// This is sent as the `system` parameter to the Anthropic API.
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `\
You are the squad AI commander for a group of Barbarian warriors in a 3D fighting game.
Your warriors must defeat the player by reducing their HP to 0.

You will receive a JSON description of the current game state and must respond with a
tactical strategy decision in strict JSON format. No prose, no explanation outside the
JSON object, no markdown code fences.

OUTPUT FORMAT (respond with this exact JSON structure, nothing else):
{
  "strategy": "<STRATEGY_NAME>",
  "claudeSuggestsBait": <true|false>,
  "reasoning": "<one sentence — 20 words max>"
}

VALID STRATEGY NAMES:
  AGGRESSIVE   — All warriors close in and attack without hesitation.
  COORDINATED  — Assign distinct roles: one attacker, one flanker. Balanced default.
  BAIT_HEAVY   — At least one warrior always baiting. Best vs. aggressive players.
  DEFENSIVE    — Wounded warriors retreat; only healthy ones engage.
  OVERWHELM    — All warriors converge simultaneously, timed to player special attack.

WHEN TO SET claudeSuggestsBait = true:
  - The player attacks frequently (aggressive pattern).
  - At least one barbarian has HP > 1 to spare as bait.
  - BAIT_HEAVY strategy is chosen.

TACTICAL GUIDELINES:
  - BAIT_HEAVY punishes players who attack impulsively.
  - AGGRESSIVE breaks through passive, defensive players.
  - OVERWHELM is high-risk: only use when player.isAttacking = true (special attack) so they cannot cancel.
  - DEFENSIVE preserves warriors long enough for reinforcements to spawn.
  - If the player's HP trend is "falling", current strategy is working — maintain or escalate.
  - If the player's HP trend is "rising", current strategy is failing — switch.
`;

// ---------------------------------------------------------------------------
// User prompt — built per call with live game state.
// ---------------------------------------------------------------------------

export function buildStrategyPrompt(ctx: StrategyPromptContext): string {
  const { state, playerAttackPattern, playerHPTrend, currentStrategy } = ctx;
  const { player, barbarians } = state;
  const alive = barbarians.length;

  const avgDist =
    alive > 0
      ? (
          barbarians.reduce((s, b) => s + b.distanceToPlayer, 0) / alive
        ).toFixed(1)
      : 'N/A';

  const lowestHP = alive > 0 ? Math.min(...barbarians.map((b) => b.hp)) : 'N/A';

  const healthyCount = barbarians.filter((b) => b.hp > 1).length;

  const playerAttackDesc = player.isAttacking
    ? `YES — type: ${player.attackType ?? 'unknown'}`
    : 'NO';

  return `CURRENT GAME STATE:

Player:
  hp: ${player.hp} / ${player.maxHp}
  hp_trend: ${playerHPTrend}
  attack_pattern: ${playerAttackPattern}
  currently_attacking: ${playerAttackDesc}
  is_jumping: ${player.isJumping}
  is_crouching: ${player.isCrouching}

Squad:
  barbarians_alive: ${alive}
  healthy_barbarians (hp > 1): ${healthyCount}
  lowest_barbarian_hp: ${lowestHP}
  average_distance_to_player: ${avgDist} m

Current strategy: ${currentStrategy}

Choose the best strategy for the next 2 seconds.`;
}
