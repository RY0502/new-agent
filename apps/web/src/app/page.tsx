'use client';

import { CopilotChat } from "@copilotkit/react-ui";
import UserStatus from "@/components/UserStatus";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, StopCircle, ThumbsUp, ThumbsDown, Upload, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useEffect, useRef, useState } from "react";
import "@/a2ui/register";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'a2-status': any;
      'a2-section': any;
      'a2-result': any;
      'a2-progress': any;
      'a2-list': any;
      'a2-table': any;
      'a2-tabs': any;
      'a2-code': any;
      'a2-action': any;
      'a2-row': any;
      'a2-image': any;
      'a2-column': any;
      'a2-text': any;
      'a2-icon': any;
      'a2-divider': any;
      'a2-button': any;
      'a2-textfield': any;
      'a2-checkbox': any;
      'a2-card': any;
      'a2-modal': any;
      'a2ui-status': any;
      'a2ui-section': any;
      'a2ui-result': any;
      'a2ui-progress': any;
      'a2ui-list': any;
      'a2ui-table': any;
      'a2ui-tabs': any;
      'a2ui-code': any;
    }
  }
}

/**
 * Robustly extracts the text content from a React node, 
 * recursing through children if necessary.
 * Also strips markdown backticks and common LLM prose artifacts.
 */
function getNodeText(n: React.ReactNode): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map((c) => getNodeText(c)).join("");
  if (typeof n === "object") {
    const node = n as any;
    if (node.props?.children) return getNodeText(node.props.children);
    if (node.type === "br") return "\n";
  }
  return "";
}

function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="sticky top-0 z-40 w-full mb-2">
      <div className="h-1 w-full bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full animate-progress" />
      </div>
    </div>
  );
}

/**
 * Inline 'Thinking' indicator that appears at the bottom of the chat list.
 */
function ThinkingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="flex items-center space-x-2 px-4 py-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex space-x-1.5 items-center bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl px-4 py-2.5 shadow-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500/80 dark:text-indigo-400/80 mr-1">Thinking</span>
        <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s]" />
        <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
        <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.3s]" />
      </div>
    </div>
  );
}

// ─── A2UI Tag Bridge Renderers ─────────────────────────────────────────────

function StatusTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  return <a2-status text={text} />;
}
function SectionTag({ children }: { children?: React.ReactNode }) {
  return <a2-section>{children}</a2-section>;
}
function ResultTag({ children }: { children?: React.ReactNode }) {
  return <a2-result>{children}</a2-result>;
}
function ProgressTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  return <a2-progress data={text} />;
}
function ActionTag({ children }: { children?: React.ReactNode }) {
  return <a2-action>{children}</a2-action>;
}
function RowTag({ children }: { children?: React.ReactNode }) {
  return <a2-row>{children}</a2-row>;
}
function ListTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  return <a2-list data={text}>{children}</a2-list>;
}
function TableTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  return <a2-table data={text}>{children}</a2-table>;
}
function ImageTag({ children }: { children?: React.ReactNode }) {
  return <a2-image>{children}</a2-image>;
}
function CodeTag({ children, ...props }: any) {
  return <a2-code language={props?.language}>{children}</a2-code>;
}
function ColumnTag({ children }: { children?: React.ReactNode }) {
  return <a2-column>{children}</a2-column>;
}
function TextTag({ children }: { children?: React.ReactNode }) {
  return <a2-text>{children}</a2-text>;
}
function IconTag({ children }: { children?: React.ReactNode }) {
  return <a2-icon>{children}</a2-icon>;
}
function DividerTag() {
  return <a2-divider />;
}
function ButtonTag({ children }: { children?: React.ReactNode }) {
  return <a2-button>{children}</a2-button>;
}
function TextFieldTag({ children }: { children?: React.ReactNode }) {
  return <a2-textfield>{children}</a2-textfield>;
}
function CheckBoxTag({ children }: { children?: React.ReactNode }) {
  return <a2-checkbox>{children}</a2-checkbox>;
}
function CardTag({ children }: { children?: React.ReactNode }) {
  return <a2-card>{children}</a2-card>;
}
function ModalTag({ children }: { children?: React.ReactNode }) {
  return <a2-modal>{children}</a2-modal>;
}
function TabsTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  return <a2-tabs data={text}>{children}</a2-tabs>;
}

