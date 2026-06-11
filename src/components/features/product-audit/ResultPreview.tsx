import React, { useMemo, useState } from "react";
import type { AuditResultRow } from "@/lib/audit-types";

interface ResultPreviewProps {
  rows: AuditResultRow[];
  maxDisplayRows?: number;
}

type SortField = "序号" | "供应商" | "驳回原因" | "状态";
type SortDirection = "asc" | "desc";

function SortIcon({ field, currentField, direction }: { field: SortField; currentField: SortField; direction: SortDirection }) {
  if (currentField !== field) return null;
  return (
    <span className="ml-1">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function ResultPreview({
  rows,
  maxDisplayRows = 100,
}: ResultPreviewProps) {
  const [sortField, setSortField] = useState<SortField>("序号");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");

  const suppliers = useMemo(() => {
    const set = new Set(rows.map((r) => r.供应商));
    return Array.from(set).sort();
  }, [rows]);

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // Filter
    if (filterSupplier !== "all") {
      result = result.filter((r) => r.供应商 === filterSupplier);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = a[sortField] ?? "";
      let bVal: string | number = b[sortField] ?? "";

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [rows, sortField, sortDirection, filterSupplier]);

  const displayRows = filteredAndSortedRows.slice(0, maxDisplayRows);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无异常数据
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">供应商筛选:</label>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">全部</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-gray-500">
          共 {filteredAndSortedRows.length} 条异常
          {filteredAndSortedRows.length > maxDisplayRows && (
            <span> (显示前 {maxDisplayRows} 条)</span>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("序号")}
              >
                序号 <SortIcon field="序号" currentField={sortField} direction={sortDirection} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                日期
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                SKU
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                名称
              </th>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("供应商")}
              >
                供应商 <SortIcon field="供应商" currentField={sortField} direction={sortDirection} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                所属采销
              </th>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("驳回原因")}
              >
                驳回原因 <SortIcon field="驳回原因" currentField={sortField} direction={sortDirection} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                备注
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-900">{row.序号}</td>
                <td className="px-3 py-2 text-sm text-gray-500">{row.日期}</td>
                <td className="px-3 py-2 text-sm text-gray-900 font-mono">
                  {row.SKU}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900 max-w-xs truncate">
                  {row.名称}
                </td>
                <td className="px-3 py-2 text-sm text-gray-900">{row.供应商}</td>
                <td className="px-3 py-2 text-sm text-gray-500">
                  {row.所属采销}
                </td>
                <td className="px-3 py-2 text-sm text-red-600 max-w-xs">
                  <span className="line-clamp-2">{row.驳回原因}</span>
                </td>
                <td className="px-3 py-2 text-sm text-gray-500 max-w-xs">
                  <span className="line-clamp-2">{row.备注}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
