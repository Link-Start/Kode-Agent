/**
 * AgentSupervisor — Resource limits and lifecycle governance for SubAgents.
 *
 * Enforces:
 *   - Execution wall-clock timeout (default 5 min)
 *   - Hard turn cap (default 200)
 *   - Concurrent agent count limit (default 10)
 *
 * Usage:
 *   const supervisor = AgentSupervisor.acquire(agentId, { maxExecutionTimeMs })
 *   // ... in query loop:
 *   supervisor.checkLimits(currentTurn)   // throws if exceeded
 *   // ... on completion:
 *   supervisor.release()
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AgentLimitsConfig {
  /** Maximum wall-clock execution time in ms. Default: 300_000 (5 min). */
  maxExecutionTimeMs?: number
  /** Hard upper bound on turns regardless of user input. Default: 200. */
  maxTurnsHardCap?: number
  /** Maximum number of concurrent agents. Default: 10. */
  concurrentAgentLimit?: number
}

const DEFAULT_MAX_EXECUTION_TIME_MS = 300_000 // 5 minutes
const DEFAULT_MAX_TURNS_HARD_CAP = 200
const DEFAULT_CONCURRENT_AGENT_LIMIT = 10

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AgentTimeoutError extends Error {
  readonly agentId: string
  readonly elapsedMs: number

  constructor(agentId: string, elapsedMs: number, limitMs: number) {
    super(
      `Agent "${agentId}" exceeded execution timeout: ${Math.round(elapsedMs / 1000)}s > ${Math.round(limitMs / 1000)}s limit`,
    )
    this.name = 'AgentTimeoutError'
    this.agentId = agentId
    this.elapsedMs = elapsedMs
  }
}

export class AgentTurnLimitError extends Error {
  readonly agentId: string
  readonly turns: number

  constructor(agentId: string, turns: number, limit: number) {
    super(
      `Agent "${agentId}" exceeded turn limit: ${turns} >= ${limit} turns`,
    )
    this.name = 'AgentTurnLimitError'
    this.turns = turns
    this.agentId = agentId
  }
}

export class AgentConcurrencyLimitError extends Error {
  readonly currentCount: number
  readonly limit: number

  constructor(currentCount: number, limit: number) {
    super(
      `Cannot spawn new agent: ${currentCount} agents already running (limit: ${limit})`,
    )
    this.name = 'AgentConcurrencyLimitError'
    this.currentCount = currentCount
    this.limit = limit
  }
}

// ---------------------------------------------------------------------------
// Supervisor Instance
// ---------------------------------------------------------------------------

export class AgentSupervisor {
  private static activeAgents = new Map<string, AgentSupervisor>()

  readonly agentId: string
  readonly startedAt: number
  readonly maxExecutionTimeMs: number
  readonly maxTurnsHardCap: number

  private released = false

  private constructor(agentId: string, config: AgentLimitsConfig) {
    this.agentId = agentId
    this.startedAt = Date.now()
    this.maxExecutionTimeMs =
      config.maxExecutionTimeMs ?? DEFAULT_MAX_EXECUTION_TIME_MS
    this.maxTurnsHardCap =
      config.maxTurnsHardCap ?? DEFAULT_MAX_TURNS_HARD_CAP
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Acquire a supervisor slot for a new agent.
   * Throws AgentConcurrencyLimitError if the limit is reached.
   */
  static acquire(
    agentId: string,
    config?: AgentLimitsConfig,
  ): AgentSupervisor {
    const limit =
      config?.concurrentAgentLimit ?? DEFAULT_CONCURRENT_AGENT_LIMIT

    if (AgentSupervisor.activeAgents.size >= limit) {
      throw new AgentConcurrencyLimitError(
        AgentSupervisor.activeAgents.size,
        limit,
      )
    }

    const supervisor = new AgentSupervisor(agentId, config ?? {})
    AgentSupervisor.activeAgents.set(agentId, supervisor)
    return supervisor
  }

  /**
   * Release the supervisor slot when the agent completes (success or failure).
   * Safe to call multiple times.
   */
  release(): void {
    if (this.released) return
    this.released = true
    AgentSupervisor.activeAgents.delete(this.agentId)
  }

  // -------------------------------------------------------------------------
  // Checks (call after each turn in the query loop)
  // -------------------------------------------------------------------------

  /**
   * Check resource limits. Throws if any limit is exceeded.
   * Should be called after each turn completes.
   */
  checkLimits(currentTurn: number): void {
    this.checkTimeout()
    this.checkTurnLimit(currentTurn)
  }

  private checkTimeout(): void {
    const elapsed = Date.now() - this.startedAt
    if (elapsed > this.maxExecutionTimeMs) {
      throw new AgentTimeoutError(
        this.agentId,
        elapsed,
        this.maxExecutionTimeMs,
      )
    }
  }

  private checkTurnLimit(currentTurn: number): void {
    if (currentTurn >= this.maxTurnsHardCap) {
      throw new AgentTurnLimitError(
        this.agentId,
        currentTurn,
        this.maxTurnsHardCap,
      )
    }
  }

  // -------------------------------------------------------------------------
  // Observability
  // -------------------------------------------------------------------------

  /** Current number of active (unreleased) agents. */
  static get activeCount(): number {
    return AgentSupervisor.activeAgents.size
  }

  /** Elapsed time since this agent started. */
  get elapsedMs(): number {
    return Date.now() - this.startedAt
  }

  // -------------------------------------------------------------------------
  // Test utilities
  // -------------------------------------------------------------------------

  /** Reset all state. Only for tests. */
  static __resetForTests(): void {
    AgentSupervisor.activeAgents.clear()
  }
}
