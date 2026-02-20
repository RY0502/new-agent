'use client';

import { CopilotChat } from "@copilotkit/react-ui";
import UserStatus from "@/components/UserStatus";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, StopCircle, ThumbsUp, ThumbsDown, Upload, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStatus } from "@/hooks/useAuthStatus";

export default function Home() {
  const { loggedIn, loading, login } = useAuthStatus();
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
                <CopilotChat
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
                        <span className="copilotKitActivityDot" />
                        <span className="copilotKitActivityDot" style={{ animationDelay: "0.15s" }} />
                        <span className="copilotKitActivityDot" style={{ animationDelay: "0.3s" }} />
                      </div>
                    ),
                    spinnerIcon: (
                      <div className="inline-flex items-center gap-1">
                        <span className="copilotKitActivityDot" />
                        <span className="copilotKitActivityDot" style={{ animationDelay: "0.15s" }} />
                        <span className="copilotKitActivityDot" style={{ animationDelay: "0.3s" }} />
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
                {!loading && !loggedIn && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                    <div className="glass rounded-2xl p-6 shadow-lg text-center">
                      <div className="text-lg font-semibold mb-2">Sign in to continue</div>
                      <div className="text-sm text-muted-foreground mb-4">
                        Please sign in before sending a message.
                      </div>
                      <Button
                        variant="default"
                        className="rounded-full h-10 px-5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:shadow-lg hover:from-indigo-600 hover:to-cyan-600 active:scale-[0.98] transition-all"
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
      <footer className="relative z-10 w-full py-4 md:py-6 px-4 mt-auto flex items-center justify-center">
        <div className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 shadow-md border">
          <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
          <span className="text-xs md:text-sm text-muted-foreground/80">Crafted with</span>
          <span className="text-xs md:text-sm font-medium">LangGraph + CopilotKit</span>
          <span className="mx-1.5 text-indigo-500 dark:text-indigo-400">✨</span>
          <span className="text-xs md:text-sm text-muted-foreground/80">by</span>
          <span className="ml-1.5 gradient-text font-semibold">RYaxn</span>
        </div>
      </footer>
    </div>
  );
}
