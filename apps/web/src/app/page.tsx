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
      'a2-action': any;
      'a2-row': any;
      'a2-list': any;
      'a2-table': any;
      'a2-code': any;
      'a2-column': any;
      'a2-text': any;
      'a2-icon': any;
      'a2-divider': any;
      'a2-button': any;
      'a2-textfield': any;
      'a2-checkbox': any;
      'a2-card': any;
      'a2-modal': any;
      'a2-tabs': any;
      'a2-image': any;
      'a2-video': any;
      'a2-chart': any;
      'a2-stat': any;
      'a2-timeline': any;
      'a2-callout': any;
      'a2-steps': any;
      'a2-badges': any;
      'a2ui-status': any;
      'a2ui-section': any;
      'a2ui-result': any;
      'a2ui-progress': any;
      'a2ui-list': any;
      'a2ui-table': any;
      'a2ui-tabs': any;
      'a2ui-code': any;
      'a2ui-chart': any;
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
    <div className="flex items-center px-6 py-4 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-[20px] px-5 py-3 shadow-2xl">
        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-pulse flex-shrink-0" />
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white whitespace-nowrap">Thinking</span>
        <div className="flex gap-1.5 items-center">
          <div className="h-1 w-1 bg-white/40 rounded-full animate-bounce [animation-duration:0.8s]" />
          <div className="h-1 w-1 bg-white/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
          <div className="h-1 w-1 bg-white/40 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.3s]" />
        </div>
      </div>
    </div>
  );
}

// ─── A2UI Tag Bridge Renderers ─────────────────────────────────────────────

function StatusTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
// @ts-ignore
  return <a2-status text={text} />;
}
function SectionTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-section>{children}</a2-section>;
}
function ResultTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-result>{children}</a2-result>;
}
function ProgressTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-progress data={text} />;
}
function ActionTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-action>{children}</a2-action>;
}
function RowTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-row>{children}</a2-row>;
}
function ListTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-list data={text}>{children}</a2-list>;
}
function TableTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-table data={text}>{children}</a2-table>;
}
function ImageTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-image>{children}</a2-image>;
}
function CodeTag({ children, ...props }: any) {
  // @ts-ignore
  return <a2-code language={props?.language}>{children}</a2-code>;
}
function ColumnTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-column>{children}</a2-column>;
}
function TextTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-text>{children}</a2-text>;
}
function IconTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-icon>{children}</a2-icon>;
}
function DividerTag() {
  // @ts-ignore
  return <a2-divider />;
}
function ButtonTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-button>{children}</a2-button>;
}
function TextFieldTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-textfield>{children}</a2-textfield>;
}
function CheckBoxTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-checkbox>{children}</a2-checkbox>;
}
function CardTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-card>{children}</a2-card>;
}
function ModalTag({ children }: { children?: React.ReactNode }) {
  // @ts-ignore
  return <a2-modal>{children}</a2-modal>;
}
function TabsTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-tabs data={text}>{children}</a2-tabs>;
}
function VideoTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-video data={text}>{children}</a2-video>;
}
function ChartTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-chart data={text}>{children}</a2-chart>;
}
function StatTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-stat data={text}>{children}</a2-stat>;
}
function TimelineTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-timeline data={text}>{children}</a2-timeline>;
}
function CalloutTag({ children, ...props }: any) {
  // @ts-ignore
  return <a2-callout variant={props?.variant} heading={props?.heading || props?.title}>{children}</a2-callout>;
}
function StepsTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-steps data={text}>{children}</a2-steps>;
}
function BadgesTag({ children }: { children?: React.ReactNode }) {
  const text = getNodeText(children);
  // @ts-ignore
  return <a2-badges data={text}>{children}</a2-badges>;
}

