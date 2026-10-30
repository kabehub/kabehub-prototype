import React from "react";

export default function InlineMarkdownCode({
  variant = "default",
  ...props
}: React.ComponentProps<"code"> & { variant?: "default" | "share" }) {
  const isShare = variant === "share";
  return (
    <code
      {...props}
      style={{
        background: isShare ? "#f1f5f9" : "#e8eef5",
        color: isShare ? "#1e293b" : "#334155",
        border: isShare ? "none" : "1px solid #cbd5e1",
        borderRadius: "4px",
        padding: "1px 5px",
        fontSize: "0.875em",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    />
  );
}
