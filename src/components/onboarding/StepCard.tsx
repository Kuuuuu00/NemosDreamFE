import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StepCardProps {
  label: string;
  open: boolean;
  summary?: ReactNode;
  onReopen: () => void;
  children: ReactNode;
  className?: string;
}

export function StepCard({ label, open, summary, onReopen, children, className }: StepCardProps) {
  return (
    <Card className={cn("p-[18px_20px]", className)}>
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key="open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4 text-xs text-muted-foreground">{label}</div>
            {children}
          </motion.div>
        ) : (
          <motion.button
            key="closed"
            type="button"
            onClick={onReopen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex w-full shrink-0 items-center justify-between gap-3 whitespace-nowrap text-left"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
              <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-muted" />
              <span className="truncate text-[15px] font-medium">{summary}</span>
              <span className="shrink-0 text-[13px] text-primary">✓</span>
            </div>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              변경
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </Card>
  );
}
