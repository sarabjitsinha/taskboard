import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "@/components/ActivityFeed";
import type { ApiActivity } from "@/types";

const mockActivities: ApiActivity[] = [
  {
    id: "act-1",
    action: "task_created",
    details: "created task 'Draft press release'",
    user: { id: "u-1", name: "Meera Iyer", email: "meera@taskboard.dev" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "act-2",
    action: "status_changed",
    details: "moved 'Set up analytics' to in_progress",
    user: { id: "u-2", name: "Arjun Rao", email: "arjun@taskboard.dev" },
    createdAt: new Date().toISOString(),
  },
];

describe("<ActivityFeed />", () => {
  it("renders empty state when there are no activities", () => {
    render(<ActivityFeed activities={[]} />);
    expect(screen.getByText("activity feed")).toBeInTheDocument();
    expect(screen.getByText("no activity recorded yet.")).toBeInTheDocument();
  });

  it("renders a list of activities with user name and details", () => {
    render(<ActivityFeed activities={mockActivities} />);
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.getByText("created task 'Draft press release'")).toBeInTheDocument();
    expect(screen.getByText("Arjun Rao")).toBeInTheDocument();
    expect(screen.getByText("moved 'Set up analytics' to in_progress")).toBeInTheDocument();
  });

  it("displays loading state when isLoading is true", () => {
    render(<ActivityFeed activities={[]} isLoading={true} />);
    expect(screen.getByText("loading activity…")).toBeInTheDocument();
  });
});

