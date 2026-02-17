import { useState, useCallback, useRef, useEffect } from "react";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { AppState, Platform } from "react-native";

type TTSStatus = "idle" | "playing" | "paused";

/**
 * Strip markdown formatting from text to produce clean speech output.
 * Handles headers, bold, italic, links, code blocks, lists, etc.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Remove code blocks (```...```)
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code (`...`)
      .replace(/`[^`]+`/g, "")
      // Remove images ![alt](url)
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Convert links [text](url) to just text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove headers (# ## ### etc)
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
      // Remove strikethrough
      .replace(/~~([^~]+)~~/g, "$1")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, "")
      // Remove blockquotes
      .replace(/^>\s+/gm, "")
      // Clean up list markers (-, *, numbered)
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, "")
      // Collapse multiple newlines
      .replace(/\n{3,}/g, "\n\n")
      // Trim
      .trim()
  );
}

const RATE_OPTIONS = [1.0, 1.5, 2.0] as const;

export function useTTS() {
  const [status, setStatus] = useState<TTSStatus>("idle");
  const [rate, setRate] = useState<number>(1.0);
  const currentTextRef = useRef<string | null>(null);
  const rateRef = useRef<number>(1.0);

  // Keep ref in sync for use in callbacks
  rateRef.current = rate;

  // Stop speech when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && status !== "idle") {
        Speech.stop();
        setStatus("idle");
        currentTextRef.current = null;
      }
    });
    return () => sub.remove();
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text?.trim()) return;

    const cleanText = stripMarkdown(text);
    if (!cleanText) return;

    // Stop any current speech first
    Speech.stop();

    currentTextRef.current = cleanText;
    setStatus("playing");

    Speech.speak(cleanText, {
      language: "en-US",
      rate: rateRef.current,
      pitch: 1.0,
      onDone: () => {
        setStatus("idle");
        currentTextRef.current = null;
      },
      onStopped: () => {
        setStatus("idle");
        currentTextRef.current = null;
      },
      onError: () => {
        setStatus("idle");
        currentTextRef.current = null;
      },
    });
  }, []);

  const pause = useCallback(() => {
    if (Platform.OS === "ios") {
      Speech.pause();
      setStatus("paused");
    } else {
      // Android doesn't support pause, so stop instead
      Speech.stop();
      setStatus("idle");
      currentTextRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (Platform.OS === "ios") {
      Speech.resume();
      setStatus("playing");
    }
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    setStatus("idle");
    currentTextRef.current = null;
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (status === "playing") {
        pause();
      } else if (status === "paused") {
        resume();
      } else {
        speak(text);
      }
    },
    [status, speak, pause, resume]
  );

  // Cycle through 1x → 1.5x → 2x → 1x
  const cycleRate = useCallback(
    (text?: string) => {
      const currentIdx = RATE_OPTIONS.indexOf(rateRef.current as typeof RATE_OPTIONS[number]);
      const nextIdx = (currentIdx + 1) % RATE_OPTIONS.length;
      const newRate = RATE_OPTIONS[nextIdx];
      setRate(newRate);
      rateRef.current = newRate;

      // If currently playing, restart with new rate
      if (currentTextRef.current && status === "playing") {
        Speech.stop();
        const t = text || currentTextRef.current;
        // Small delay to let stop complete
        setTimeout(() => {
          currentTextRef.current = t;
          setStatus("playing");
          Speech.speak(t, {
            language: "en-US",
            rate: newRate,
            pitch: 1.0,
            onDone: () => {
              setStatus("idle");
              currentTextRef.current = null;
            },
            onStopped: () => {
              setStatus("idle");
              currentTextRef.current = null;
            },
            onError: () => {
              setStatus("idle");
              currentTextRef.current = null;
            },
          });
        }, 50);
      }
    },
    [status]
  );

  return { status, rate, speak, pause, resume, stop, toggle, cycleRate };
}
