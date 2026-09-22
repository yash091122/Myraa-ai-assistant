import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Globe, Maximize2, Search, ArrowRight } from "lucide-react";

export interface BrowserAgentProps {
  url: string;
  onClose: () => void;
  actionTrigger?: {
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null;
}

export function BrowserAgent({ url, onClose, actionTrigger }: BrowserAgentProps) {
  const [currentUrl, setCurrentUrl] = useState(url);

  useEffect(() => {
    setCurrentUrl(url);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [url]);

  useEffect(() => {
    if (actionTrigger) {
      const { type, args, callback } = actionTrigger;
      
      if (type === "browserOpen" || type === "openWebsite") {
        const dest = args.url || "https://google.com";
        setCurrentUrl(dest);
        window.open(dest, "_blank", "noopener,noreferrer");
        callback({ result: `Opened ${dest} in real browser` });
      } else if (type === "browserSearch") {
        const dest = `https://google.com/search?q=${encodeURIComponent(args.query)}`;
        setCurrentUrl(dest);
        window.open(dest, "_blank", "noopener,noreferrer");
        callback({ result: `Searching for ${args.query} in real browser` });
      } else {
        callback({ error: `Tool ${type} is not supported in real-browser mode.` });
      }
    }
  }, [actionTrigger]);

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-4 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-950/60 backdrop-blur-xl shadow-lg w-full max-w-md"
      >
        <div className="flex items-center gap-3 overflow-hidden text-left">
          <div className="p-2 ml-1 rounded-xl bg-indigo-500/20 text-indigo-300">
            <Globe size={18} />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-xs font-bold font-mono tracking-wide text-indigo-200 uppercase">External Browser Link</h4>
            <p className="text-xs text-indigo-400 truncate max-w-[200px]">{currentUrl}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => window.open(currentUrl, "_blank", "noopener,noreferrer")}
            className="p-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 transition"
            title="Re-open in browser"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition"
          >
            <X size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
