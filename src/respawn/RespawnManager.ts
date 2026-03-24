// ---------------------------------------------------------------------------
// RespawnManager.ts — Reinforcement spawn system.
//
// Design:
//  • When a barbarian dies, it enters a dead queue with a computed delay.
//  • Delay formula: max(3 s, 3 s + aliveCount × 3 s)
//      aliveCount = 0 → 3 s   (immediate pressure, squad wiped)
//      aliveCount = 1 → 6 s
//      aliveCount = 2 → 9 s
//      aliveCount = 3 → 12 s  (plenty of allies — reinforcements slower)
//  • tick() is called every 100 ms; it emits SpawnMessage[] for any entries
//    whose timer has fired.
//  • Spawn positions are chosen at a natural distance from the player (4–8
//    units) so barbarians reach the player within 1–2 seconds at MOVE_SPEED=3.
//    Multiple barbarians are spread across 8 angular slots (45° apart) so they
//    never overlap.
//  • Each spawn gets a fresh unique ID so it is treated as a new component
//    on the client.
// ---------------------------------------------------------------------------

import type { SpawnMessage } from '../types/decisions';
import type { EnvironmentState, Vector3 } from '../types/gameState';
import { logger } from '../utils/logger';

/** Minimum spawn delay regardless of alive count. */
const MIN_DELAY_MS = 3000;
/** Additional delay added per living barbarian at the time of death. */
const PER_ALIVE_DELAY_MS = 3000;
/** Minimum spawn distance from the player (units). At MOVE_SPEED=3 → ~1.3 s. */
const MIN_SPAWN_DIST = 4;
/** Maximum spawn distance from the player (units). At MOVE_SPEED=3 → ~2.7 s. */
const MAX_SPAWN_DIST = 8;
/** Number of angular slots evenly spaced around the player (45° apart). */
const ANGLE_SLOTS = 8;
/** How many recent spawn angles to remember (to avoid reusing the same slot). */
const RECENT_ANGLE_MEMORY = 4;
/** Delay between simultaneous spawns so they don't land at the same position. */
const STAGGER_MS = 1500;

interface DeadEntry {
  /** Original id (for logging); the spawn uses a new id. */
  originalId: string;
  /** Fresh id the respawned barbarian will carry. */
  respawnId: string;
  diedAt: number;
  respawnAt: number;
}

export class RespawnManager {
  private queue: DeadEntry[] = [];
  private counter = 0;
  private recentAngles: number[] = [];

  // ---------------------------------------------------------------------------
  // Called by MessageHandler when a BARBARIAN_DIED message arrives.
  // ---------------------------------------------------------------------------

  onBarbarianDied(barbarianId: string, aliveCount: number): void {
    const delay = this.calculateDelay(aliveCount);
    const now = Date.now();
    const entry: DeadEntry = {
      originalId: barbarianId,
      respawnId: `barbarian-r${++this.counter}`,
      diedAt: now,
      respawnAt: now + delay,
    };
    this.queue.push(entry);
    logger.info(
      `RespawnManager: ${barbarianId} queued — will spawn as ${entry.respawnId} in ${delay / 1000} s (${aliveCount} alive)`,
    );
  }

  // ---------------------------------------------------------------------------
  // Called every 100 ms from the main decision loop.
  // Returns any SpawnMessages that are ready to be sent to the client.
  // ---------------------------------------------------------------------------

  tick(environment: EnvironmentState, playerPosition: Vector3): SpawnMessage[] {
    const now = Date.now();
    const ready: DeadEntry[] = [];
    const remaining: DeadEntry[] = [];

    for (const entry of this.queue) {
      if (now >= entry.respawnAt) {
        ready.push(entry);
      } else {
        remaining.push(entry);
      }
    }

    // Only spawn one per tick; stagger the rest so each gets a distinct position.
    const toSpawn = ready.slice(0, 1);
    const deferred = ready.slice(1).map((entry, i) => ({
      ...entry,
      respawnAt: now + STAGGER_MS * (i + 1),
    }));

    this.queue = [...remaining, ...deferred];

    return toSpawn.map((entry) => {
      const spawnPos = this.getSpawnPosition(environment, playerPosition);
      const entryDir = this.getEntryDirection(spawnPos, playerPosition);

      logger.info(
        `RespawnManager: spawning ${entry.respawnId} at x=${spawnPos.x.toFixed(1)} z=${spawnPos.z.toFixed(1)} (entry dir ${entryDir > 0 ? '+X' : '-X'})`,
      );

      return {
        type: 'SPAWN' as const,
        spawn: {
          barbarianId: entry.respawnId,
          spawnPosition: spawnPos,
          entryDirection: entryDir,
          delayMs: now - entry.diedAt,
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private calculateDelay(aliveCount: number): number {
    return Math.max(
      MIN_DELAY_MS,
      MIN_DELAY_MS + aliveCount * PER_ALIVE_DELAY_MS,
    );
  }

  /**
   * Choose a spawn position at a natural distance from the player so the
   * barbarian can close the gap within 1–2 seconds of game time.
   * The angle is picked from 8 evenly-spaced slots (45° apart) to ensure
   * multiple barbarians spawn at distinct positions without overlapping.
   */
  private getSpawnPosition(env: EnvironmentState, playerPos: Vector3): Vector3 {
    const angle = this.pickSpawnAngle();
    const dist =
      MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);

    const rawX = playerPos.x + Math.cos(angle) * dist;
    const rawZ = playerPos.z + Math.sin(angle) * dist;

    // Clamp to world bounds so spawns never fall off the arena.
    const x = Math.max(
      env.worldBounds.minX,
      Math.min(env.worldBounds.maxX, rawX),
    );
    const z = Math.max(
      env.worldBounds.minZ,
      Math.min(env.worldBounds.maxZ, rawZ),
    );

    return {
      x,
      y: env.groundY + 0.9, // standard character body offset above ground
      z,
    };
  }

  /**
   * Pick the angular slot (in radians) that is farthest from recently used
   * slots so consecutive spawns land at different positions around the player.
   */
  private pickSpawnAngle(): number {
    const step = (2 * Math.PI) / ANGLE_SLOTS;
    const candidates: number[] = Array.from(
      { length: ANGLE_SLOTS },
      (_, i) => step * i,
    );

    let best = candidates[0];
    let bestScore = -Infinity;

    for (const angle of candidates) {
      const distFromRecent =
        this.recentAngles.length === 0
          ? Infinity
          : Math.min(
              ...this.recentAngles.map((ra) => {
                const diff = Math.abs(angle - ra) % (2 * Math.PI);
                return Math.min(diff, 2 * Math.PI - diff);
              }),
            );
      if (distFromRecent > bestScore) {
        bestScore = distFromRecent;
        best = angle;
      }
    }

    this.recentAngles.push(best);
    if (this.recentAngles.length > RECENT_ANGLE_MEMORY) {
      this.recentAngles.shift();
    }

    return best;
  }

  /**
   * The barbarian should walk toward the center/player side of the arena.
   * Returns 1 (move right) or -1 (move left).
   */
  private getEntryDirection(spawnPos: Vector3, playerPos: Vector3): number {
    return Math.sign(playerPos.x - spawnPos.x) || 1;
  }
}
