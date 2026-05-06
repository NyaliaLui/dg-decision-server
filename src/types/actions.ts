// ---------------------------------------------------------------------------
// actions.ts — All action/role/strategy enumerations for the decision server.
// ---------------------------------------------------------------------------

/**
 * Every discrete action a Barbarian can execute in a given decision tick.
 * The client maps these to the matching animation + physics state in Barbarian.tsx.
 */
export type BarbarianAction =
  | 'CHASE'   // walk directly toward the player
  | 'ATTACK'  // punch combo (activates hand collider)
  | 'JUMP';   // leap — sets jumpPendingRef on client

/**
 * Squad role assigned each tick by CoordinationLayer.
 * RushStrategy uses ATTACKER for all barbarians.
 */
export type BarbarianRole = 'ATTACKER';

/**
 * High-level squad strategy set by Claude AI every ~2 seconds.
 * Shapes how UtilityAI weights scores and overall aggression level.
 */
export type SquadStrategy =
  | 'AGGRESSIVE'   // all warriors close in and attack without hesitation
  | 'COORDINATED'  // balanced default — one attacker, coordinated approach
  | 'DEFENSIVE'    // wounded warriors retreat; only healthy ones engage
  | 'OVERWHELM'    // all warriors converge simultaneously (timed to player special)
  | 'RUSH';        // all barbarians spawn and immediately rush the player
