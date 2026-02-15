/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by temporarily stopping requests to failing services.
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing) -> CLOSED/OPEN
 */

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting to close the circuit */
  resetTimeout: number;
  /** Time window in ms for counting failures */
  monitoringPeriod: number;
  /** Optional name for logging */
  name?: string;
}

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: "CircuitBreaker",
      ...options,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.state = "HALF_OPEN";
        console.log(`[${this.options.name}] Circuit breaker transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker is OPEN. Next attempt at ${new Date(this.nextAttemptTime!).toISOString()}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  canExecute(): boolean {
    if (this.state === "CLOSED" || this.state === "HALF_OPEN") {
      return true;
    }
    
    if (this.state === "OPEN") {
      return this.shouldAttemptReset();
    }
    
    return false;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    console.log(`[${this.options.name}] Circuit breaker reset to CLOSED`);
  }

  private onSuccess(): void {
    this.successes++;
    
    if (this.state === "HALF_OPEN") {
      // Success in half-open state means we can close the circuit
      this.state = "CLOSED";
      this.failures = 0;
      this.nextAttemptTime = undefined;
      console.log(`[${this.options.name}] Circuit breaker closed after successful test`);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      // Failure in half-open state means we go back to open
      this.state = "OPEN";
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
      console.log(`[${this.options.name}] Circuit breaker opened after failed test`);
    } else if (this.state === "CLOSED" && this.failures >= this.options.failureThreshold) {
      // Too many failures in closed state, open the circuit
      this.state = "OPEN";
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
      console.log(`[${this.options.name}] Circuit breaker opened after ${this.failures} failures`);
    }
  }

  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime !== undefined && Date.now() >= this.nextAttemptTime;
  }
}

/**
 * Global circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private static breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker for a specific key
   */
  static getOrCreate(key: string, options: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker({
        ...options,
        name: options.name || key,
      }));
    }
    return this.breakers.get(key)!;
  }

  /**
   * Get all registered circuit breakers
   */
  static getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Remove a circuit breaker
   */
  static remove(key: string): boolean {
    return this.breakers.delete(key);
  }
}