// ---------------------------------------------------------------------------
// BaitPunishSM.ts — Per-barbarian Bait-and-Punish state machine.
//
// One instance lives for the lifetime of each barbarian.
// Only activates when the barbarian holds the BAITER role AND Claude has set
// claudeSuggestsBait = true.
//
// State flow:
//
//   INACTIVE ──► POSITIONING ──► BAIT_ACTIVE ──► PUNISH_READY ──► PUNISHING
//      ▲                │              │                                │
//      └────────────────┘(timeout)     └──(timeout / role change)───────┘
//
//  INACTIVE       → No bait logic running. UtilityAI controls the barbarian.
//  POSITIONING    → Walking into the bait zone (0.8–1.4 m from player).
//  BAIT_ACTIVE    → Standing vulnerable (DUCK posture). Watching player.
//  PUNISH_READY   → Player committed to attack. Holding briefly before counter.
//  PUNISHING      → Executing the counter-attack. Returns to INACTIVE after.
// ---------------------------------------------------------------------------

import type { BarbarianDecision } from '../types/decisions';
import type { BarbarianState, PlayerState } from '../types/gameState';
import type { BarbarianRole } from '../types/actions';
import { logger } from '../utils/logger';

/** Distance window in which baiting is effective. */
const BAIT_ZONE_MIN = 0.8; // meters
const BAIT_ZONE_MAX = 1.6; // meters

/** Give up if player doesn't attack within this window. */
const BAIT_TIMEOUT_MS = 2800;

/**
 * How long to wait after the player starts their attack before punishing.
 * This must exceed the earliest cancel window (150 ms) to ensure the
 * player cannot cancel into a block after seeing the counter coming.
 */
const PUNISH_DELAY_MS = 160;

type BaitState =
  | 'INACTIVE'
  | 'POSITIONING'
  | 'BAIT_ACTIVE'
  | 'PUNISH_READY'
  | 'PUNISHING';

export class BaitPunishSM {
  private state: BaitState = 'INACTIVE';
  private baitStartedAt = 0;
  private playerAttackedAt: number | null = null;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Run one tick of the state machine.
   *
   * Returns a BarbarianDecision if the SM is controlling this barbarian,
   * or null if UtilityAI should decide instead.
   */
  tick(
    barb: BarbarianState,
    player: PlayerState,
    role: BarbarianRole,
    claudeSuggestsBait: boolean,
  ): Omit<BarbarianDecision, 'barbarianId'> | null {
    const now = Date.now();
    const d = barb.distanceToPlayer;

    switch (this.state) {
      // ── INACTIVE ────────────────────────────────────────────────────────────
      case 'INACTIVE': {
        // Activate when: role is BAITER, Claude wants bait, player is nearby.
        if (role === 'BAITER' && claudeSuggestsBait && d < 3.0) {
          this.state = 'POSITIONING';
          this.baitStartedAt = now;
          logger.debug(`[BaitSM ${barb.id}] INACTIVE → POSITIONING`);
        }
        return null; // let UtilityAI decide
      }

      // ── POSITIONING ─────────────────────────────────────────────────────────
      case 'POSITIONING': {
        // Abort if role changed or Claude no longer wants bait.
        if (role !== 'BAITER' || !claudeSuggestsBait) {
          this.reset(barb.id, 'role changed');
          return null;
        }

        // Walk into bait zone.
        if (d > BAIT_ZONE_MAX) {
          const dir = Math.sign(player.position.x - barb.position.x) || 1;
          return this.decision(
            barb.id,
            'CHASE',
            dir,
            200,
            'bait-sm',
            'positioning: closing to bait zone',
          );
        }

        // In zone — start baiting.
        this.state = 'BAIT_ACTIVE';
        this.baitStartedAt = now;
        logger.debug(`[BaitSM ${barb.id}] POSITIONING → BAIT_ACTIVE`);
        // Fall through to BAIT_ACTIVE on next tick.
        return this.decision(
          barb.id,
          'DUCK',
          barb.facingDirection,
          200,
          'bait-sm',
          'entering bait posture',
        );
      }

      // ── BAIT_ACTIVE ─────────────────────────────────────────────────────────
      case 'BAIT_ACTIVE': {
        // Abort conditions.
        if (role !== 'BAITER' || !claudeSuggestsBait) {
          this.reset(barb.id, 'role changed while baiting');
          return null;
        }
        if (now - this.baitStartedAt > BAIT_TIMEOUT_MS) {
          this.reset(barb.id, 'player did not attack — bait timeout');
          return null;
        }

        // Player moved too far — abort.
        if (d > BAIT_ZONE_MAX + 0.5) {
          this.state = 'POSITIONING';
          return this.decision(
            barb.id,
            'CHASE',
            Math.sign(player.position.x - barb.position.x) || 1,
            200,
            'bait-sm',
            'player retreated — repositioning',
          );
        }

        // Player committed to attack — transition to PUNISH_READY.
        if (player.isAttacking && player.attackStartedAt !== null) {
          this.playerAttackedAt = player.attackStartedAt;
          this.state = 'PUNISH_READY';
          logger.debug(
            `[BaitSM ${barb.id}] BAIT_ACTIVE → PUNISH_READY (player attacked)`,
          );
          // Stay in duck posture during the brief punish delay.
          return this.decision(
            barb.id,
            'DUCK',
            barb.facingDirection,
            PUNISH_DELAY_MS,
            'bait-sm',
            'player attacked — waiting for punish window',
          );
        }

        // Hold bait posture.
        return this.decision(
          barb.id,
          'DUCK',
          barb.facingDirection,
          150,
          'bait-sm',
          'holding bait posture',
        );
      }

      // ── PUNISH_READY ────────────────────────────────────────────────────────
      case 'PUNISH_READY': {
        const elapsed = now - (this.playerAttackedAt ?? now);

        if (elapsed >= PUNISH_DELAY_MS) {
          this.state = 'PUNISHING';
          logger.debug(`[BaitSM ${barb.id}] PUNISH_READY → PUNISHING`);
          // Immediately punish — the decision returned here IS the punish.
        } else {
          // Still holding — keep duck posture.
          return this.decision(
            barb.id,
            'DUCK',
            barb.facingDirection,
            80,
            'bait-sm',
            'holding pre-punish duck',
          );
        }
        // Fall through to PUNISHING.
      }

      // ── PUNISHING ───────────────────────────────────────────────────────────
      case 'PUNISHING': {
        const dir =
          Math.sign(player.position.x - barb.position.x) ||
          barb.facingDirection;
        // Return to INACTIVE after issuing the counter-attack.
        this.reset(barb.id, 'punish complete');
        return this.decision(
          barb.id,
          'PUNISH',
          dir,
          320,
          'punish-sm',
          'counter-attacking after bait',
        );
      }
    }
  }

  /** Whether this SM is currently controlling the barbarian. */
  isActive(): boolean {
    return this.state !== 'INACTIVE';
  }

  /** Force-reset to INACTIVE (e.g., barbarian died and was respawned). */
  forceReset(): void {
    this.state = 'INACTIVE';
    this.playerAttackedAt = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private reset(id: string, reason: string): void {
    logger.debug(`[BaitSM ${id}] reset — ${reason}`);
    this.state = 'INACTIVE';
    this.playerAttackedAt = null;
  }

  private decision(
    barbarianId: string,
    action: BarbarianDecision['action'],
    direction: number,
    durationMs: number,
    strategyTag: string,
    reasoning: string,
  ): Omit<BarbarianDecision, 'barbarianId'> {
    return { action, direction, durationMs, strategyTag, reasoning };
  }
}
