/**
 * Error Classification for Retry Logic
 * 
 * Classifies errors to determine retry behavior and circuit breaker actions.
 */

export type ErrorCategory = 
  | "RETRYABLE_TRANSIENT"    // Network timeouts, rate limits, temporary service issues
  | "RETRYABLE_IDEMPOTENT"   // Safe to retry operations (GET, idempotent actions)
  | "NON_RETRYABLE_CLIENT"   // Client errors (400, 401, 403, 404, validation errors)
  | "NON_RETRYABLE_FATAL"    // Fatal errors (out of memory, syntax errors)
  | "CIRCUIT_BREAKER";       // Errors that should trigger circuit breaker

export interface ErrorClassification {
  category: ErrorCategory;
  shouldRetry: boolean;
  shouldTriggerCircuitBreaker: boolean;
  retryDelay?: number; // Custom delay for this error type
  reason: string;
}

/**
 * HTTP status codes that are typically retryable
 */
const RETRYABLE_HTTP_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  507, // Insufficient Storage
  509, // Bandwidth Limit Exceeded
  510, // Not Extended
]);

/**
 * HTTP status codes that should never be retried
 */
const NON_RETRYABLE_HTTP_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  406, // Not Acceptable
  409, // Conflict
  410, // Gone
  411, // Length Required
  412, // Precondition Failed
  413, // Payload Too Large
  414, // URI Too Long
  415, // Unsupported Media Type
  416, // Range Not Satisfiable
  417, // Expectation Failed
  418, // I'm a teapot
  421, // Misdirected Request
  422, // Unprocessable Entity
  423, // Locked
  424, // Failed Dependency
  426, // Upgrade Required
  428, // Precondition Required
  431, // Request Header Fields Too Large
  451, // Unavailable For Legal Reasons
]);

/**
 * Error messages that indicate transient issues
 */
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /connection.*reset/i,
  /connection.*refused/i,
  /network.*error/i,
  /temporary.*failure/i,
  /service.*unavailable/i,
  /rate.*limit/i,
  /quota.*exceeded/i,
  /throttle/i,
  /busy/i,
  /overload/i,
];

/**
 * Error messages that indicate fatal issues
 */
const FATAL_ERROR_PATTERNS = [
  /out of memory/i,
  /stack overflow/i,
  /syntax error/i,
  /parse error/i,
  /invalid.*syntax/i,
  /compilation.*failed/i,
  /permission.*denied/i,
  /access.*denied/i,
  /authentication.*failed/i,
  /authorization.*failed/i,
  /invalid.*credentials/i,
  /malformed/i,
  /corrupt/i,
];

/**
 * Error messages that should trigger circuit breaker
 */
const CIRCUIT_BREAKER_PATTERNS = [
  /service.*down/i,
  /service.*unavailable/i,
  /connection.*failed/i,
  /upstream.*error/i,
  /backend.*error/i,
  /database.*error/i,
  /external.*service.*error/i,
];

/**
 * Classify an error to determine retry behavior
 */
export function classifyError(error: unknown): ErrorClassification {
  const errorMessage = getErrorMessage(error);
  const httpStatus = getHttpStatus(error);

  // Check for HTTP status codes first
  if (httpStatus !== null) {
    if (NON_RETRYABLE_HTTP_CODES.has(httpStatus)) {
      return {
        category: "NON_RETRYABLE_CLIENT",
        shouldRetry: false,
        shouldTriggerCircuitBreaker: false,
        reason: `HTTP ${httpStatus} - client error, not retryable`,
      };
    }

    if (RETRYABLE_HTTP_CODES.has(httpStatus)) {
      const retryDelay = httpStatus === 429 ? 5000 : undefined; // Longer delay for rate limits
      return {
        category: "RETRYABLE_TRANSIENT",
        shouldRetry: true,
        shouldTriggerCircuitBreaker: httpStatus >= 500, // Server errors trigger circuit breaker
        retryDelay,
        reason: `HTTP ${httpStatus} - server error, retryable`,
      };
    }
  }

  // Check for circuit breaker patterns
  for (const pattern of CIRCUIT_BREAKER_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        category: "CIRCUIT_BREAKER",
        shouldRetry: true,
        shouldTriggerCircuitBreaker: true,
        reason: `Circuit breaker pattern matched: ${pattern.source}`,
      };
    }
  }

  // Check for fatal error patterns
  for (const pattern of FATAL_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        category: "NON_RETRYABLE_FATAL",
        shouldRetry: false,
        shouldTriggerCircuitBreaker: false,
        reason: `Fatal error pattern matched: ${pattern.source}`,
      };
    }
  }

  // Check for transient error patterns
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        category: "RETRYABLE_TRANSIENT",
        shouldRetry: true,
        shouldTriggerCircuitBreaker: false,
        reason: `Transient error pattern matched: ${pattern.source}`,
      };
    }
  }

  // Check for specific error types
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return {
      category: "NON_RETRYABLE_FATAL",
      shouldRetry: false,
      shouldTriggerCircuitBreaker: false,
      reason: `${error.constructor.name} - programming error, not retryable`,
    };
  }

  // Default: treat as retryable but don't trigger circuit breaker
  return {
    category: "RETRYABLE_IDEMPOTENT",
    shouldRetry: true,
    shouldTriggerCircuitBreaker: false,
    reason: "Unknown error type, defaulting to retryable",
  };
}

/**
 * Extract error message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  
  return String(error);
}

/**
 * Extract HTTP status code from error if available
 */
function getHttpStatus(error: unknown): number | null {
  // Check common HTTP error properties
  if (error && typeof error === "object") {
    // Fetch API Response
    if ("status" in error && typeof error.status === "number") {
      return error.status;
    }
    
    // Axios-style error
    if ("response" in error && error.response && typeof error.response === "object" && "status" in error.response) {
      return error.response.status as number;
    }
    
    // Node.js HTTP error
    if ("statusCode" in error && typeof error.statusCode === "number") {
      return error.statusCode;
    }
    
    // Some libraries use code
    if ("code" in error && typeof error.code === "number") {
      return error.code;
    }
  }
  
  return null;
}

/**
 * Check if an error is retryable based on classification
 */
export function isRetryableError(error: unknown): boolean {
  return classifyError(error).shouldRetry;
}

/**
 * Check if an error should trigger circuit breaker
 */
export function shouldTriggerCircuitBreaker(error: unknown): boolean {
  return classifyError(error).shouldTriggerCircuitBreaker;
}

/**
 * Get recommended retry delay for an error
 */
export function getRetryDelay(error: unknown, baseDelay: number = 1000): number {
  const classification = classifyError(error);
  return classification.retryDelay || baseDelay;
}