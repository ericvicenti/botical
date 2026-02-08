import { describe, it, expect } from "bun:test";
import {
  BoticalError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  ConfigurationError,
  isBoticalError,
  wrapError,
} from "@/utils/errors.ts";

describe("BoticalError", () => {
  it("creates error with message, code, and statusCode", () => {
    const error = new BoticalError("Test error", "TEST_ERROR", 400);

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe("BoticalError");
  });

  it("defaults to 500 status code", () => {
    const error = new BoticalError("Test error", "TEST_ERROR");

    expect(error.statusCode).toBe(500);
  });

  it("includes details when provided", () => {
    const details = { field: "email", reason: "invalid format" };
    const error = new BoticalError("Test error", "TEST_ERROR", 400, details);

    expect(error.details).toEqual(details);
  });

  it("serializes to JSON correctly", () => {
    const error = new BoticalError("Test error", "TEST_ERROR", 400, {
      extra: "info",
    });
    const json = error.toJSON();

    expect(json).toEqual({
      error: {
        code: "TEST_ERROR",
        message: "Test error",
        details: { extra: "info" },
      },
    });
  });

  it("is an instance of Error", () => {
    const error = new BoticalError("Test error", "TEST_ERROR");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof BoticalError).toBe(true);
  });
});

describe("NotFoundError", () => {
  it("creates 404 error with resource info", () => {
    const error = new NotFoundError("User", "usr_123");

    expect(error.message).toBe("User not found: usr_123");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.statusCode).toBe(404);
    expect(error.details).toEqual({ resource: "User", id: "usr_123" });
    expect(error.name).toBe("NotFoundError");
  });
});

describe("ValidationError", () => {
  it("creates 400 error with details", () => {
    const details = [{ field: "email", error: "required" }];
    const error = new ValidationError("Invalid input", details);

    expect(error.message).toBe("Invalid input");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
    expect(error.name).toBe("ValidationError");
  });
});

describe("AuthenticationError", () => {
  it("creates 401 error with default message", () => {
    const error = new AuthenticationError();

    expect(error.message).toBe("Authentication required");
    expect(error.code).toBe("AUTHENTICATION_ERROR");
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("AuthenticationError");
  });

  it("accepts custom message", () => {
    const error = new AuthenticationError("Token expired");

    expect(error.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("creates 403 error with default message", () => {
    const error = new ForbiddenError();

    expect(error.message).toBe("Permission denied");
    expect(error.code).toBe("FORBIDDEN");
    expect(error.statusCode).toBe(403);
    expect(error.name).toBe("ForbiddenError");
  });

  it("accepts custom message", () => {
    const error = new ForbiddenError("Admin access required");

    expect(error.message).toBe("Admin access required");
  });
});

describe("ConflictError", () => {
  it("creates 409 error with details", () => {
    const error = new ConflictError("Resource already exists", {
      existingId: "123",
    });

    expect(error.message).toBe("Resource already exists");
    expect(error.code).toBe("CONFLICT");
    expect(error.statusCode).toBe(409);
    expect(error.details).toEqual({ existingId: "123" });
    expect(error.name).toBe("ConflictError");
  });
});

describe("DatabaseError", () => {
  it("creates 500 error with details", () => {
    const error = new DatabaseError("Connection failed", {
      host: "localhost",
    });

    expect(error.message).toBe("Connection failed");
    expect(error.code).toBe("DATABASE_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({ host: "localhost" });
    expect(error.name).toBe("DatabaseError");
  });
});

describe("ConfigurationError", () => {
  it("creates 500 error with details", () => {
    const error = new ConfigurationError("Missing API key", {
      required: "ANTHROPIC_API_KEY",
    });

    expect(error.message).toBe("Missing API key");
    expect(error.code).toBe("CONFIGURATION_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({ required: "ANTHROPIC_API_KEY" });
    expect(error.name).toBe("ConfigurationError");
  });
});

describe("isBoticalError", () => {
  it("returns true for BoticalError instances", () => {
    expect(isBoticalError(new BoticalError("test", "TEST"))).toBe(true);
    expect(isBoticalError(new NotFoundError("User", "123"))).toBe(true);
    expect(isBoticalError(new ValidationError("invalid"))).toBe(true);
  });

  it("returns false for non-BoticalError values", () => {
    expect(isBoticalError(new Error("test"))).toBe(false);
    expect(isBoticalError("string")).toBe(false);
    expect(isBoticalError(null)).toBe(false);
    expect(isBoticalError(undefined)).toBe(false);
    expect(isBoticalError({})).toBe(false);
  });
});

describe("wrapError", () => {
  it("returns BoticalError as-is", () => {
    const original = new NotFoundError("User", "123");
    const wrapped = wrapError(original);

    expect(wrapped).toBe(original);
  });

  it("wraps generic Error", () => {
    const original = new Error("Something went wrong");
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(BoticalError);
    expect(wrapped.message).toBe("Something went wrong");
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.statusCode).toBe(500);
    expect(wrapped.details).toEqual({ originalName: "Error" });
  });

  it("wraps TypeError", () => {
    const original = new TypeError("Cannot read property");
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(BoticalError);
    expect(wrapped.details).toEqual({ originalName: "TypeError" });
  });

  it("wraps non-Error values", () => {
    const wrapped1 = wrapError("string error");
    expect(wrapped1).toBeInstanceOf(BoticalError);
    expect(wrapped1.message).toBe("An unexpected error occurred");
    expect(wrapped1.details).toEqual({ originalError: "string error" });

    const wrapped2 = wrapError(42);
    expect(wrapped2.details).toEqual({ originalError: "42" });

    const wrapped3 = wrapError(null);
    expect(wrapped3.details).toEqual({ originalError: "null" });
  });
});
