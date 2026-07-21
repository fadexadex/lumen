import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import { buildRoadmap } from "@/lib/mock-roadmaps";
import type { AudioPref, LearnerProfile, LearningStyle } from "@/lib/types";

const grades = Array.from({ length: 12 }, (_, i) => i + 1);
const styles: { value: LearningStyle; label: string }[] = [
  { value: "stories", label: "Stories" },
  { value: "examples", label: "Examples" },
  { value: "step-by-step", label: "Step-by-step" },
  { value: "challenge", label: "Challenge me" },
];
const audios: { value: AudioPref; label: string }[] = [
  { value: "off", label: "Silent" },
  { value: "music", label: "Soft music" },
  { value: "voice", label: "Voice guide" },
];

/** Typeform-like: exit duration before the next question rises in */
const STEP_EXIT_MS = 360;
/** Brief beat after a chip select so the choice registers, then auto-advance */
const CHIP_AUTO_MS = 380;

type Step =
  | { key: "name"; kind: "text"; prompt: string; placeholder: string }
  | { key: "grade"; kind: "chips-number"; prompt: string }
  | { key: "subject"; kind: "text"; prompt: string; placeholder: string }
  | { key: "topic"; kind: "text"; prompt: string; placeholder: string }
  | { key: "style"; kind: "chips-style"; prompt: string }
  | { key: "audio"; kind: "chips-audio"; prompt: string };