export default function Home() {
  const { loggedIn, loading, login } = useAuthStatus();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [clientSkin, setClientSkin] = useState('indigo');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const client = params.get('client');
      if (client) setClientSkin(client);
    }
  }, []);

  useEffect(() => {
    if (!streaming) return;

    let rafId: number;
    let lastScrollTime = 0;
    const SCROLL_THROTTLE = 100; // ms between scroll checks

    const scrollToBottom = (timestamp: number) => {
      if (!streaming) return; // Stop if streaming ended

      // Throttle scroll checks
      if (timestamp - lastScrollTime < SCROLL_THROTTLE) {
        rafId = requestAnimationFrame(scrollToBottom);
        return;
      }
      lastScrollTime = timestamp;

      const container = scrollContainerRef.current;

      if (container) {
        const messagesList = container.querySelector(".copilotKitMessagesList") as HTMLElement | null;
        if (messagesList) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      }

      rafId = requestAnimationFrame(scrollToBottom);
    };

    rafId = requestAnimationFrame(scrollToBottom);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [streaming]);

  return (
    <div className={`client-${clientSkin} relative flex flex-col h-[100dvh] w-full overflow-hidden`}>
      <div className="aurora-bg" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05),transparent_50%)] pointer-events-none" />
      <main className="relative z-10 flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full">
        <header className="flex items-center justify-between gap-3 w-full mb-6 md:mb-10 min-w-0">
          <div className="flex items-center space-x-3 md:space-x-4 group cursor-default min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
              <div className="relative h-12 w-12 flex items-center justify-center rounded-2xl glass border-white/10 group-hover:border-white/20 transition-all duration-300 touch-target">
                <Sparkles className="h-6 w-6 text-indigo-400" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black font-headline tracking-tight text-white truncate">
                Definitive<span className="gradient-text">.AI</span>
              </h1>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 ml-0.5 truncate">Next-Gen Agentic Interface</p>
            </div>
          </div>
          <div className="z-20 flex-shrink-0">
            <UserStatus />
          </div>
        </header>
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="absolute inset-0 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="flex-1 glass rounded-[32px] border-white/10 overflow-hidden shadow-2xl relative flex flex-col">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="flex-1 min-h-0 p-1 flex flex-col relative">
              <LoadingBar active={streaming} />
              <div className="flex-1 min-h-0 relative" ref={scrollContainerRef}>
                <CopilotChat
                  className="premium-chat-customization"
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
                    "a2-image": ImageTag,
                    "a2-video": VideoTag,
                    "a2-chart": ChartTag,
                    "a2-stat": StatTag,
                    "a2-timeline": TimelineTag,
                    "a2-callout": CalloutTag,
                    "a2-steps": StepsTag,
                    "a2-badges": BadgesTag,

                    // Legacy/Fallback mapping
                    status: StatusTag, wow: StatusTag, result: ResultTag,
                    progress: ProgressTag, action: ActionTag, row: RowTag, list: ListTag,
                    table: TableTag, image: ImageTag, code: CodeTag, column: ColumnTag,
                    tab: TabsTag, text: TextTag, icon: IconTag, divider: DividerTag,
                    button: ButtonTag, textfield: TextFieldTag, checkbox: CheckBoxTag,
                    card: CardTag, modal: ModalTag, tabs: TabsTag, video: VideoTag, chart: ChartTag,
                    stat: StatTag, timeline: TimelineTag, callout: CalloutTag,
                    steps: StepsTag, badges: BadgesTag,
                  }}
                  onInProgress={(p) => {
                    setStreaming(p);
                    if (p) {
                      const container = scrollContainerRef.current;
                      const messagesList = container?.querySelector(".copilotKitMessagesList") as HTMLElement | null;
                      if (messagesList) {
                        messagesList.scrollTop = messagesList.scrollHeight;
                      }
                    }
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
              </div>

              {/* Inline indicator at the bottom of the list */}
              <ThinkingIndicator active={streaming} />
              <div ref={endRef} />

              {!loading && !loggedIn && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-md">
                  <div className="glass rounded-[24px] p-8 border-white/20 shadow-2xl text-center max-w-sm mx-4 animate-in zoom-in-95 duration-300">
                    <div className="h-16 w-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="h-8 w-8 text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 text-white">Unlock Intelligence</h2>
                    <p className="text-sm text-white/60 mb-8 leading-relaxed">Join the definitive agentic experience. Sign in to start collaborating with your assistant.</p>
                    <Button
                      variant="premium"
                      size="lg"
                      className="w-full rounded-full font-bold tracking-tight shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                      onClick={login}
                    >
                      Get Started
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <footer className="relative z-10 w-full py-8 px-4 mt-auto flex items-center justify-center pb-[env(safe-area-inset-bottom)]">
        <div className="glass inline-flex items-center gap-3 rounded-full px-6 py-3 shadow-xl border-white/10 hover:border-white/20 transition-all duration-500 group">
          <div className="h-2 w-2 bg-indigo-500 rounded-full animate-pulse group-hover:scale-125 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">Definitive System v2.0</span>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <span className="text-xs font-bold text-white/60">Crafted by <span className="gradient-text font-black">RYaxn</span></span>
        </div>
      </footer>
    </div>
  );
}
