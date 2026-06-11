import React from "react";
import type { SupplierProgress } from "@/lib/audit-types";

interface SupplierSummaryProps {
  suppliers: SupplierProgress[];
  onSupplierClick?: (supplier: string) => void;
}

const statusConfig: Record<
  SupplierProgress["status"],
  { label: string; className: string }
> = {
  通过: { label: "通过", className: "bg-green-100 text-green-800" },
  需复核: { label: "需复核", className: "bg-yellow-100 text-yellow-800" },
  驳回: { label: "驳回", className: "bg-red-100 text-red-800" },
};

export function SupplierSummary({ suppliers, onSupplierClick }: SupplierSummaryProps) {
  // 计算汇总统计
  const summary = suppliers.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.reviewed += s.reviewed;
      acc.abnormal += s.abnormal;
      acc.statusCounts[s.status] = (acc.statusCounts[s.status] || 0) + 1;
      return acc;
    },
    {
      total: 0,
      reviewed: 0,
      abnormal: 0,
      statusCounts: {} as Record<string, number>,
    }
  );

  if (suppliers.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无供应商数据
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          <div className="text-sm text-gray-500">商品总数</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{summary.reviewed}</div>
          <div className="text-sm text-gray-500">已审核</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{summary.abnormal}</div>
          <div className="text-sm text-gray-500">异常数</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">{suppliers.length}</div>
          <div className="text-sm text-gray-500">供应商数</div>
        </div>
      </div>

      {/* Status Distribution */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-600">通过: {summary.statusCounts["通过"] || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-gray-600">需复核: {summary.statusCounts["需复核"] || 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-gray-600">驳回: {summary.statusCounts["驳回"] || 0}</span>
        </div>
      </div>

      {/* Supplier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((supplier) => {
          const status = statusConfig[supplier.status];
          const abnormalRate = supplier.total > 0
            ? ((supplier.abnormal / supplier.total) * 100).toFixed(1)
            : "0.0";

          return (
            <div
              key={supplier.supplier}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
              onClick={() => onSupplierClick?.(supplier.supplier)}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 truncate" title={supplier.supplier}>
                  {supplier.supplier}
                </h4>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>总数</span>
                  <span>{supplier.total}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>已审核</span>
                  <span>{supplier.reviewed}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>异常</span>
                  <span>{supplier.abnormal} ({abnormalRate}%)</span>
                </div>
                {supplier.principleHitsInFirst5 > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>前5行原则性错误</span>
                    <span>{supplier.principleHitsInFirst5}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
