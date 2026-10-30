import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser, getToken } from "@/lib/api-client";
import { Header } from "@/components/Header";
import { StatusColumn } from "@/components/StatusColumn";
import { TaskDetail } from "@/components/TaskDetail";
import { ActivityFeed } from "@/components/ActivityFeed";
import type { ApiProjectDetail, ApiTask, ApiActivity, ApiExportResult, TaskStatus } from "@/types";
import { STATUS_ORDER } from "@/types";

export default function ProjectPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [activeTask, setActiveTask] = useState<ApiTask | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColumn, setNewColumn] = useState<TaskStatus>("todo");
  const [error, setError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<{
    type: "success" | "error";
    message: string;
    details?: string[];
  } | null>(null);

  useEffect(() => {
    if (!getToken()) navigate("/login", { replace: true });
  }, [navigate]);

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<{ project: ApiProjectDetail }>(`/api/projects/${id}`),
  });

  const { data: activityData, isLoading: isActivityLoading } = useQuery({
    queryKey: ["activities", id],
    queryFn: () => apiFetch<{ activities: ApiActivity[] }>(`/api/projects/${id}/activities`),
    enabled: !!id,
  });

  const createTask = useMutation({
    mutationFn: (input: { title: string; status: TaskStatus }) =>
      apiFetch<{ task: ApiTask }>(`/api/projects/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setNewTitle("");
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "create failed"),
  });

  const exportTasks = useMutation({
    mutationFn: () =>
      apiFetch<ApiExportResult>(`/api/projects/${id}/export`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      setExportStatus({
        type: data.failed > 0 ? "error" : "success",
        message:
          data.failed > 0
            ? `Export completed with warnings: ${data.exported} exported (${data.created} created, ${data.updated} updated), ${data.failed} failed.`
            : `Successfully exported ${data.exported} task${data.exported === 1 ? "" : "s"} to Airtable (${data.created} created, ${data.updated} updated).`,
        details: data.errors && data.errors.length > 0 ? data.errors : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (err) => {
      setExportStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to export tasks to Airtable",
      });
    },
  });

  const project = data?.project;
  const currentUser = getStoredUser();
  const currentMembership = project?.memberships.find(
    (m) => m.user.id === currentUser?.id || m.user.email === currentUser?.email
  );
  const canExport = currentMembership?.role === "admin" || currentMembership?.role === "member";

  const tasksByStatus: Record<TaskStatus, ApiTask[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };
  if (project) {
    for (const t of project.tasks) {
      tasksByStatus[t.status].push(t);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Link
          to="/dashboard"
          className="text-sm text-muted hover:text-white"
        >
          ← all projects
        </Link>

        {isLoading && <p className="text-muted text-sm mt-6">loading…</p>}
        {queryError && (
          <p className="text-sm text-red-400 mt-6">
            {queryError instanceof Error ? queryError.message : "failed to load"}
          </p>
        )}

        {project && (
          <>
            <div className="flex items-start justify-between mt-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-muted mt-1 max-w-2xl">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-muted mt-2">
                  owner: {project.owner.name} · {project.memberships.length} members
                </p>
              </div>

              <div className="flex items-center gap-3">
                {canExport ? (
                  <button
                    type="button"
                    onClick={() => {
                      setExportStatus(null);
                      exportTasks.mutate();
                    }}
                    disabled={exportTasks.isPending}
                    aria-label="Export to Airtable"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-md px-4 py-2 transition-colors shadow-sm"
                  >
                    {exportTasks.isPending ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Exporting to Airtable…</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Export to Airtable</span>
                      </>
                    )}
                  </button>
                ) : currentMembership?.role === "viewer" ? (
                  <span
                    className="text-xs text-muted bg-surface border border-border px-3 py-1.5 rounded-md cursor-not-allowed"
                    title="Viewers cannot export tasks"
                  >
                    Export disabled (viewer)
                  </span>
                ) : null}
              </div>
            </div>

            {exportStatus && (
              <div
                className={`mb-6 p-4 rounded-lg border text-sm flex items-start justify-between ${
                  exportStatus.type === "success"
                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
                    : "bg-red-950/40 border-red-500/30 text-red-200"
                }`}
                role="alert"
              >
                <div>
                  <p className="font-medium">{exportStatus.message}</p>
                  {exportStatus.details && exportStatus.details.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-xs space-y-1 text-red-300">
                      {exportStatus.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExportStatus(null)}
                  className="text-xs text-muted hover:text-white ml-4 font-mono"
                  aria-label="Dismiss banner"
                >
                  ✕
                </button>
              </div>
            )}

            <section className="bg-surface border border-border rounded-lg p-4 mb-6">
              <h2 className="text-sm font-medium mb-3">add a task</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTitle.trim()) return;
                  setError(null);
                  createTask.mutate({ title: newTitle.trim(), status: newColumn });
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="task title"
                  className="flex-1 rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <select
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value as TaskStatus)}
                  className="rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={createTask.isPending}
                  className="bg-accent hover:bg-indigo-500 text-white text-sm font-medium rounded-md px-4 disabled:opacity-50"
                >
                  add
                </button>
              </form>
              {error && (
                <p className="text-sm text-red-400 mt-2" role="alert">
                  {error}
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {STATUS_ORDER.map((s) => (
                <StatusColumn
                  key={s}
                  status={s}
                  tasks={tasksByStatus[s]}
                  onTaskClick={setActiveTask}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
              <div className="lg:col-span-2">
                <ActivityFeed
                  activities={activityData?.activities || project.activities || []}
                  isLoading={isActivityLoading}
                />
              </div>

              <div>
                <section>
                  <h2 className="text-sm font-medium mb-3">members</h2>
                  <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
                    {project.memberships.map((m) => (
                      <li
                        key={m.id}
                        className="px-4 py-3 flex items-center justify-between text-sm"
                      >
                        <span>{m.user.name}</span>
                        <span className="text-xs text-muted">
                          {m.user.email} · {m.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </>
        )}
      </main>

      {activeTask && project && (
        <TaskDetail
          task={activeTask}
          projectId={id!}
          members={project.memberships}
          onClose={() => setActiveTask(null)}
        />
      )}
    </div>
  );
}
