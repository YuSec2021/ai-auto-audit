import React from "react";
import type { AuditTask } from "@/lib/audit-types";

interface TaskListProps {
  tasks: AuditTask[];
  activeTaskId?: string;
  onSelectTask: (taskId: string) => void;
}

const statusConfig: Record<
  AuditTask["status"],
  { label: string; className: string }
> = {
  draft: { label: "草稿", className: "bg-gray-100 text-gray-800" },
  ready: { label: "待审核", className: "bg-blue-100 text-blue-800" },
  running: { label: "审核中", className: "bg-yellow-100 text-yellow-800" },
  paused: { label: "已暂停", className: "bg-orange-100 text-orange-800" },
  completed: { label: "已完成", className: "bg-green-100 text-green-800" },
  failed: { label: "失败", className: "bg-red-100 text-red-800" },
  canceled: { label: "已取消", className: "bg-gray-100 text-gray-800" },
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskList({ tasks, activeTaskId, onSelectTask }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无审核任务
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const status = statusConfig[task.status];
        const isActive = task.id === activeTaskId;

        return (
          <div
            key={task.id}
            className={`
              p-4 rounded-lg border cursor-pointer transition-all
              ${
                isActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }
            `}
            onClick={() => onSelectTask(task.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {task.filename}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {formatDate(task.createdAt)} ·{" "}
                  {task.abnormalRows.length} 异常 / {task.total} 总数
                </div>
              </div>

              {task.status === "running" && (
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{task.progress}%</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
