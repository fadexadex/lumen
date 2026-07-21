import { useState } from "react";
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

type Step =
  | { key: "name"; kind: "text"; prompt: string; placeholder: string }
  | { key: "grade"; kind: "chips-number"; prompt: string }
  | { key: "subject"; kind: "text"; prompt: string; placeholder: string }
  | { key: "topic"; kind: "text"; prompt: string; placeholder: string }
  | { key: "style"; kind: "chips-style"; prompt: string }
  | { key: "audio"; kind: "chips-audio"; prompt: string };

export function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useTutorStore((s) => s.setProfile);
  const setRoadmap = useTutorStore((s) => s.setRoadmap);

  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<LearningStyle | null>(null);
  const [audio, setAudio] = useState<AudioPref | null>(null);
  const [finishing, setFinishing] = useState(false);

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

  const advance = () => {
    if (!canAdvance()) return;
    if (i < total - 1) {
      setI(i + 1);
      return;
    }
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

  if (finishing) {
    return (
      <div className="tutor-app min-h-screen flex flex-col items-center justify-center px-6">
        <div className="tutor-fade-in text-center max-w-xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="live-dot" />
            <span className="text-sm" style={{ color: "var(--tutor-muted)" }}>
              building your path
            </span>
          </div>
          <h1 className="tutor-serif text-4xl md:text-5xl">
            Getting things ready for you, {name}…
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="tutor-app min-h-screen flex flex-col">
      <div className="tutor-progress">
        <div style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <main className="flex-1 flex items-center justify-center px-6">
        <div key={step.key} className="tutor-fade-in w-full max-w-2xl">
          <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--tutor-muted)" }}>
            {i + 1} of {total}
          </p>
          <h1 className="tutor-serif text-3xl md:text-5xl leading-tight mb-10">
            {step.prompt}
          </h1>

          {step.kind === "text" && (
            <input
              autoFocus
              className="tutor-input"
              placeholder={step.placeholder}
              value={step.key === "name" ? name : step.key === "subject" ? subject : topic}
              onChange={(e) => {
                const v = e.target.value;
                if (step.key === "name") setName(v);
                else if (step.key === "subject") setSubject(v);
                else setTopic(v);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") advance(); }}
            />
          )}

          {step.kind === "chips-number" && (
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button key={g} className="tutor-chip" data-selected={grade === g} onClick={() => setGrade(g)}>
                  Grade {g}
                </button>
              ))}
            </div>
          )}

          {step.kind === "chips-style" && (
            <div className="flex flex-wrap gap-2">
              {styles.map((s) => (
                <button key={s.value} className="tutor-chip" data-selected={style === s.value} onClick={() => setStyle(s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {step.kind === "chips-audio" && (
            <div className="flex flex-wrap gap-2">
              {audios.map((a) => (
                <button key={a.value} className="tutor-chip" data-selected={audio === a.value} onClick={() => setAudio(a.value)}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-12 flex items-center justify-between">
            <button
              className="text-sm"
              style={{ color: "var(--tutor-muted)", visibility: i === 0 ? "hidden" : "visible" }}
              onClick={() => setI(Math.max(0, i - 1))}
            >
              ← back
            </button>
            <button className="tutor-primary-btn" disabled={!canAdvance()} onClick={advance}>
              {i === total - 1 ? "Let's begin" : "Continue"} →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}