import React, { useState } from "react";

interface ExportButtonsProps {
  onExportAbnormal: () => void;
  onExportBySupplier: () => void;
  onExportSummary: () => void;
  onExportFull: () => void;
  disabled?: boolean;
}

export function ExportButtons({
  onExportAbnormal,
  onExportBySupplier,
  onExportSummary,
  onExportFull,
  disabled = false,
}: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: string, fn: () => Promise<void> | void) => {
    if (disabled || loading) return;

    setLoading(type);
    try {
      await fn();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => handleExport("abnormal", onExportAbnormal)}
        disabled={disabled || loading !== null}
        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {loading === "abnormal" ? (
          <>
            <span className="animate-spin">⏳</span>
            导出中...
          </>
        ) : (
          <>
            📊 导出异常SKU
          </>
        )}
      </button>

      <button
        onClick={() => handleExport("bysupplier", onExportBySupplier)}
        disabled={disabled || loading !== null}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {loading === "bysupplier" ? (
          <>
            <span className="animate-spin">⏳</span>
            导出中...
          </>
        ) : (
          <>
            🗂️ 按供应商拆分导出
          </>
        )}
      </button>

      <button
        onClick={() => handleExport("summary", onExportSummary)}
        disabled={disabled || loading !== null}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {loading === "summary" ? (
          <>
            <span className="animate-spin">⏳</span>
            导出中...
          </>
        ) : (
          <>
            📈 导出供应商汇总
          </>
        )}
      </button>

      <button
        onClick={() => handleExport("full", onExportFull)}
        disabled={disabled || loading !== null}
        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {loading === "full" ? (
          <>
            <span className="animate-spin">⏳</span>
            导出中...
          </>
        ) : (
          <>
            📋 导出完整报告
          </>
        )}
      </button>
    </div>
  );
}
