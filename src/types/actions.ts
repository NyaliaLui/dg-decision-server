// ---------------------------------------------------------------------------
// actions.ts — All action/role/strategy enumerations for the decision server.
// ---------------------------------------------------------------------------

/**
 * Every discrete action a Barbarian can execute in a given decision tick.
 * The client maps these to the matching animation + physics state in Barbarian.tsx.
 */
export type BarbarianAction =
  | 'IDLE' // stand still, no animation override
  | 'CHASE' // walk directly toward the player
  | 'RETREAT' // walk away from the player to buy time
  | 'FLANK' // circle to the player's blind side
  | 'ATTACK' // punch combo (activates hand collider)
  | 'KICK' // kick at medium range
  | 'JUMP' // leap — sets jumpPendingRef on client
  | 'LEFT_BLOCK' // block incoming attack from the left
  | 'RIGHT_BLOCK' // block incoming attack from the right
  | 'DUCK' // duck — also used as bait posture
  | 'BAIT' // stand vulnerable to invite player attack (bait state machine)
  | 'PUNISH'; // counter-attack immediately after player commits

/**
 * Squad role assigned each tick by CoordinationLayer.
 * Roles influence UtilityAI score weights and BaitPunishSM activation.
 */
export type BarbarianRole =
  | 'ATTACKER' // primary damage dealer — closes gap and attacks relentlessly
  | 'FLANKER' // approaches from player's blind side before attacking
  | 'BAITER' // runs the bait-and-punish state machine
  | 'SUPPORT'; // hangs back, waits for an opening (used when HP is critical)

/**
 * High-level squad strategy set by Claude AI every ~2 seconds.
 * Shapes how CoordinationLayer assigns roles and how UtilityAI weights scores.
 */
export type SquadStrategy =
  | 'AGGRESSIVE' // all warriors close in and attack without hesitation
  | 'COORDINATED' // distinct roles enforced: attacker + flanker combo
  | 'BAIT_HEAVY' // at least one warrior always baiting player attacks
  | 'DEFENSIVE' // wounded warriors retreat; only healthy ones engage
  | 'OVERWHELM'; // all warriors converge simultaneously (timed to player special)