export default function Home() {
  const { loggedIn, loading, login } = useAuthStatus();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 400);
    return () => clearInterval(id);
  }, [streaming]);
  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <div className="aurora-bg" />
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-50/50 via-cyan-50/30 to-violet-50/50 dark:from-indigo-950/20 dark:via-cyan-950/10 dark:to-violet-950/20 pointer-events-none" />
      <main className="relative z-10 flex-1 flex flex-col p-4 md:p-6 pb-2">
        <header className="flex items-center justify-between w-full mb-8 md:mb-12">
          <div className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <Sparkles className="relative h-8 w-8 md:h-10 md:w-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-headline gradient-text">Definitive AI</h1>
          </div>
          <div className="absolute right-4 top-4 md:right-6 md:top-6 z-20">
            <UserStatus />
          </div>
        </header>
        <div className={cn("flex-1 flex flex-col items-stretch justify-stretch")}>
          <div className={cn("w-full h-full mt-2 md:mt-4")}>
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                {/* Global loading bar remains at top */}
                <LoadingBar active={streaming} />

                <CopilotChat
                  className="w-full h-full"
                  markdownTagRenderers={{
                    // Main layout tags
                    section: SectionTag,

                    // New unique A2UI tags
                    "a2-status": StatusTag,
                    "a2-section": SectionTag,
                    "a2-result": ResultTag,
                    "a2-progress": ProgressTag,
                    "a2-list": ListTag,
                    "a2-table": TableTag,
                    "a2-tabs": TabsTag,
                    "a2-code": CodeTag,

                    // Legacy/Fallback mapping
                    status: StatusTag, wow: StatusTag, result: ResultTag,
                    progress: ProgressTag, action: ActionTag, row: RowTag, list: ListTag,
                    table: TableTag, image: ImageTag, code: CodeTag, column: ColumnTag,
                    tab: TabsTag, text: TextTag, icon: IconTag, divider: DividerTag,
                    button: ButtonTag, textfield: TextFieldTag, checkbox: CheckBoxTag,
                    card: CardTag, modal: ModalTag, tabs: TabsTag,
                  }}
                  onInProgress={(p) => {
                    setStreaming(p);
                    if (p) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                  }}
                  labels={{
                    title: "Your Assistant",
                    initial: "Hi! 👋 How can I assist you today?",
                    placeholder: "Type a message...",
                  }}
                  icons={{
                    openIcon: <Sparkles className="h-5 w-5" />,
                    closeIcon: <X className="h-5 w-5" />,
                    headerCloseIcon: <X className="h-5 w-5" />,
                    sendIcon: <Send className="h-5 w-5" />,
                    activityIcon: (
                      <div className="inline-flex items-center gap-1">
                        <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s]" />
                        <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
                      </div>
                    ),
                    stopIcon: <StopCircle className="h-5 w-5" />,
                    regenerateIcon: <Sparkles className="h-5 w-5" />,
                    copyIcon: <Copy className="h-5 w-5" />,
                    thumbsUpIcon: <ThumbsUp className="h-5 w-5" />,
                    thumbsDownIcon: <ThumbsDown className="h-5 w-5" />,
                    uploadIcon: <Upload className="h-5 w-5" />,
                  }}
                  imageUploadsEnabled={true}
                />

                {/* Inline indicator at the bottom of the list */}
                <ThinkingIndicator active={streaming} />
                <div ref={endRef} />

                {!loading && !loggedIn && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                    <div className="glass rounded-2xl p-6 shadow-lg text-center">
                      <div className="text-lg font-semibold mb-2">Sign in to continue</div>
                      <div className="text-sm text-muted-foreground mb-4">Please sign in before sending a message.</div>
                      <Button
                        variant="default"
                        className="rounded-full h-10 px-5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:shadow-lg transition-all"
                        onClick={login}
                      >
                        Sign In
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="relative z-10 w-full py-3 md:py-6 px-4 mt-auto flex items-center justify-center pb-[env(safe-area-inset-bottom)]">
        <div className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 shadow-md border">
          <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs md:text-sm text-muted-foreground/80">Crafted with</span>
          <span className="mx-1.5 text-indigo-500 dark:text-indigo-400">✨</span>
          <span className="text-xs md:text-sm text-muted-foreground/80">by</span>
          <span className="ml-1.5 gradient-text font-semibold">RYaxn</span>
        </div>
      </footer>
    </div>
  );
}
