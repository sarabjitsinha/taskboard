import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectPage from "@/pages/ProjectPage";
import * as apiClient from "@/lib/api-client";
import type { ApiProjectDetail } from "@/types";

const mockProjectAdmin: ApiProjectDetail = {
  id: "p_1",
  name: "Q3 Launch",
  description: "Launch project for Q3",
  ownerId: "u_admin",
  owner: { id: "u_admin", name: "Meera Iyer", email: "meera@taskboard.dev" },
  memberships: [
    {
      id: "m_1",
      role: "admin",
      user: { id: "u_admin", name: "Meera Iyer", email: "meera@taskboard.dev" },
    },
    {
      id: "m_2",
      role: "viewer",
      user: { id: "u_viewer", name: "Dev Viewer", email: "dev@example.com" },
    },
  ],
  tasks: [
    {
      id: "t_1",
      projectId: "p_1",
      title: "Set up analytics",
      description: null,
      status: "todo",
      assigneeId: null,
      createdById: "u_admin",
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderWithProviders(initialEntry = "/projects/p_1") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Airtable Export on ProjectPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, "getToken").mockReturnValue("test-token");
  });

  it("shows 'Export to Airtable' button for admin or member", async () => {
    vi.spyOn(apiClient, "getStoredUser").mockReturnValue({
      id: "u_admin",
      name: "Meera Iyer",
      email: "meera@taskboard.dev",
    });
    vi.spyOn(apiClient, "apiFetch").mockImplementation((url) => {
      if (url === "/api/projects/p_1") {
        return Promise.resolve({ project: mockProjectAdmin });
      }
      if (url === "/api/projects/p_1/activities") {
        return Promise.resolve({ activities: [] });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    renderWithProviders();

    expect(await screen.findByRole("button", { name: /export to airtable/i })).toBeInTheDocument();
  });

  it("shows disabled export for viewers", async () => {
    vi.spyOn(apiClient, "getStoredUser").mockReturnValue({
      id: "u_viewer",
      name: "Dev Viewer",
      email: "dev@example.com",
    });
    vi.spyOn(apiClient, "apiFetch").mockImplementation((url) => {
      if (url === "/api/projects/p_1") {
        return Promise.resolve({ project: mockProjectAdmin });
      }
      if (url === "/api/projects/p_1/activities") {
        return Promise.resolve({ activities: [] });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    renderWithProviders();

    expect(await screen.findByText(/export disabled \(viewer\)/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export to airtable/i })).not.toBeInTheDocument();
  });

  it("triggers export and displays success banner", async () => {
    vi.spyOn(apiClient, "getStoredUser").mockReturnValue({
      id: "u_admin",
      name: "Meera Iyer",
      email: "meera@taskboard.dev",
    });

    vi.spyOn(apiClient, "apiFetch").mockImplementation((url, opts) => {
      if (url === "/api/projects/p_1") {
        return Promise.resolve({ project: mockProjectAdmin });
      }
      if (url === "/api/projects/p_1/activities") {
        return Promise.resolve({ activities: [] });
      }
      if (url === "/api/projects/p_1/export" && opts?.method === "POST") {
        return Promise.resolve({
          exported: 1,
          created: 1,
          updated: 0,
          failed: 0,
          errors: [],
        });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    renderWithProviders();

    const exportBtn = await screen.findByRole("button", { name: /export to airtable/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/successfully exported 1 task to airtable/i)).toBeInTheDocument();
    });
  });
});

