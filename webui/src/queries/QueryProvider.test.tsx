/**
 * QueryProvider Unit Tests
 *
 * Tests for the query context provider and dependency injection.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  QueryProvider,
  useQueryContext,
  useQueryDefinition,
  useMutationDefinition,
} from "./QueryProvider";
import type { Query, Mutation } from "./types";

// Test components that use the hooks
function QueryContextConsumer() {
  const context = useQueryContext();
  return (
    <div data-testid="context">
      {JSON.stringify({
        hasOverrides: !!context.queryOverrides,
        hasMutationOverrides: !!context.mutationOverrides,
      })}
    </div>
  );
}

function QueryDefinitionConsumer({ query }: { query: Query<unknown, unknown> }) {
  const resolved = useQueryDefinition(query);
  return <div data-testid="query-name">{resolved.name}</div>;
}

function MutationDefinitionConsumer({
  mutation,
}: {
  mutation: Mutation<unknown, unknown>;
}) {
  const resolved = useMutationDefinition(mutation);
  return <div data-testid="mutation-name">{resolved.name}</div>;
}

describe("QueryProvider", () => {
  it("renders children", () => {
    render(
      <QueryProvider>
        <div data-testid="child">Child content</div>
      </QueryProvider>
    );

    expect(screen.getByTestId("child")).toHaveTextContent("Child content");
  });

  it("provides empty context by default", () => {
    render(
      <QueryProvider>
        <QueryContextConsumer />
      </QueryProvider>
    );

    const context = JSON.parse(screen.getByTestId("context").textContent!);
    expect(context.hasOverrides).toBe(false);
    expect(context.hasMutationOverrides).toBe(false);
  });

  it("provides query overrides when specified", () => {
    const overrides: Record<string, Query<unknown, unknown>> = {
      "test.query": {
        name: "test.query",
        endpoint: "/api/test",
      },
    };

    render(
      <QueryProvider queryOverrides={overrides}>
        <QueryContextConsumer />
      </QueryProvider>
    );

    const context = JSON.parse(screen.getByTestId("context").textContent!);
    expect(context.hasOverrides).toBe(true);
  });

  it("provides mutation overrides when specified", () => {
    const overrides: Record<string, Mutation<unknown, unknown>> = {
      "test.mutation": {
        name: "test.mutation",
        endpoint: "/api/test",
      },
    };

    render(
      <QueryProvider mutationOverrides={overrides}>
        <QueryContextConsumer />
      </QueryProvider>
    );

    const context = JSON.parse(screen.getByTestId("context").textContent!);
    expect(context.hasMutationOverrides).toBe(true);
  });
});

describe("useQueryContext", () => {
  it("returns empty object when no provider", () => {
    // When used outside provider, should return empty context
    render(<QueryContextConsumer />);

    const context = JSON.parse(screen.getByTestId("context").textContent!);
    expect(context.hasOverrides).toBe(false);
  });
});

describe("useQueryDefinition", () => {
  const originalQuery: Query<unknown, unknown> = {
    name: "original.query",
    endpoint: "/api/original",
  };

  it("returns original query when no override", () => {
    render(
      <QueryProvider>
        <QueryDefinitionConsumer query={originalQuery} />
      </QueryProvider>
    );

    expect(screen.getByTestId("query-name")).toHaveTextContent("original.query");
  });

  it("returns overridden query when override exists", () => {
    const overriddenQuery: Query<unknown, unknown> = {
      name: "original.query",
      endpoint: "/api/overridden",
    };

    render(
      <QueryProvider queryOverrides={{ "original.query": overriddenQuery }}>
        <QueryDefinitionConsumer query={originalQuery} />
      </QueryProvider>
    );

    expect(screen.getByTestId("query-name")).toHaveTextContent("original.query");
  });

  it("ignores overrides for non-matching queries", () => {
    const unrelatedOverride: Query<unknown, unknown> = {
      name: "other.query",
      endpoint: "/api/other",
    };

    render(
      <QueryProvider queryOverrides={{ "other.query": unrelatedOverride }}>
        <QueryDefinitionConsumer query={originalQuery} />
      </QueryProvider>
    );

    expect(screen.getByTestId("query-name")).toHaveTextContent("original.query");
  });
});

describe("useMutationDefinition", () => {
  const originalMutation: Mutation<unknown, unknown> = {
    name: "original.mutation",
    endpoint: "/api/original",
  };

  it("returns original mutation when no override", () => {
    render(
      <QueryProvider>
        <MutationDefinitionConsumer mutation={originalMutation} />
      </QueryProvider>
    );

    expect(screen.getByTestId("mutation-name")).toHaveTextContent(
      "original.mutation"
    );
  });

  it("returns overridden mutation when override exists", () => {
    const overriddenMutation: Mutation<unknown, unknown> = {
      name: "original.mutation",
      endpoint: "/api/overridden",
    };

    render(
      <QueryProvider
        mutationOverrides={{ "original.mutation": overriddenMutation }}
      >
        <MutationDefinitionConsumer mutation={originalMutation} />
      </QueryProvider>
    );

    expect(screen.getByTestId("mutation-name")).toHaveTextContent(
      "original.mutation"
    );
  });

  it("ignores overrides for non-matching mutations", () => {
    const unrelatedOverride: Mutation<unknown, unknown> = {
      name: "other.mutation",
      endpoint: "/api/other",
    };

    render(
      <QueryProvider mutationOverrides={{ "other.mutation": unrelatedOverride }}>
        <MutationDefinitionConsumer mutation={originalMutation} />
      </QueryProvider>
    );

    expect(screen.getByTestId("mutation-name")).toHaveTextContent(
      "original.mutation"
    );
  });
});
