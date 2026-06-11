import React, { useCallback, useState } from "react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number; // MB
  disabled?: boolean;
}

export function FileUpload({
  onFileSelect,
  accept = ".xlsx,.xls",
  maxSize = 50,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      const ext = file.name.split(".").pop()?.toLowerCase();
      const acceptedExts = accept.split(",").map((e) => e.trim().replace(".", ""));
      if (!ext || !acceptedExts.includes(ext)) {
        return `不支持的文件格式，请上传 ${accept} 格式`;
      }

      // Check file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSize) {
        return `文件大小超过 ${maxSize}MB 限制`;
      }

      return null;
    },
    [accept, maxSize]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (!file) return;

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      onFileSelect(file);
    },
    [disabled, validateFile, onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      onFileSelect(file);

      // Reset input
      e.target.value = "";
    },
    [validateFile, onFileSelect]
  );

  return (
    <div className="w-full">
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-400"}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="pointer-events-none">
          <svg
            className={`mx-auto h-12 w-12 ${isDragging ? "text-blue-500" : "text-gray-400"}`}
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M8 25v10c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V25M24 33V15M24 15l-8-8M24 15l8-8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="mt-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-blue-600">点击上传</span>
              {" "}或拖拽文件到此处
            </p>
            <p className="mt-1 text-xs text-gray-500">
              支持 {accept} 格式，大小不超过 {maxSize}MB
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
