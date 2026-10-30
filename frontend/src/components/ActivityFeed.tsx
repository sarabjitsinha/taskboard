import type { ApiActivity } from "@/types";

type Props = {
  activities: ApiActivity[];
  isLoading?: boolean;
};

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function getActionBadge(action: string) {
  switch (action) {
    case "task_created":
      return { label: "created", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    case "status_changed":
      return { label: "status", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
    case "assignee_changed":
      return { label: "assignee", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
    case "comment_added":
      return { label: "comment", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    case "task_deleted":
      return { label: "deleted", color: "bg-red-500/10 text-red-400 border-red-500/20" };
    default:
      return { label: action.replace("_", " "), color: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
  }
}

export function ActivityFeed({ activities, isLoading }: Props) {
  return (
    <section data-testid="activity-feed">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">activity feed</h2>
        <span className="text-xs text-muted">
          {activities.length} {activities.length === 1 ? "event" : "events"}
        </span>
      </div>

      {isLoading && <p className="text-muted text-sm py-4">loading activity…</p>}

      {!isLoading && activities.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-sm text-muted">
          no activity recorded yet.
        </div>
      )}

      {!isLoading && activities.length > 0 && (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
          {activities.map((item) => {
            const badge = getActionBadge(item.action);
            const timeStr = formatTimestamp(item.createdAt || item.created_at || "");
            const userName = item.user ? item.user.name : "System";

            return (
              <li
                key={item.id}
                className="px-4 py-3 flex items-start justify-between gap-4 text-sm"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-0.5 text-[10px] uppercase font-semibold px-2 py-0.5 rounded border shrink-0 ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white leading-snug">
                      <span className="font-medium text-slate-200">{userName}</span>{" "}
                      <span className="text-muted">{item.details}</span>
                    </p>
                  </div>
                </div>
                <time
                  dateTime={item.createdAt || item.created_at}
                  className="text-xs text-muted whitespace-nowrap shrink-0"
                  title={item.createdAt || item.created_at}
                >
                  {timeStr}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
