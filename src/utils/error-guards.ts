/**
 * Type guards for error handling
 */

/**
 * Type guard to check if an error is a Node.js errno exception
 */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Error & { code?: unknown }).code === "string"
  );
}