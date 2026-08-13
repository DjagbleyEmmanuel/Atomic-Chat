/* eslint-disable react-refresh/only-export-components */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";
import { useGeneralSetting } from "@/hooks/useGeneralSetting";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
};

// Highlight cadence for the standalone code block.
// - HIGHLIGHT_SETTLE_MS: after the code stops changing, one final exact pass.
// - CODE_HIGHLIGHT_CADENCE_MS: while the code keeps changing (streaming),
//   refresh the latest snapshot on this cadence so colors appear live.
// - HIGHLIGHT_STREAM_MAX_CHARS: skip the live cadence for larger blocks — a
//   full Shiki pass (light + dark) on every tick would block the main thread
//   and freeze the UI. Those blocks render plain text while streaming and get
//   one highlight pass once the stream settles.
const HIGHLIGHT_SETTLE_MS = 350;
const HIGHLIGHT_STREAM_MAX_CHARS = 1500;
const CODE_HIGHLIGHT_CADENCE_MS = {
  fast: 150,
  smooth: 250,
  relaxed: 400,
} as const;

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

const lineNumberTransformer: ShikiTransformer = {
  name: "line-numbers",
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "inline-block",
          "min-w-10",
          "mr-4",
          "text-right",
          "text-muted-foreground",
        ],
      },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

export async function highlightCode(
  code: string,
  language: BundledLanguage,
  showLineNumbers = false,
) {
  const transformers: ShikiTransformer[] = showLineNumbers
    ? [lineNumberTransformer]
    : [];

  return await Promise.all([
    codeToHtml(code, {
      lang: language,
      theme: "one-light",
      transformers,
    }),
    codeToHtml(code, {
      lang: language,
      theme: "one-dark-pro",
      transformers,
    }),
  ]);
}

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const [html, setHtml] = useState<string>("");
  const [darkHtml, setDarkHtml] = useState<string>("");
  const mounted = useRef(false);
  const highlightToken = useRef(0);
  // Always points at the latest code/language so the streaming interval can
  // highlight the current snapshot without re-running its effect on every token.
  const codeRef = useRef({ code, language, showLineNumbers });
  codeRef.current = { code, language, showLineNumbers };
  const lastHighlighted = useRef("");

  const codeLiveHighlight = useGeneralSetting((s) => s.codeLiveHighlight);
  const codeHighlightCadence = useGeneralSetting(
    (s) => s.codeHighlightCadence
  );
  // Gates every Shiki pass (settle + live cadence) to one in flight, so the
  // passes can never pile up and starve the main thread while tokens stream.
  const highlightInFlight = useRef(false);

  const runHighlight = useCallback(
    (source: {
      code: string;
      language: BundledLanguage;
      showLineNumbers: boolean;
    }) => {
      if (highlightInFlight.current) return;
      highlightInFlight.current = true;
      const tokenAtCall = highlightToken.current;
      highlightCode(source.code, source.language, source.showLineNumbers)
        .then(([light, dark]) => {
          // Ignore results for code that was superseded while Shiki was running.
          if (!mounted.current || tokenAtCall !== highlightToken.current) return;
          setHtml(light);
          setDarkHtml(dark);
        })
        .finally(() => {
          highlightInFlight.current = false;
        });
    },
    []
  );

  useEffect(() => {
    mounted.current = true;
    // Bump the token so any highlight already in flight for the previous
    // snapshot is discarded once it resolves. The last good highlight stays on
    // screen while a fresh one computes — swapping in new colours instead of
    // flashing back to plain white for every streamed token.
    highlightToken.current += 1;
    lastHighlighted.current = "";

    // Final pass: highlight once the stream goes quiet, guaranteeing an exact
    // result that matches the finished code (the interval below only fires
    // every few hundred ms, so the last tokens may arrive after its last tick).
    const settleTimer = window.setTimeout(() => {
      if (mounted.current) runHighlight(codeRef.current);
    }, HIGHLIGHT_SETTLE_MS);

    return () => {
      mounted.current = false;
      window.clearTimeout(settleTimer);
    };
  }, [code, language, showLineNumbers, runHighlight]);

  // Live progressive re-highlight, driven by the "Code Rendering & Streaming"
  // settings. While the code keeps changing (streaming) it re-highlights the
  // latest snapshot on the configured cadence, so syntax colours appear on the
  // go instead of only once the stream finishes. Disabled when "live code
  // colours" is off, or for very large blocks where a full Shiki pass every
  // few hundred ms would block the main thread.
  useEffect(() => {
    if (!codeLiveHighlight) return;

    const streamTimer = window.setInterval(() => {
      const latest = codeRef.current;
      if (!mounted.current) return;
      if (latest.code.length > HIGHLIGHT_STREAM_MAX_CHARS) return;
      if (latest.code === lastHighlighted.current) return;
      lastHighlighted.current = latest.code;
      runHighlight(latest);
    }, CODE_HIGHLIGHT_CADENCE_MS[codeHighlightCadence]);

    return () => {
      window.clearInterval(streamTimer);
    };
  }, [codeLiveHighlight, codeHighlightCadence, runHighlight]);

  const renderBody = (highlighted: string) => {
    if (highlighted) {
      return (
        <div
          className="[&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:whitespace-pre-wrap [&>pre]:wrap-break-word [&_code]:font-mono [&_code]:text-sm"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      )
    }
    // While the debounced Shiki highlight is pending (e.g. mid-stream), show
    // the raw code as plain text so the block is never blank. Long lines wrap
    // so they stay inside the frame instead of popping a horizontal scrollbar.
    return (
      <pre className="m-0 bg-background! p-4 text-foreground! text-sm">
        <code className="font-mono text-sm whitespace-pre-wrap wrap-break-word">{code}</code>
      </pre>
    )
  }

  // Tidy display name for the window chrome, e.g. "typescript" -> "TypeScript".
  const languageLabel = language
    .replace(/^plaintext$|^text$|^plain$/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border border-border bg-background text-foreground",
          className,
        )}
        {...props}
      >
        {/* Window chrome: traffic-light dots, language and copy affordance. */}
        <div className="flex h-9 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="flex shrink-0 items-center gap-1.5"
            >
              <span className="size-2.5 rounded-full bg-[#ff5f57] opacity-80" />
              <span className="size-2.5 rounded-full bg-[#febc2e] opacity-80" />
              <span className="size-2.5 rounded-full bg-[#28c840] opacity-80" />
            </span>
            {languageLabel && (
              <span className="truncate text-xs font-medium text-muted-foreground">
                {languageLabel}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {children ?? (
              <CodeBlockCopyButton
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="Copy code"
              />
            )}
          </div>
        </div>
        <div className="relative">
          <div className="overflow-y-auto dark:hidden">{renderBody(html)}</div>
          <div className="hidden overflow-y-auto dark:block">
            {renderBody(darkHtml)}
          </div>
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};
