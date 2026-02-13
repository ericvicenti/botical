/**
 * Skills Browser Component Test
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkillsBrowser } from "@/components/skills/SkillsBrowser";

// Mock the API hooks
const mockUseSkills = mock(() => ({
  data: [
    {
      name: "test-skill",
      description: "A test skill for unit testing",
      path: "skills/test-skill",
      allowedTools: ["exec", "read"],
    }
  ],
  isLoading: false,
}));

const mockUseInstalledSkills = mock(() => ({
  data: [
    {
      repo: "user/test-repo",
      ref: "main",
      installedAt: Date.now(),
      enabled: true,
      path: "installed-skills/user-test-repo",
      skills: [
        {
          name: "installed-skill",
          description: "An installed skill",
          path: "SKILL.md",
        }
      ],
    }
  ],
  isLoading: false,
}));

const mockUseInstallSkill = mock(() => ({
  mutateAsync: mock(async () => ({})),
  isPending: false,
}));

const mockUseUninstallSkill = mock(() => ({
  mutateAsync: mock(async () => ({})),
  isPending: false,
}));

const mockUseToggleSkillEnabled = mock(() => ({
  mutateAsync: mock(async () => ({})),
  isPending: false,
}));

// Mock the API module
mock.module("@/lib/api/queries", () => ({
  useSkills: mockUseSkills,
  useInstalledSkills: mockUseInstalledSkills,
  useInstallSkill: mockUseInstallSkill,
  useUninstallSkill: mockUseUninstallSkill,
  useToggleSkillEnabled: mockUseToggleSkillEnabled,
}));

describe("SkillsBrowser", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderComponent = (projectId = "test-project") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SkillsBrowser projectId={projectId} />
      </QueryClientProvider>
    );
  };

  it("renders skills browser with tabs", () => {
    renderComponent();

    expect(screen.getByText("Skills")).toBeVisible();
    expect(screen.getByPlaceholderText("Search skills...")).toBeVisible();
    expect(screen.getByText("Available (1)")).toBeVisible();
    expect(screen.getByText("Installed (1)")).toBeVisible();
  });

  it("shows available skills in the default tab", () => {
    renderComponent();

    expect(screen.getByText("test-skill")).toBeVisible();
    expect(screen.getByText("A test skill for unit testing")).toBeVisible();
  });

  it("shows installed skills when switching to installed tab", async () => {
    renderComponent();

    const installedTab = screen.getByText("Installed (1)");
    installedTab.click();

    expect(screen.getByText("user/test-repo")).toBeVisible();
    expect(screen.getByText("1 skill")).toBeVisible();
  });

  it("shows install form at the bottom", () => {
    renderComponent();

    expect(screen.getByText("Install from GitHub")).toBeVisible();
    expect(screen.getByPlaceholderText("user/repo or https://github.com/user/repo")).toBeVisible();
    expect(screen.getByText("Install")).toBeVisible();
  });

  it("filters skills based on search query", () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText("Search skills...");
    
    // Type a search query that should match
    searchInput.focus();
    searchInput.value = "test";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(screen.getByText("test-skill")).toBeVisible();
    
    // Type a search query that shouldn't match
    searchInput.value = "nonexistent";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(screen.queryByText("test-skill")).not.toBeVisible();
  });

  it("shows empty state when no skills are available", () => {
    // Mock empty skills
    mockUseSkills.mockReturnValue({
      data: [],
      isLoading: false,
    });

    renderComponent();

    expect(screen.getByText("No skills available")).toBeVisible();
    expect(screen.getByText("Add skills to skills/ in your project")).toBeVisible();
  });

  it("shows loading state", () => {
    // Mock loading state
    mockUseSkills.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    renderComponent();

    expect(screen.getByText("Loading skills...")).toBeVisible();
  });

  it("shows skill details when expanded", () => {
    renderComponent();

    // Click expand button (chevron)
    const expandButton = screen.getByRole("button", { name: /expand/i });
    expandButton?.click();

    expect(screen.getByText("Tools:")).toBeVisible();
    expect(screen.getByText("exec")).toBeVisible();
    expect(screen.getByText("read")).toBeVisible();
  });

  it("handles GitHub URL extraction in install form", () => {
    renderComponent();

    const installInput = screen.getByPlaceholderText("user/repo or https://github.com/user/repo");
    const installButton = screen.getByText("Install");

    // Test with GitHub URL
    installInput.focus();
    installInput.value = "https://github.com/test-user/test-skill";
    installInput.dispatchEvent(new Event("input", { bubbles: true }));

    installButton.click();

    expect(mockUseInstallSkill().mutateAsync).toHaveBeenCalledWith({
      projectId: "test-project",
      repo: "test-user/test-skill"
    });
  });
});