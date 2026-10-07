import React from "react";
import { COPIED_MS } from "./constants";

/** Clipboard write with a 2 s "copied" flag (D30). `failedKey` marks the source that needs the manual fallback until the next copy. */
export function useCopy() {
  const [copied, setCopied] = React.useState(false);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string, key: string) => {
    clearTimeout(timer.current);
    setCopied(false);
    setFailedKey(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setFailedKey(key); // E28: API missing or denied
    }
  };
  return { copied, failedKey, copy };
}
