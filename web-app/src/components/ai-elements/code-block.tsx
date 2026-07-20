import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
};

type CodeBlockContextType = {
  code: string;
  language: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
  language: "",
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
    codeToHtml(code, {
      lang: language,
      theme: "vesper",
      transformers,
    }),
  ]);
}

const CODE_CSS =
  "m-0 overflow-x-hidden bg-background p-4 text-foreground text-sm leading-relaxed whitespace-pre-wrap break-all [&>code]:font-mono [&>code]:text-sm";

const highlightCache = new Map<string, [string, string, string]>();

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const cacheKey = `${language}:${showLineNumbers}:${code}`;
  const cached = highlightCache.get(cacheKey);
  const [html, setHtml] = useState<string>(cached?.[0] ?? "");
  const [darkHtml, setDarkHtml] = useState<string>(cached?.[1] ?? "");
  const [deepDarkHtml, setDeepDarkHtml] = useState<string>(cached?.[2] ?? "");
  const codeRef = useRef(code);

  useEffect(() => {
    codeRef.current = code;
    highlightCode(code, language, showLineNumbers).then(([light, dark, deepDark]) => {
      if (codeRef.current === code) {
        highlightCache.set(cacheKey, [light, dark, deepDark]);
        if (highlightCache.size > 200) {
          const first = highlightCache.keys().next().value;
          if (first) highlightCache.delete(first);
        }
        setHtml(light);
        setDarkHtml(dark);
        setDeepDarkHtml(deepDark);
      }
    });
  }, [code, language, showLineNumbers]);

  const hasHighlighted = Boolean(html);

  return (
    <CodeBlockContext.Provider value={{ code, language }}>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border bg-background text-foreground",
          className,
        )}
        style={{ contain: 'layout', transform: 'translateZ(0)' }}
        {...props}
      >
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-1.5">
          <span className="text-xs text-muted-foreground font-mono">{language}</span>
          <div className="flex items-center gap-1">
            <CodeBlockCopyButton />
            <CodeBlockDownloadButton />
          </div>
        </div>
        <div className="relative">
          {hasHighlighted ? (
            <>
              <div
                className="overflow-x-hidden dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:whitespace-pre-wrap [&>pre]:break-all [&>pre]:overflow-x-hidden [&_code]:font-mono [&_code]:text-sm"
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <div
                className="hidden overflow-x-hidden dark:block deep-dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:whitespace-pre-wrap [&>pre]:break-all [&>pre]:overflow-x-hidden [&_code]:font-mono [&_code]:text-sm"
                dangerouslySetInnerHTML={{ __html: darkHtml }}
              />
              <div
                className="hidden overflow-x-hidden deep-dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:whitespace-pre-wrap [&>pre]:break-all [&>pre]:overflow-x-hidden [&_code]:font-mono [&_code]:text-sm"
                dangerouslySetInnerHTML={{ __html: deepDarkHtml }}
              />
            </>
          ) : (
            <pre className={CODE_CSS}>
              <code>{code}</code>
            </pre>
          )}
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
      <Icon size={14} />
    </Button>
  );
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  rust: "rs",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
  html: "html",
  css: "css",
  json: "json",
  yaml: "yaml",
  markdown: "md",
  bash: "sh",
  shell: "sh",
  sql: "sql",
};

export const CodeBlockDownloadButton = ({
  className,
  ...props
}: ComponentProps<typeof Button>) => {
  const { code, language } = useContext(CodeBlockContext);

  const downloadCode = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ext = LANGUAGE_EXTENSIONS[language] || "txt"
      const targetPath = await invoke<string | null>('save_dialog', {
        options: {
          defaultPath: `code.${ext}`,
          filters: [{ name: language || 'Text', extensions: [ext] }],
        },
      })
      if (targetPath) {
        await invoke('write_file_sync', { args: [targetPath, code] })
      }
    } catch (e) {
      const ext = LANGUAGE_EXTENSIONS[language] || "txt"
      const a = document.createElement("a")
      a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(code)}`
      a.download = `code.${ext}`
      a.click()
    }
  };

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={downloadCode}
      size="icon"
      variant="ghost"
      {...props}
    >
      <DownloadIcon size={14} />
    </Button>
  );
};
