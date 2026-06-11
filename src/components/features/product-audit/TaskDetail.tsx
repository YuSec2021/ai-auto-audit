import React from "react";
import type { AuditTask } from "@/lib/audit-types";

interface TaskDetailProps {
  task: AuditTask;
  onStartAudit?: () => void;
  onPauseAudit?: () => void;
  onCancelAudit?: () => void;
  onExport?: () => void;
}

const statusLabels: Record<AuditTask["status"], string> = {
  draft: "草稿",
  ready: "待审核",
  running: "审核中",
  paused: "已暂停",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

export function TaskDetail({
  task,
  onStartAudit,
  onPauseAudit,
  onCancelAudit,
  onExport,
}: TaskDetailProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{task.filename}</h3>
          <p className="text-sm text-gray-500">
            供应商字段: {task.supplierField} · 规则集: {task.rulesetName}
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
          {statusLabels[task.status]}
        </span>
      </div>

      {/* Progress */}
      {(task.status === "running" || task.status === "paused" || task.status === "completed") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">审核进度</span>
            <span className="font-medium">{task.progress}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                task.status === "completed" ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>已审核: {task.reviewed}</span>
            <span>总数: {task.total}</span>
            <span>异常: {task.abnormalRows.length}</span>
          </div>
        </div>
      )}

      {/* Image Audit Progress */}
      {task.imageAuditEnabled && task.status === "running" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">图像审核</span>
            <span className="font-medium">{task.imageAuditProgress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${task.imageAuditProgress}%` }}
            />
          </div>
          {task.currentImageIndex !== undefined && (
            <p className="text-xs text-gray-500">
              正在处理第 {task.currentImageIndex + 1} 张图片
            </p>
          )}
        </div>
      )}

      {/* AI Service Status */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">AI服务:</span>
        <span
          className={`inline-flex items-center gap-1 ${
            task.aiServiceAvailable ? "text-green-600" : "text-red-600"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              task.aiServiceAvailable ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {task.aiServiceAvailable ? "可用" : "不可用"}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t">
        {task.status === "ready" && onStartAudit && (
          <button
            onClick={onStartAudit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            开始审核
          </button>
        )}

        {task.status === "running" && onPauseAudit && (
          <button
            onClick={onPauseAudit}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
          >
            暂停
          </button>
        )}

        {(task.status === "running" || task.status === "paused") && onCancelAudit && (
          <button
            onClick={onCancelAudit}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            取消
          </button>
        )}

        {task.status === "completed" && onExport && (
          <button
            onClick={onExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            导出报告
          </button>
        )}
      </div>

      {/* Logs */}
      {task.logs.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-2">日志</h4>
          <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-2 space-y-1">
            {task.logs.slice(-10).reverse().map((log, idx) => (
              <div key={idx} className="text-xs font-mono">
                <span className="text-gray-400">
                  {new Date(log.ts).toLocaleTimeString()}
                </span>
                <span
                  className={`ml-2 ${
                    log.level === "error"
                      ? "text-red-600"
                      : log.level === "warn"
                        ? "text-yellow-600"
                        : "text-gray-600"
                  }`}
                >
                  [{log.level.toUpperCase()}]
                </span>
                <span className="ml-2 text-gray-700">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
