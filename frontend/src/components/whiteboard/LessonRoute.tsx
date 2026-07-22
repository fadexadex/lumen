import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import { getLessonScript } from "@/lib/lesson-scripts";
import { Whiteboard } from "./Whiteboard";
import { MathField, MATH_SHORTCUTS } from "./MathField";
import { BlockMath } from "@/lib/katex";
import { insertMathOnBoard } from "@/lib/whiteboard-bridge";
import { getConcept } from "@/lib/lesson-concepts";
import { PathNavigator } from "@/components/tutor/PathNavigator";
import { useLumenSession } from "@/lib/live/use-lumen-session";
import { LumenOverlay } from "@/components/live/LumenOverlay";
import { buildBoardState } from "@/lib/live/board-context";
import { onLiveParabolaChange } from "@/lib/live/board-live";

export function LessonRoute() {
  const { moduleId } = useParams({ from: "/lesson/$moduleId" });
  const navigate = useNavigate();
  const roadmap = useTutorStore((s) => s.roadmap);
  const course = useTutorStore((s) => s.course);
  const profile = useTutorStore((s) => s.profile);
  const subscription = useTutorStore((s) => s.subscription);
  const ensureRoadmap = useTutorStore((s) => s.ensureRoadmap);
  const stepByModule = useTutorStore((s) => s.stepByModule);
  const setStep = useTutorStore((s) => s.setStep);
  const completed = useTutorStore((s) => s.completed);
  const markComplete = useTutorStore((s) => s.markComplete);
  const setLastModule = useTutorStore((s) => s.setLastModule);
  const hasSeenLessonGuide = useTutorStore((s) => s.hasSeenLessonGuide);
  const dismissLessonGuide = useTutorStore((s) => s.dismissLessonGuide);

  const mod = roadmap?.modules.find((m) => m.id === moduleId);
  const courseModule = course?.modules.find((m) => m.id === moduleId);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(useTutorStore.persist.hasHydrated());
    return useTutorStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!roadmap) {
      if (profile || course) {
        ensureRoadmap();
        return;
      }
      // A direct URL can render before Zustand has applied synchronous browser
      // storage. Defer the redirect one task so a saved lesson is not bounced.
      const timer = setTimeout(() => {
        const state = useTutorStore.getState();
        if (state.profile || state.course) state.ensureRoadmap();
        else navigate({ to: "/" });
      }, 0);
      return () => clearTimeout(timer);
    }
    if (subscription?.status !== "active") {
      navigate({ to: "/subscribe" });
    }
  }, [hydrated, roadmap, profile, course, subscription, ensureRoadmap, navigate]);

  // Remember this as the module to resume from.
  useEffect(() => {
    if (roadmap && subscription?.status === "active") setLastModule(moduleId);
  }, [roadmap, subscription, moduleId, setLastModule]);

  const script = useMemo(
    () => courseModule?.script ?? getLessonScript(moduleId, mod?.title ?? "Lesson"),
    [courseModule?.script, moduleId, mod?.title],
  );

  const stepIndex = stepByModule[moduleId] ?? 0;
  const safeIndex = Math.min(stepIndex, script.steps.length - 1);

  // Reaching the last step counts as finishing the module.
  useEffect(() => {
    if (subscription?.status !== "active") return;
    if (safeIndex >= script.steps.length - 1) markComplete(moduleId);
  }, [subscription, safeIndex, script.steps.length, moduleId, markComplete]);

  const lumen = useLumenSession();
  const lumenStartRef = useRef(lumen.start);
  lumenStartRef.current = lumen.start;
  const autoStartedLessonRef = useRef<string | null>(null);
  const [visualSceneIndex, setVisualSceneIndex] = useState(0);
  const [showMath, setShowMath] = useState(false);
  const [mathValue, setMathValue] = useState("");
  const [mathToast, setMathToast] = useState<string | null>(null);
  const conceptId = "math-canvas";
  const concept = getConcept(conceptId);

  useEffect(() => {
    setVisualSceneIndex(0);
  }, [moduleId]);

  // Lumen leads the lesson. A short delay lets the board mount and publish its
  // first context packet before the agent begins teaching.
  useEffect(() => {
    if (!hydrated || subscription?.status !== "active" || lumen.status !== "idle") return;
    if (courseModule && courseModule.status !== "ready" && !courseModule.script) return;
    if (autoStartedLessonRef.current === moduleId) return;
    const timer = setTimeout(() => {
      if (autoStartedLessonRef.current === moduleId) return;
      autoStartedLessonRef.current = moduleId;
      void lumenStartRef.current(moduleId);
    }, 450);
    return () => clearTimeout(timer);
  }, [hydrated, subscription, courseModule, moduleId, lumen.status]);

  const goto = (i: number) => setStep(moduleId, Math.max(0, Math.min(script.steps.length - 1, i)));

  const moduleIndex = roadmap?.modules.findIndex((m) => m.id === moduleId) ?? -1;
  const nextMod =
    roadmap && moduleIndex >= 0 && moduleIndex < roadmap.modules.length - 1
      ? roadmap.modules[moduleIndex + 1]
      : null;

  const goNextModule = () => {
    if (!nextMod) {
      navigate({ to: "/roadmap" });
      return;
    }
    const nextCourseModule = course?.modules.find((module) => module.id === nextMod.id);
    if (nextCourseModule && nextCourseModule.status !== "ready") {
      navigate({ to: "/roadmap" });
      return;
    }
    setStep(nextMod.id, 0);
    navigate({ to: "/lesson/$moduleId", params: { moduleId: nextMod.id } });
  };

  const goToModule = (id: string) => {
    const selected = course?.modules.find((module) => module.id === id);
    if (selected && selected.status !== "ready") {
      navigate({ to: "/roadmap" });
      return;
    }
    setStep(id, 0);
    navigate({ to: "/lesson/$moduleId", params: { moduleId: id } });
  };

  // Ground Lumen whenever the visible step changes, or Live starts.
  useEffect(() => {
    if (lumen.status !== "idle") {
      lumen.sendBoardState(
        buildBoardState(script, safeIndex, moduleId, undefined, visualSceneIndex),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, moduleId, script, visualSceneIndex, lumen.status]);

  // Push live parabola slider / set_parabola changes so Lumen knows "this" on screen.
  useEffect(() => {
    return onLiveParabolaChange((p) => {
      if (lumen.status === "idle") return;
      lumen.sendBoardState(buildBoardState(script, safeIndex, moduleId, p, visualSceneIndex));
    });
  }, [lumen, script, safeIndex, moduleId, visualSceneIndex]);

  const insertShortcut = (latex: string) => setMathValue((v) => v + latex);

  const addMathToBoard = () => {
    const ok = insertMathOnBoard(mathValue);
    if (ok) {
      setMathToast("Added to your whiteboard ✨");
      setMathValue("");
      setTimeout(() => setMathToast(null), 1800);
    } else {
      setMathToast("Type some math first");
      setTimeout(() => setMathToast(null), 1500);
    }
  };

  const ConceptView = concept.Component;
  const boardTone = concept.boardTone;

  if (!roadmap || subscription?.status !== "active") return null;

  // Guard: never mount the board on a generated module that isn't ready yet.
  // (RoadmapView disables such cards, but a direct link could still land here.)
  if (courseModule && courseModule.status !== "ready" && !courseModule.script) {
    return (
      <div className="tutor-app onboard-shell min-h-screen flex flex-col items-center justify-center px-6">
        <div className="onboard-finish">
          <div className="onboard-finish-status">
            <span className="live-dot" />
            <span className="text-sm" style={{ color: "var(--tutor-muted)" }}>
              {courseModule.status === "failed"
                ? "couldn't generate this lesson"
                : "writing this lesson"}
            </span>
          </div>
          <h1 className="tutor-serif text-3xl md:text-4xl">{mod?.title ?? "Your lesson"}</h1>
          {courseModule.status !== "failed" && (
            <div className="onboard-finish-bar" aria-hidden>
              <span />
            </div>
          )}
          <button
            type="button"
            className="tutor-primary-btn"
            style={{ marginTop: "1.5rem" }}
            onClick={() => navigate({ to: "/roadmap" })}
          >
            ← Back to your path
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-shell" data-board-tone={boardTone}>
      {boardTone !== "hidden" && (
        <div className="lesson-canvas" data-tone={boardTone}>
          <Whiteboard persistenceKey={`lumen-${moduleId}`} />
        </div>
      )}

      <header className="lesson-topbar">
        {roadmap ? (
          <PathNavigator
            topic={roadmap.topic}
            modules={roadmap.modules}
            currentId={moduleId}
            completedIds={completed}
            onSelect={goToModule}
          />
        ) : (
          <button type="button" className="lesson-crumb" onClick={() => navigate({ to: "/" })}>
            <span aria-hidden>←</span> path
          </button>
        )}
        <div className="lesson-title-wrap">
          <h1 className="tutor-serif lesson-title">{script.title}</h1>
          <p className="lesson-eyebrow">
            Step {safeIndex + 1} of {script.steps.length} · {concept.name}
          </p>
        </div>
        <div className="lesson-topbar-right">
          <button
            className="live-launch"
            data-live={lumen.status !== "idle" || undefined}
            onClick={() => {
              if (lumen.status === "idle") lumen.start(moduleId);
            }}
            aria-label={lumen.status === "idle" ? "Talk to Lumen live" : "Lumen is live"}
          >
            <span className="live-launch-orb" aria-hidden />
            <span className="live-launch-label">
              <strong>{lumen.status === "idle" ? "Live" : "● Live"}</strong>
              <em>{lumen.status === "idle" ? "Tap to talk" : "Lumen is teaching"}</em>
            </span>
          </button>
        </div>
      </header>

      <div
        className={`concept-stage concept-stage--${concept.id}`}
        key={`${concept.id}:${moduleId}`}
      >
        <ConceptView
          script={script}
          stepIndex={safeIndex}
          goto={goto}
          demoTick={0}
          demoActive={false}
          onWriteMath={() => setShowMath(true)}
          onOpenLive={() => lumen.start(moduleId)}
          onVisualSceneChange={setVisualSceneIndex}
          nextModule={nextMod ? { id: nextMod.id, title: nextMod.title } : null}
          onNextModule={goNextModule}
        />
      </div>

      {!hasSeenLessonGuide && (
        <aside className="lesson-live-guide tutor-fade-in" aria-label="How the live lesson works">
          <p>Live lesson</p>
          <h2>Lumen is joining you here.</h2>
          <ul>
            <li>Listen while Lumen teaches from the board.</li>
            <li>Interrupt naturally whenever something is unclear.</li>
            <li>Switch visual models and ask about the one you see.</li>
          </ul>
          <button type="button" onClick={dismissLessonGuide}>
            Got it
          </button>
        </aside>
      )}

      {/* Math floating panel */}
      {showMath && (
        <div className="math-panel tutor-fade-in">
          <div className="math-panel-head">
            <div>
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: "var(--tutor-muted)", letterSpacing: "0.14em" }}
              >
                Write math
              </p>
              <p className="text-sm" style={{ color: "var(--tutor-muted)", marginTop: 2 }}>
                Tap the buttons or type. Then send it to the whiteboard.
              </p>
            </div>
            <button
              className="math-panel-close"
              onClick={() => setShowMath(false)}
              aria-label="Close math keyboard"
            >
              ✕
            </button>
          </div>
          <div className="math-shortcuts">
            {MATH_SHORTCUTS.map((s) => (
              <button
                key={s.label}
                className="math-shortcut"
                onClick={() => insertShortcut(s.latex)}
                title={`Insert ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <MathField value={mathValue} onChange={setMathValue} placeholder="e.g. x^2 + 3x + 2" />

          <div className="math-preview" aria-live="polite">
            {mathValue.trim() ? (
              <BlockMath math={mathValue} />
            ) : (
              <span className="math-preview-empty">Your equation will preview here.</span>
            )}
          </div>

          <div className="math-panel-actions">
            <button className="tutor-chip" onClick={() => setMathValue("")} disabled={!mathValue}>
              clear
            </button>
            <button
              className="tutor-primary-btn"
              onClick={addMathToBoard}
              disabled={!mathValue.trim()}
            >
              ➜ add to whiteboard
            </button>
          </div>
          {mathToast && <p className="math-toast tutor-fade-in">{mathToast}</p>}
        </div>
      )}

      <LumenOverlay session={lumen} />
    </div>
  );
}
