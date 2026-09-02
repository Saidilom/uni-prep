"use client";

import { Fragment, ReactNode, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type Props = {
  content: string;
  className?: string;
  as?: "div" | "span" | "p";
};

const TOKEN_PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\))/g;

function renderToken(token: string, key: number): ReactNode {
  const displayMode = token.startsWith("$$") || token.startsWith("\\[");
  const expression = token.startsWith("$$")
    ? token.slice(2, -2)
    : token.startsWith("$")
      ? token.slice(1, -1)
      : token.slice(2, -2);
  try {
    const html = katex.renderToString(expression, { displayMode, throwOnError: false, strict: "ignore" });
    return <span key={key} className={displayMode ? "block overflow-x-auto py-2" : "inline-block max-w-full overflow-x-auto align-middle"} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <Fragment key={key}>{token}</Fragment>;
  }
}

export default function SafeMathText({ content, className = "", as: Component = "div" }: Props) {
  const nodes = useMemo(() => {
    const parts = content.split(TOKEN_PATTERN);
    return parts.map((part, index) => {
      const isMath = part.startsWith("$") || part.startsWith("\\(") || part.startsWith("\\[");
      return isMath ? renderToken(part, index) : <Fragment key={index}>{part}</Fragment>;
    });
  }, [content]);

  return <Component className={`whitespace-pre-wrap leading-relaxed ${className}`}>{nodes}</Component>;
}
