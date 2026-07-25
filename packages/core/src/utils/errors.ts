// ---------------------------------------------------------------------------
// Base error hierarchy for Kode-CLI.
// All domain-specific errors should extend KodeError to enable structured
// error handling, consistent serialization, and cause-chain propagation.
// ---------------------------------------------------------------------------

/**
 * Root error class for all Kode domain errors.
 * Provides a machine-readable `code` field and optional `cause` chain.
 */
export class KodeError extends Error {
  /** Machine-readable error code (e.g. 'TOOL_EXECUTION_FAILED') */
  readonly code: string
  /** Original error that caused this one (for error chaining) */
  override readonly cause?: unknown

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'KodeError'
    this.code = options?.code ?? 'KODE_ERROR'
    this.cause = options?.cause
  }
}

// ---------------------------------------------------------------------------
// Tool execution errors
// ---------------------------------------------------------------------------

/** Thrown when a tool fails during execution. */
export class ToolExecutionError extends KodeError {
  readonly toolName: string

  constructor(
    toolName: string,
    message: string,
    options?: { code?: string; cause?: unknown },
  ) {
    super(message, { code: options?.code ?? 'TOOL_EXECUTION_FAILED', cause: options?.cause })
    this.name = 'ToolExecutionError'
    this.toolName = toolName
  }
}

/** Thrown when tool input validation fails. */
export class ToolValidationError extends KodeError {
  readonly toolName: string

  constructor(
    toolName: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, { code: 'TOOL_VALIDATION_FAILED', cause: options?.cause })
    this.name = 'ToolValidationError'
    this.toolName = toolName
  }
}

// ---------------------------------------------------------------------------
// Permission errors
// ---------------------------------------------------------------------------

/** Thrown when a permission check denies an operation. */
export class PermissionDeniedError extends KodeError {
  readonly toolName?: string
  readonly permissionMode?: string

  constructor(
    message: string,
    options?: { toolName?: string; permissionMode?: string; cause?: unknown },
  ) {
    super(message, { code: 'PERMISSION_DENIED', cause: options?.cause })
    this.name = 'PermissionDeniedError'
    this.toolName = options?.toolName
    this.permissionMode = options?.permissionMode
  }
}

// ---------------------------------------------------------------------------
// Network / Provider errors
// ---------------------------------------------------------------------------

/** Thrown on network or API provider failures. */
export class NetworkError extends KodeError {
  /** Whether the operation can be safely retried. */
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(
    message: string,
    options?: { retryable?: boolean; statusCode?: number; cause?: unknown },
  ) {
    super(message, { code: 'NETWORK_ERROR', cause: options?.cause })
    this.name = 'NetworkError'
    this.retryable = options?.retryable ?? false
    this.statusCode = options?.statusCode
  }
}

/** Thrown when an AI model provider returns an error. */
export class ProviderError extends KodeError {
  readonly provider: string
  readonly retryable: boolean

  constructor(
    provider: string,
    message: string,
    options?: { retryable?: boolean; code?: string; cause?: unknown },
  ) {
    super(message, { code: options?.code ?? 'PROVIDER_ERROR', cause: options?.cause })
    this.name = 'ProviderError'
    this.provider = provider
    this.retryable = options?.retryable ?? false
  }
}

// ---------------------------------------------------------------------------
// Agent errors
// ---------------------------------------------------------------------------

/** Thrown when an agent operation fails. */
export class AgentError extends KodeError {
  readonly agentType?: string
  readonly agentId?: string

  constructor(
    message: string,
    options?: { agentType?: string; agentId?: string; code?: string; cause?: unknown },
  ) {
    super(message, { code: options?.code ?? 'AGENT_ERROR', cause: options?.cause })
    this.name = 'AgentError'
    this.agentType = options?.agentType
    this.agentId = options?.agentId
  }
}

/** Thrown when an agent exceeds its resource limits. */
export class AgentResourceLimitError extends AgentError {
  constructor(
    message: string,
    options?: { agentType?: string; agentId?: string; cause?: unknown },
  ) {
    super(message, { ...options, code: 'AGENT_RESOURCE_LIMIT' })
    this.name = 'AgentResourceLimitError'
  }
}

// ---------------------------------------------------------------------------
// Configuration errors
// ---------------------------------------------------------------------------

/** Thrown when configuration is invalid or cannot be loaded. */
export class ConfigurationError extends KodeError {
  readonly configPath?: string

  constructor(
    message: string,
    options?: { configPath?: string; cause?: unknown },
  ) {
    super(message, { code: 'CONFIGURATION_ERROR', cause: options?.cause })
    this.name = 'ConfigurationError'
    this.configPath = options?.configPath
  }
}

// ---------------------------------------------------------------------------
// MCP errors
// ---------------------------------------------------------------------------

/** Thrown on MCP server connection or communication failures. */
export class McpError extends KodeError {
  readonly serverName: string

  constructor(
    serverName: string,
    message: string,
    options?: { code?: string; cause?: unknown },
  ) {
    super(message, { code: options?.code ?? 'MCP_ERROR', cause: options?.cause })
    this.name = 'McpError'
    this.serverName = serverName
  }
}

// ---------------------------------------------------------------------------
// Legacy errors (preserved for backward compatibility)
// ---------------------------------------------------------------------------

export class MalformedCommandError extends TypeError {}

export class DeprecatedCommandError extends Error {}

export class AbortError extends Error {}

export { ConfigParseError } from '#config/errors'