type Dir = "forward" | "back";

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useTutorStore((s) => s.setProfile);
  const setRoadmap = useTutorStore((s) => s.setRoadmap);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState<Dir>("forward");
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<LearningStyle | null>(null);
  const [audio, setAudio] = useState<AudioPref | null>(null);
  const [finishing, setFinishing] = useState(false);

  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Keep latest advance callable from timers without stale closures
  const advanceRef = useRef<() => void>(() => {});

  const steps: Step[] = [
    { key: "name", kind: "text", prompt: "Hi! What should I call you?", placeholder: "Your name" },
    { key: "grade", kind: "chips-number", prompt: name ? `Nice to meet you, ${name}. What grade are you in?` : "What grade are you in?" },
    { key: "subject", kind: "text", prompt: "What class or subject is this for?", placeholder: "e.g. Math — Algebra I" },
    { key: "topic", kind: "text", prompt: "What would you like to learn today?", placeholder: "e.g. quadratic equations" },
    { key: "style", kind: "chips-style", prompt: "How do you like to learn?" },
    { key: "audio", kind: "chips-audio", prompt: "Sound while you learn?" },
  ];

  const step = steps[i];
  const total = steps.length;
  const isChipStep = step.kind.startsWith("chips");

  const canAdvance = () => {
    switch (step.key) {
      case "name": return name.trim().length > 0;
      case "grade": return grade !== null;
      case "subject": return subject.trim().length > 0;
      case "topic": return topic.trim().length > 0;
      case "style": return style !== null;
      case "audio": return audio !== null;
    }
  };

  const clearTimers = () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    if (autoTimer.current) clearTimeout(autoTimer.current);
    exitTimer.current = null;
    autoTimer.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  // Focus text input after each question has settled (post-transition)
  useEffect(() => {
    if (leaving || finishing || step.kind !== "text") return;
    const t = setTimeout(() => inputRef.current?.focus(), prefersReducedMotion() ? 0 : 480);
    return () => clearTimeout(t);
  }, [i, leaving, finishing, step.kind]);

  const runStepChange = (nextDir: Dir, after: () => void) => {
    if (leaving) return;
    clearTimers();
    if (prefersReducedMotion()) {
      setDir(nextDir);
      after();
      return;
    }
    setDir(nextDir);
    setLeaving(true);
    exitTimer.current = setTimeout(() => {
      after();
      setLeaving(false);
    }, STEP_EXIT_MS);
  };

  const finish = () => {
    const profile: LearnerProfile = {
      name: name.trim(),
      grade: grade!,
      subject: subject.trim(),
      topic: topic.trim(),
      style: style!,
      audio: audio!,
    };
    setProfile(profile);
    setRoadmap(buildRoadmap(profile.topic, profile.grade));
    setFinishing(true);
    setTimeout(() => navigate({ to: "/roadmap" }), 1600);
  };

  const advance = () => {
    if (!canAdvance() || leaving) return;
    clearTimers();
    if (i < total - 1) {
      runStepChange("forward", () => setI((n) => n + 1));
      return;
    }
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    setDir("forward");
    setLeaving(true);
    exitTimer.current = setTimeout(finish, STEP_EXIT_MS);
  };
  advanceRef.current = advance;

  const goBack = () => {
    if (i === 0 || leaving) return;
    clearTimers();
    runStepChange("back", () => setI((n) => Math.max(0, n - 1)));
  };

  /** Typeform single-choice: show selection, then auto-scroll to next */
  const selectAndAdvance = (apply: () => void) => {
    if (leaving) return;
    apply();
    clearTimers();
    const delay = prefersReducedMotion() ? 0 : CHIP_AUTO_MS;
    autoTimer.current = setTimeout(() => advanceRef.current(), delay);
  };

  if (finishing) {
    return (
      <div className="tutor-app onboard-shell min-h-screen flex flex-col items-center justify-center px-6">
        <div className="onboard-finish">
          <div className="onboard-finish-status">
            <span className="live-dot" />
            <span className="text-sm" style={{ color: "var(--tutor-muted)" }}>
              building your path
            </span>
          </div>
          <h1 className="tutor-serif text-4xl md:text-5xl">
            Getting things ready for you, {name}…
          </h1>
          <div className="onboard-finish-bar" aria-hidden>
            <span />
          </div>
        </div>
      </div>
    );
  }

  const ready = canAdvance();

  return (
    <div className="tutor-app onboard-shell min-h-screen flex flex-col">
      <div className="tutor-progress">
        <div style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <main className="onboard-stage">
        <div
          key={step.key}
          className={`onboard-step${leaving ? " is-leaving" : ""}`}
          data-dir={dir}
        >
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--tutor-muted)" }}>
            {i + 1} of {total}
          </p>
          <h1 className="tutor-serif text-3xl md:text-5xl leading-tight mb-10">
            {step.prompt}
          </h1>

          {step.kind === "text" && (
            <input
              ref={inputRef}
              className="tutor-input"
              placeholder={step.placeholder}
              value={step.key === "name" ? name : step.key === "subject" ? subject : topic}
              onChange={(e) => {
                const v = e.target.value;
                if (step.key === "name") setName(v);
                else if (step.key === "subject") setSubject(v);
                else setTopic(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  advance();
                }
              }}
            />
          )}

          {step.kind === "chips-number" && (
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Grade">
              {grades.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="option"
                  aria-selected={grade === g}
                  className="tutor-chip"
                  data-selected={grade === g}
                  onClick={() => selectAndAdvance(() => setGrade(g))}
                >
                  Grade {g}
                </button>
              ))}
            </div>
          )}

          {step.kind === "chips-style" && (
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Learning style">
              {styles.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="option"
                  aria-selected={style === s.value}
                  className="tutor-chip"
                  data-selected={style === s.value}
                  onClick={() => selectAndAdvance(() => setStyle(s.value))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {step.kind === "chips-audio" && (
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Audio preference">
              {audios.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="option"
                  aria-selected={audio === a.value}
                  className="tutor-chip"
                  data-selected={audio === a.value}
                  onClick={() => selectAndAdvance(() => setAudio(a.value))}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="onboard-actions">
            <button
              type="button"
              className="onboard-back text-sm"
              style={{ color: "var(--tutor-muted)", visibility: i === 0 ? "hidden" : "visible" }}
              onClick={goBack}
            >
              ← back
            </button>

            {/* Text steps: OK + “press Enter” like Typeform. Chip steps auto-advance. */}
            {!isChipStep && (
              <div className="onboard-ok-wrap">
                <button
                  type="button"
                  className="tutor-primary-btn"
                  disabled={!ready || leaving}
                  onClick={advance}
                >
                  {i === total - 1 ? "Let's begin" : "OK"}
                </button>
                <span className="onboard-enter-hint" data-visible={ready && !leaving}>
                  press <kbd>Enter</kbd> ↵
                </span>
              </div>
            )}

            {isChipStep && i === total - 1 && (
              <div className="onboard-ok-wrap">
                <button
                  type="button"
                  className="tutor-primary-btn"
                  disabled={!ready || leaving}
                  onClick={advance}
                >
                  Let's begin
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
