"use client";

// File Upload Component

import { useTranslations } from "next-intl";

interface FileUploadProps {
  label?: string;
  accept?: string;
  multiple?: boolean;
  onChange: (files: File[]) => void;
  error?: string;
}

export function FileUpload({
  label,
  accept = "image/*",
  multiple = false,
  onChange,
  error,
}: FileUploadProps) {
  const t = useTranslations("common");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onChange(files);
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <p className="text-gray-600 mb-2">{t("dragFilesHere")}</p>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <span className="text-blue-600 hover:underline">{t("chooseFiles")}</span>
        </label>
      </div>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
