/* ContextMarkdown — rendered (read-only) markdown for project-context docs. */
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const h = (size: number, top: number): React.CSSProperties => ({
  fontSize: size,
  fontWeight: 650,
  margin: `${top}px 0 12px`,
  color: "var(--text-primary, var(--text))",
});

export function ContextMarkdown({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={h(24, 0)}>{children}</h1>,
          h2: ({ children }) => <h2 style={h(18, 28)}>{children}</h2>,
          h3: ({ children }) => <h3 style={h(15, 20)}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: "0 0 12px" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 12px", paddingLeft: 22 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre
              className="mono"
              style={{
                margin: "0 0 12px",
                padding: 12,
                overflow: "auto",
                fontSize: 12,
                borderRadius: 8,
                background: "var(--bg-hover)",
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.9em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--accent-bg)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
