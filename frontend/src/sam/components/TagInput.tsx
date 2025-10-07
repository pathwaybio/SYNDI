// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Badge } from "@shared/components/ui/badge";
import { X } from "lucide-react";

export function TagInput({
  value = [],
  onChange,
}: {
  value?: string[];
  onChange: (tags: string[]) => void;
}): JSX.Element {
  const [inputValue, setInputValue] = useState("");

  // Ensure value is always an array - handle cases where incorrect data types are passed
  const safeValue = Array.isArray(value) ? value : [];

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !safeValue.includes(trimmed)) {
      onChange([...safeValue, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    onChange(safeValue.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div className="flex flex-wrap gap-2 border rounded-md p-2">
      {safeValue.map(tag => (
        <Badge key={tag} variant="secondary" className="flex items-center gap-1">
          {tag}
          <X
            size={12}
            className="cursor-pointer"
            onClick={() => removeTag(tag)}
          />
        </Badge>
      ))}
      <Input
        className="border-none focus-visible:ring-0 focus-visible:ring-offset-0 w-auto flex-1"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a tag..."
      />
    </div>
  );
}
