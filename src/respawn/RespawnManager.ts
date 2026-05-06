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
//  • Spawn positions are chosen randomly along the grass path X axis (minX–maxX)
//    at a minimum distance from the player so they don't spawn on top of them.
//  • A proactive check ensures alive + queued barbarians never fall below
//    targetBarbarianCount — if they do, an extra entry is inserted immediately.
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

  tick(environment: EnvironmentState, playerPosition: Vector3, aliveCount: number): SpawnMessage[] {
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

    // Proactive: if alive + queued < target, add an extra entry immediately.
    const target = environment.targetBarbarianCount ?? 1;
    const totalAccountedFor = aliveCount + remaining.length + ready.length;
    if (totalAccountedFor < target) {
      ready.push({
        originalId: 'proactive',
        respawnId: `barbarian-r${++this.counter}`,
        diedAt: now,
        respawnAt: now,
      });
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
   * Choose a spawn position 12–20 units left or right of the player along the
   * X axis (Z = 0), clamped to the grass path bounds.  This keeps barbarians
   * just off-screen so the player can see them approach.
   */
  private getSpawnPosition(env: EnvironmentState, playerPos: Vector3): Vector3 {
    const MIN_DIST = 8;
    const MAX_DIST = 15;
    const side = Math.random() < 0.5 ? -1 : 1;
    const dist = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
    const x = Math.max(
      env.worldBounds.minX,
      Math.min(env.worldBounds.maxX, playerPos.x + side * dist),
    );
    return { x, y: env.groundY + 0.9, z: 0 };
  }

  /**
   * The barbarian should walk toward the center/player side of the arena.
   * Returns 1 (move right) or -1 (move left).
   */
  private getEntryDirection(spawnPos: Vector3, playerPos: Vector3): number {
    return Math.sign(playerPos.x - spawnPos.x) || 1;
  }
}
