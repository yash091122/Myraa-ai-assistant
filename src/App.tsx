import { useState, useEffect, useRef } from "react";
import { MyraaAudioSession, LiveState } from "./lib/audio";
import { MyraaCoreVisualizer, MyraaEmotion } from "./components/MyraaCoreVisualizer";
import { BrowserAgent } from "./components/BrowserAgent";
import { createPortal } from "react-dom";
import { 
  Power, 
  Volume2, 
  Info, 
  Sparkles, 
  Globe, 
  Maximize2, 
  MessageSquareOff, 
  Compass, 
  CircleAlert,
  MicOff,
  Mic,
  X,
  Brain,
  Monitor,
  Play,
  Pause,
  Square,
  RefreshCw,
  ExternalLink,
  AudioLines
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Memory, MemoryCategory, CompanionState } from "./lib/memoryTypes";
import { MemoryDashboard } from "./components/MemoryDashboard";

export default function App() {
  const [state, setState] = useState<LiveState>("disconnected");
  const [companionState, setCompanionState] = useState<CompanionState>({
    userMood: "neutral",
    relationshipLevel: 1,
    favoriteTopics: [],
    activeMode: "default"
  });

  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isScreenSharingPaused, setIsScreenSharingPaused] = useState<boolean>(false);
  const [screenVisionMode, setScreenVisionMode] = useState<boolean>(true);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<any>(null);

  const isPausedRef = useRef<boolean>(false);
  const screenVisionRef = useRef<boolean>(true);
  const stateRef = useRef<LiveState>("disconnected");

  useEffect(() => {
    isPausedRef.current = isScreenSharingPaused;
  }, [isScreenSharingPaused]);

  useEffect(() => {
    screenVisionRef.current = screenVisionMode;
  }, [screenVisionMode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
    };
  }, []);

  const captureFrameAndSend = () => {
    const video = screenVideoRef.current;
    if (!video || isPausedRef.current || !screenVisionRef.current) {
      return;
    }

    if (stateRef.current === "disconnected") {
      return;
    }

    try {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = screenCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const maxDim = 960;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(video, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
      const base64 = dataUrl.split(",")[1];

      if (sessionRef.current) {
        sessionRef.current.sendVideoFrame(base64);
      }
    } catch (err) {
      console.error("[Screen Capture] Failed drawing frame to canvas:", err);
    }
  };

  const startScreenSharing = async () => {
    setErrorText(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 5 }
        },
        audio: false
      });

      screenStreamRef.current = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(e => console.error("Video play warning:", e));
      screenVideoRef.current = video;

      setIsScreenSharing(true);
      setIsScreenSharingPaused(false);

      stream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };

      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
      screenIntervalRef.current = setInterval(() => {
        captureFrameAndSend();
      }, 2000);

      setTimeout(() => {
        captureFrameAndSend();
      }, 500);

    } catch (e: any) {
      console.error("Screen sharing permission declined or missing API:", e);
      if (e.name !== "NotAllowedError") {
        setErrorText(`Could not capture screen: ${e.message || e}`);
      }
    }
  };

  const stopScreenSharing = () => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      screenStreamRef.current = null;
    }

    if (screenVideoRef.current) {
      screenVideoRef.current.pause();
      screenVideoRef.current = null;
    }

    setIsScreenSharing(false);
    setIsScreenSharingPaused(false);
  };

  const pauseScreenSharing = () => {
    setIsScreenSharingPaused(true);
  };

  const resumeScreenSharing = () => {
    setIsScreenSharingPaused(false);
    setTimeout(() => {
      captureFrameAndSend();
    }, 100);
  };

  const switchScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
    }
    await startScreenSharing();
  };

  const [activeEmotion, setActiveEmotion] = useState<MyraaEmotion>("idle");
  const [themeColor, setThemeColor] = useState<string>("charcoal");
  const [userCaption, setUserCaption] = useState<string>("");
  const [characterState, setCharacterState] = useState<"idle" | "thinking" | "talking">("idle");

  const detectEmotionFromText = (text: string): MyraaEmotion => {
    const lower = text.toLowerCase();
    if (lower.includes("haha") || lower.includes("lol") || lower.includes("funny") || lower.includes("joke") || lower.includes("hehe") || lower.includes("wink")) return "playful";
    if (lower.includes("happy") || lower.includes("harmony") || lower.includes("glad") || lower.includes("joy") || lower.includes("wonderful") || lower.includes("love") || lower.includes("smile")) return "happy";
    if (lower.includes("wow") || lower.includes("awesome") || lower.includes("excited") || lower.includes("amazing") || lower.includes("yay") || lower.includes("incredible") || lower.includes("hype")) return "excited";
    if (lower.includes("really?") || lower.includes("curious") || lower.includes("interest") || lower.includes("tell me more") || lower.includes("why") || lower.includes("how") || lower.includes("wonder")) return "curious";
    if (lower.includes("think") || lower.includes("calculat") || lower.includes("analyz") || lower.includes("hmmm") || lower.includes("process") || lower.includes("let me see") || lower.includes("conclude")) return "thinking";
    if (lower.includes("proud") || lower.includes("achieved") || lower.includes("expert") || lower.includes("skill") || lower.includes("confidence") || lower.includes("succeed")) return "proud";
    if (lower.includes("sad") || lower.includes("sorry") || lower.includes("unfortunate") || lower.includes("grief") || lower.includes("bad") || lower.includes("regret") || lower.includes("alas") || lower.includes("cry")) return "sad";
    if (lower.includes("shock") || lower.includes("surprise") || lower.includes("gasp") || lower.includes("unexpected") || lower.includes("seriously") || lower.includes("oh my")) return "surprised";
    if (lower.includes("blush") || lower.includes("shy") || lower.includes("embarrass") || lower.includes("nervous") || lower.includes("oops") || lower.includes("sorry about")) return "embarrassed";
    if (lower.includes("what?") || lower.includes("confus") || lower.includes("puzzled") || lower.includes("dont know") || lower.includes("not sure") || lower.includes("wait")) return "confused";
    return "idle";
  };
  const [modelCaption, setModelCaption] = useState<string>("");
  const [activeProjectorUrl, setActiveProjectorUrl] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [browserTrigger, setBrowserTrigger] = useState<{
    type: string;
    args: any;
    id: string;
    callback: (res: any) => void;
  } | null>(null);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemoryDashboard, setShowMemoryDashboard] = useState<boolean>(false);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  const sessionRef = useRef<MyraaAudioSession | null>(null);

  useEffect(() => {
    fetch("/api/memories")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMemories(data);
        }
      })
      .catch(err => console.error("Initial persistent recollections load failure:", err));

    fetch("/api/state")
      .then(res => res.json())
      .then(data => {
        if (data) setCompanionState(data);
      })
      .catch(err => console.error("Initial companion state load failure:", err));
  }, []);

  const handleAddManualMemory = async (category: MemoryCategory, text: string) => {
    try {
      const resp = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text })
      });
      const saved = await resp.json();
      if (saved && saved.id) {
        setMemories((prev) => [...prev, saved]);
      }
    } catch (err) {
      console.error("Manual database recollect upload error:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, {
        method: "DELETE"
      });
      const resObj = await resp.json();
      if (resObj && resObj.success) {
        setMemories((prev) => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error("Manual memory delete execution failed:", err);
    }
  };

  useEffect(() => {
    sessionRef.current = new MyraaAudioSession({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "disconnected") {
          setUserCaption("");
          setModelCaption("");
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "listening") {
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "speaking") {
          setCharacterState("talking");
        }
      },
      onTranscription: (role, text) => {
        if (role === "user") {
          setUserCaption(text);
          setModelCaption("");
          setCharacterState("thinking");
        } else if (role === "model") {
          const emotionMatch = text.match(/\[EMOTION:([a-zA-Z]+)\]/i);
          let cleanText = text;
          if (emotionMatch) {
            const parsedEmotion = emotionMatch[1].toLowerCase() as MyraaEmotion;
            setActiveEmotion(parsedEmotion);
            cleanText = text.replace(/\[EMOTION:[a-zA-Z]+\]/gi, "");
          } else {
            const fallbackEmotion = detectEmotionFromText(text);
            if (fallbackEmotion !== "idle") {
              setActiveEmotion(fallbackEmotion);
            }
          }
          
          setModelCaption((prev) => prev + cleanText);
          setUserCaption("");
        }
      },
      onToolCall: (name, args, callback) => {
        const browserTools = [
          "browserOpen", "browserSearch", "browserClick", "browserMediaControl", "browserScroll", "browserType", "browserGoBack", "browserTabAction", "openWebsite"
        ];

        if (browserTools.includes(name)) {
          if (!activeProjectorUrl) {
            let startingUrl = "https://youtube.com";
            if ((name === "browserOpen" || name === "openWebsite") && args.url) {
              startingUrl = args.url;
            }
            setActiveProjectorUrl(startingUrl);
          }

          setBrowserTrigger({
            type: name === "openWebsite" ? "browserOpen" : name,
            args,
            id: Math.random().toString(),
            callback: (res) => {
              callback(res);
              setBrowserTrigger(null);
            }
          });
        } else if (name === "changeBackground") {
          const colorName = args.color?.toLowerCase();
          const validColors = ["violet", "crimson", "emerald", "celestial", "gold", "rose", "charcoal"];
          
          if (colorName && validColors.includes(colorName)) {
            setThemeColor(colorName);
            callback({ result: `Successfully shifted aesthetic atmosphere to ${colorName}.` });
          } else {
            callback({ error: `Unsupported color '${colorName}'. Supported themes are: ${validColors.join(", ")}` });
          }
        } else {
          callback({ error: `Tool ${name} is not implemented.` });
        }
      },
      onError: (err) => {
        setErrorText(err);
      },
      onMemorySync: (updatedMemories) => {
        if (Array.isArray(updatedMemories)) {
          setMemories(updatedMemories);
        }
      }
    });

    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
    };
  }, [activeProjectorUrl]);

  const handleToggleConnection = async () => {
    setErrorText(null);
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      await sessionRef.current.connect();
    } else {
      sessionRef.current.disconnect();
    }
  };

  const handleOpenPip = async () => {
    if (isElectron) {
      (window as any).electronAPI.popOut();
      setIsPoppedOut(true);
      return;
    }
    // @ts-ignore
    if (!('documentPictureInPicture' in window)) {
      alert("Document Picture-in-Picture is not supported in this browser.");
      return;
    }
    try {
      // @ts-ignore
      const win = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 480,
      });

      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          win.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = styleSheet.media.mediaText;
          if (styleSheet.href) {
            link.href = styleSheet.href;
            win.document.head.appendChild(link);
          }
        }
      });

      win.document.title = "Myraa AI";
      win.document.body.style.margin = '0';
      win.document.body.style.backgroundColor = 'transparent';
      win.addEventListener('pagehide', () => setPipWindow(null));
      
      setPipWindow(win);
    } catch (err) {
      console.error('Failed to open PiP window:', err);
      alert("Failed to open PiP window. You might need to interact with the page first.");
    }
  };

  const widgetContent = (
    <div className="relative w-full h-full flex flex-col">
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        <MyraaCoreVisualizer
          session={sessionRef.current}
          state={state}
          themeColor={themeColor}
          activeEmotion={activeEmotion}
          characterState={characterState}
          isWidgetMode={true}
        />
      </div>
      
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-auto">
        <button 
          onClick={() => setShowMemoryDashboard(!showMemoryDashboard)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 text-white transition text-[10px] font-mono tracking-widest cursor-pointer backdrop-blur-md"
          title="Recollections Database"
        >
          <Brain size={12} />
          <span>RECALLS</span>
        </button>
        <div className="flex items-center gap-2">
          {!pipWindow && !isPoppedOut && (
            <button 
              onClick={handleOpenPip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 text-indigo-300 transition text-[10px] font-mono tracking-widest cursor-pointer backdrop-blur-md"
              title="Pop out into floating window"
            >
              <ExternalLink size={12} />
              <span>POP OUT</span>
            </button>
          )}
          <button 
            onClick={isScreenSharing ? stopScreenSharing : startScreenSharing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition text-[10px] font-mono tracking-widest cursor-pointer backdrop-blur-md ${
              isScreenSharing 
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]" 
                : "bg-white/5 hover:bg-white/20 border-white/10 text-white"
            }`}
            title="Share Screen with Myraa"
          >
            <Monitor size={12} className={isScreenSharing && !isScreenSharingPaused ? "animate-pulse" : ""} />
            <span>{isScreenSharing ? "WATCHING" : "WATCH"}</span>
          </button>
        </div>
      </div>

      <div id="cinematic-subtitles" className="absolute bottom-[90px] left-0 right-0 px-4 flex flex-col items-center justify-center text-center z-25 pointer-events-none min-h-[4rem]">
        <AnimatePresence mode="wait">
          {(() => {
            const textType = modelCaption ? "model" : userCaption ? "user" : "status";
            const activeText = modelCaption ? modelCaption : userCaption ? userCaption : state === "listening" ? "Listening..." : state === "connecting" ? "Connecting..." : "Core sleeping.";
            return (
              <motion.div key={textType} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }} className="flex flex-col items-center justify-center w-full">
                {textType === "model" && <h2 className="text-sm sm:text-base font-medium text-white leading-relaxed tracking-wide font-display max-w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{activeText}</h2>}
                {textType === "user" && <p className="text-purple-300 font-mono text-[10px] tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /><span>&ldquo;{activeText}&rdquo;</span></p>}
                {textType === "status" && <p className="text-white/40 font-mono text-[9px] uppercase tracking-[0.2em] font-bold drop-shadow-md">{activeText}</p>}
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-auto">
        <button
          onClick={handleToggleConnection}
          className={`relative group flex items-center justify-center w-14 h-14 rounded-full transition-all duration-500 overflow-hidden ${
            state === "speaking" || state === "listening"
              ? "bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.1)]"
              : "bg-white text-black hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.4)]"
          } border`}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {state === "listening" ? (
              <div className="flex items-center justify-center gap-1">
                <span className="w-1 h-3 bg-white rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                <span className="w-1 h-5 bg-white rounded-full animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
                <span className="w-1 h-3 bg-white rounded-full animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
              </div>
            ) : (
              <AudioLines size={20} className={state === "speaking" ? "text-white" : "text-black"} />
            )}
          </div>
        </button>
      </div>
    </div>
  );

  const getAmbientStyles = () => {
    switch (themeColor) {
      case "violet": return "from-purple-100/30 via-violet-50/10 to-transparent";
      case "crimson": return "from-rose-100/30 via-orange-50/10 to-transparent";
      case "emerald": return "from-emerald-100/30 via-teal-50/10 to-transparent";
      case "celestial": return "from-sky-100/30 via-indigo-50/10 to-transparent";
      case "gold": return "from-amber-100/30 via-yellow-50/10 to-transparent";
      case "rose": return "from-pink-100/30 via-rose-50/10 to-transparent";
      case "charcoal": default: return "from-indigo-100/30 via-slate-50/10 to-transparent";
    }
  };

  return (
    <div
      id="myraa-holographic-desktop"
      className={`relative w-full h-screen overflow-hidden bg-transparent text-slate-800 ${!isPoppedOut ? getAmbientStyles() : ''} theme-transition flex flex-col justify-between p-6 sm:p-10 select-none`}
    >
      {!isPoppedOut && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-indigo-800/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(147,51,234,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-60" />
        </>
      )}

      {activeProjectorUrl ? (
        pipWindow ? (
          createPortal(
            <div className="w-full h-full bg-slate-950/80 backdrop-blur-3xl overflow-hidden relative">
              {widgetContent}
            </div>,
            pipWindow.document.body
          )
        ) : isPoppedOut ? (
          <div className="absolute inset-0 w-full h-full z-[100] pointer-events-auto bg-transparent flex flex-col">
            {/* Draggable header for Electron window */}
            <div className="w-full h-8 absolute top-0 left-0 z-50 pointer-events-auto" style={{ WebkitAppRegion: 'drag' } as any} />
            <button 
              onClick={() => { setIsPoppedOut(false); (window as any).electronAPI.restoreWindow(); }}
              className="absolute top-2 right-2 z-50 bg-white/10 hover:bg-white/20 border border-white/20 p-1.5 rounded-full text-white pointer-events-auto cursor-pointer"
              title="Restore Window"
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              <Maximize2 size={12} />
            </button>
            {widgetContent}
          </div>
        ) : (
          <motion.div
            drag
            dragMomentum={false}
            className="fixed bottom-6 right-6 w-[360px] h-[480px] z-[100] pointer-events-auto rounded-[32px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-white/20 bg-slate-950/80 backdrop-blur-3xl flex flex-col cursor-grab active:cursor-grabbing"
          >
            {widgetContent}
          </motion.div>
        )
      ) : (
        <>
          <div className="absolute inset-0 z-0 pointer-events-none select-none">
            <MyraaCoreVisualizer
              session={sessionRef.current}
              state={state}
              themeColor={themeColor}
              activeEmotion={activeEmotion}
              characterState={characterState}
            />
          </div>

          <header className="relative z-30 flex items-center justify-between w-full max-w-5xl mx-auto select-none">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-[0.4em] text-purple-900/70 uppercase font-sans">Myraa OS</span>
              <div className={`w-1.5 h-1.5 rounded-full ${state === "listening" || state === "speaking" ? "bg-purple-500" : "bg-purple-900/20"}`} />
            </div>
            <div className="flex items-center gap-5">
              <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-1 opacity-40 hover:opacity-100 text-purple-950 transition text-xs font-mono tracking-widest cursor-pointer" title="Sway Themes and Info">
                <Compass size={14} /><span className="hidden sm:inline">TOPICS</span>
              </button>
              <button onClick={() => setShowMemoryDashboard(!showMemoryDashboard)} className="flex items-center gap-1 opacity-40 hover:opacity-100 text-purple-950 transition text-xs font-mono tracking-widest cursor-pointer" title="Recollections Database">
                <Brain size={14} /><span className="hidden sm:inline">RECALLS</span>
              </button>
              <button onClick={isScreenSharing ? stopScreenSharing : startScreenSharing} className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${isScreenSharing ? "text-purple-600 opacity-100 font-bold" : "opacity-40 hover:opacity-100 text-purple-950"}`} title="Share Screen with Myraa">
                <Monitor size={14} className={isScreenSharing && !isScreenSharingPaused ? "animate-pulse text-purple-600" : ""} /><span>{isScreenSharing ? "SHARING" : "SHARE SCREEN"}</span>
              </button>
            </div>
          </header>

          <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-6">
            <div className="h-10 sm:h-20" />
            
            <div id="cinematic-subtitles" className="w-full max-w-3xl flex flex-col items-center justify-center text-center px-6 relative z-25 mt-auto mb-6 pointer-events-none min-h-[6rem]">
              <AnimatePresence mode="wait">
                {(() => {
                  const textType = modelCaption ? "model" : userCaption ? "user" : "status";
                  const activeText = modelCaption ? modelCaption : userCaption ? userCaption : state === "listening" ? "I am listening. Speak freely..." : state === "connecting" ? "Materializing presence links..." : "Connect memory core to awaken my voice.";
                  return (
                    <motion.div key={textType} initial={{ opacity: 0, y: 15, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -15, filter: "blur(6px)" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center justify-center w-full">
                      {textType === "model" && <h2 className="text-xl sm:text-2xl font-medium text-purple-950 leading-relaxed tracking-wide font-display max-w-2xl drop-shadow-[0_2px_15px_rgba(255,255,255,0.9)]">{activeText}</h2>}
                      {textType === "user" && <p className="text-purple-700 font-mono text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_10px_rgba(255,255,255,0.85)] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /><span>&ldquo;{activeText}&rdquo;</span></p>}
                      {textType === "status" && <span className="text-xs sm:text-sm uppercase tracking-[0.3em] font-semibold text-purple-900/50 font-sans tracking-widest drop-shadow-[0_1px_4px_rgba(255,255,255,0.5)]">{activeText}</span>}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {showGuide && (
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="mt-6 p-5 rounded-2xl border border-white/40 bg-white/30 backdrop-blur-2xl max-w-md text-left w-full absolute z-40 shadow-[0_8px_32px_rgba(147,51,234,0.15)]">
                  <div className="flex items-center justify-between mb-3 text-purple-950">
                    <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide"><Compass size={16} className="text-purple-600" /><span>PLAYFUL CORE SUGGESTIONS</span></div>
                    <button onClick={() => setShowGuide(false)} className="text-purple-700 hover:text-purple-950 transition"><X size={14} /></button>
                  </div>
                  <p className="text-xs text-slate-700 mb-4 font-mono leading-relaxed">Myraa is equipped with dynamic visual modules and standard text browser projectors. Here are clever triggers to try speaking aloud:</p>
                  <div className="space-y-2 text-xs font-serif italic text-purple-700">
                    <div className="p-2.5 rounded-xl bg-white/40 border border-white/50 hover:bg-white/60 transition cursor-pointer font-sans normal-case text-purple-950 shadow-sm">⚡ &quot;Myraa, change atmosphere of your core to crimson&quot; <span className="text-[10px] font-mono text-purple-600 block mt-0.5 font-medium">Shifts theme color background</span></div>
                    <div className="p-2.5 rounded-xl bg-white/40 border border-white/50 hover:bg-white/60 transition cursor-pointer font-sans normal-case text-purple-950 shadow-sm">⚡ &quot;Open youtube.com on my screen please&quot; <span className="text-[10px] font-mono text-purple-600 block mt-0.5 font-medium">Invokes browser projector panel</span></div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {errorText && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }} className="mt-6 flex items-start gap-3 p-4 rounded-2xl border border-rose-400/30 bg-white/40 backdrop-blur-xl shadow-lg max-w-md w-full text-left">
                  <CircleAlert className="text-rose-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-rose-600 font-mono">Core Error Protocol</h4>
                    <p className="text-xs text-rose-800 mt-1 leading-relaxed">{errorText}</p>
                    <button onClick={() => setErrorText(null)} className="mt-2 text-[10px] font-bold text-rose-500 underline font-mono uppercase hover:text-rose-700">Dismiss Code</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <footer className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-5 mt-auto">
            <div className="flex items-center justify-center gap-1 h-8 w-44">
              {[12, 28, 16, 32, 20, 8].map((baseHeight, idx) => {
                let heightFactor = 0.35;
                if (state === "speaking") heightFactor = 0.35 + Math.sin(Date.now() * 0.02 + idx * 0.9) * 0.65;
                else if (state === "listening") heightFactor = 0.2 + Math.sin(Date.now() * 0.01 + idx * 0.5) * 0.4;
                else heightFactor = idx % 2 === 0 ? 0.25 : 0.12;
                const calculatedHeight = Math.max(3, baseHeight * heightFactor);
                return <div key={idx} className={`w-0.5 rounded-full transition-all duration-300 ${state === "speaking" ? "bg-purple-400" : state === "listening" ? "bg-cyan-400" : "bg-white/10"}`} style={{ height: `${calculatedHeight}px` }} />;
              })}
            </div>
            <div className="flex items-center justify-center relative mb-4">
              <button 
                onClick={handleToggleConnection}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer backdrop-blur-xl ${state === "disconnected" ? "bg-white/40 hover:bg-white/60 border border-white/50 text-purple-950 shadow-[0_8px_32px_rgba(147,51,234,0.15)] hover:scale-105 active:scale-95" : state === "listening" ? "bg-white/60 hover:bg-white/80 border border-purple-400/80 text-purple-600 shadow-[0_0_40px_rgba(147,51,234,0.3)] animate-pulse scale-105" : state === "speaking" ? "bg-purple-500/90 hover:bg-purple-600 border border-purple-300 text-white shadow-[0_0_40px_rgba(168,85,247,0.5)] scale-105" : "bg-amber-100 border border-amber-300 text-amber-600 animate-spin"}`}
                title={state === "disconnected" ? "Awake Myraa" : "Sleep core"}
              >
                {state === "disconnected" ? <Power className="opacity-80" size={24} /> : state === "connecting" ? <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /> : state === "listening" ? <Mic size={24} className="text-purple-600" /> : <Volume2 size={24} className="text-white" />}
              </button>
            </div>
          </footer>
        </>
      )}

      <AnimatePresence>
        {activeProjectorUrl && !pipWindow && (
          <BrowserAgent
            url={activeProjectorUrl}
            onClose={() => {
              setActiveProjectorUrl(null);
              setBrowserTrigger(null);
            }}
            actionTrigger={browserTrigger}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScreenSharing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 50 }}
            className={`absolute bottom-6 md:bottom-10 right-6 md:right-10 z-50 w-72 p-4 rounded-2xl border ${isScreenSharingPaused ? "border-amber-500/20 bg-slate-950/70" : "border-cyan-500/20 bg-slate-950/70"} backdrop-blur-2xl shadow-2xl overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isScreenSharingPaused ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`} />
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-200">{isScreenSharingPaused ? "SCREEN VISION PAUSED" : "SCREEN VISION ACTIVE"}</span>
              </div>
              <button onClick={stopScreenSharing} className="text-slate-400 hover:text-white transition-colors duration-150 p-1 rounded-lg hover:bg-white/5 cursor-pointer" title="Stop Sharing"><X size={14} /></button>
            </div>
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 mb-3 flex items-center justify-center group select-none">
              <video
                ref={(el) => {
                  if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                    el.srcObject = screenStreamRef.current;
                    el.muted = true;
                    el.play().catch(err => console.log("Mini preview stream play issue:", err));
                  }
                }}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isScreenSharingPaused ? "opacity-30 blur-sm" : "opacity-90"}`}
                autoPlay playsInline muted
              />
            </div>
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              {isScreenSharingPaused ? (
                <button onClick={resumeScreenSharing} className="flex-1 py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-xs font-mono font-medium text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"><Play size={10} /><span>Resume</span></button>
              ) : (
                <button onClick={pauseScreenSharing} className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs font-mono font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"><Pause size={10} /><span>Pause</span></button>
              )}
              <button onClick={switchScreenShare} className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"><RefreshCw size={11} /><span>Switch</span></button>
              <button onClick={stopScreenSharing} className="py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-mono text-rose-400 flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"><Square size={9} /><span>Stop</span></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MemoryDashboard
        isOpen={showMemoryDashboard}
        onClose={() => setShowMemoryDashboard(false)}
        memories={memories}
        onAddMemory={handleAddManualMemory}
        onDeleteMemory={handleDeleteMemory}
        themeColor={themeColor}
      />
    </div>
  );
}
