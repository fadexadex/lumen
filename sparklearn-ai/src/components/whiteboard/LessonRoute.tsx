import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import { getLessonScript } from "@/lib/lesson-scripts";
import { Whiteboard } from "./Whiteboard";
import { MathField, MATH_SHORTCUTS } from "./MathField";
import { BlockMath } from "react-katex";
import { insertMathOnBoard } from "@/lib/whiteboard-bridge";
import { ConceptSwitcher } from "./ConceptSwitcher";
import { getConcept, useDemoPlayer } from "@/lib/lesson-concepts";
import { PathNavigator } from "@/components/tutor/PathNavigator";
import { useLumenSession } from "@/lib/live/use-lumen-session";
import { LumenOverlay } from "@/components/live/LumenOverlay";
import { buildBoardState } from "@/lib/live/board-context";
import { onLiveParabolaChange } from "@/lib/live/board-live";

export function LessonRoute() {
  const { moduleId } = useParams({ from: "/lesson/$moduleId" });
  const navigate = useNavigate();
  const roadmap = useTutorStore((s) => s.roadmap);
  const subscription = useTutorStore((s) => s.subscription);
  const stepByModule = useTutorStore((s) => s.stepByModule);
  const setStep = useTutorStore((s) => s.setStep);
  const completed = useTutorStore((s) => s.completed);
  const markComplete = useTutorStore((s) => s.markComplete);
  const setLastModule = useTutorStore((s) => s.setLastModule);

  const mod = roadmap?.modules.find((m) => m.id === moduleId);

  const [hydrated, setHydrated] = useState(() => useTutorStore.persist.hasHydrated());

  useEffect(() => {
    setHydrated(useTutorStore.persist.hasHydrated());
    return useTutorStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!roadmap) {
      navigate({ to: "/" });
      return;
    }
    if (subscription?.status !== "active") {
      navigate({ to: "/subscribe" });
    }
  }, [hydrated, roadmap, subscription, navigate]);

  // Remember this as the module to resume from.
  useEffect(() => {
    if (roadmap && subscription?.status === "active") setLastModule(moduleId);
  }, [roadmap, subscription, moduleId, setLastModule]);

  const script = useMemo(
    () => getLessonScript(moduleId, mod?.title ?? "Lesson"),
    [moduleId, mod?.title],
  );

  const stepIndex = stepByModule[moduleId] ?? 0;
  const safeIndex = Math.min(stepIndex, script.steps.length - 1);

  // Reaching the last step counts as finishing the module.
  useEffect(() => {
    if (subscription?.status !== "active") return;
    if (safeIndex >= script.steps.length - 1) markComplete(moduleId);
  }, [subscription, safeIndex, script.steps.length, moduleId, markComplete]);

  const lumen = useLumenSession();
  const [showMath, setShowMath] = useState(false);
  const [mathValue, setMathValue] = useState("");
  const [mathToast, setMathToast] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string>(() => {
    if (typeof window === "undefined") return "math-canvas";
    return localStorage.getItem("lumen.concept") ?? "math-canvas";
  });
  const [demoActive, setDemoActive] = useState(false);
  const concept = getConcept(conceptId);

  useEffect(() => {
    try {
      localStorage.setItem("lumen.concept", conceptId);
    } catch {
      /* ignore */
    }
  }, [conceptId]);

  useEffect(() => {
    setDemoActive(false);
  }, [conceptId]);

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
    setStep(nextMod.id, 0);
    navigate({ to: "/lesson/$moduleId", params: { moduleId: nextMod.id } });
  };

  const goToModule = (id: string) => {
    setStep(id, 0);
    navigate({ to: "/lesson/$moduleId", params: { moduleId: id } });
  };

  const demoTick = useDemoPlayer({
    active: demoActive,
    stepIndex: safeIndex,
    total: script.steps.length,
    goto,
    onFinish: () => setDemoActive(false),
  });

  // Ground Lumen whenever the visible step changes, or Live starts.
  useEffect(() => {
    if (lumen.status !== "idle") {
      lumen.sendBoardState(buildBoardState(script, safeIndex, moduleId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, moduleId, script, lumen.status]);

  // Push live parabola slider / set_parabola changes so Lumen knows "this" on screen.
  useEffect(() => {
    return onLiveParabolaChange((p) => {
      if (lumen.status === "idle") return;
      lumen.sendBoardState(buildBoardState(script, safeIndex, moduleId, p));
    });
  }, [lumen, script, safeIndex, moduleId]);

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
          <ConceptSwitcher
            active={concept.id}
            onChange={setConceptId}
            demoActive={demoActive}
            onToggleDemo={() => setDemoActive((v) => !v)}
          />
          <button
            className="live-launch"
            onClick={() => lumen.start(moduleId)}
            aria-label="Talk to Lumen live"
          >
            <span className="live-launch-orb" aria-hidden />
            <span className="live-launch-label">
              <strong>Live</strong>
              <em>Lumen listens</em>
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
          demoTick={demoTick}
          demoActive={demoActive}
          onWriteMath={() => setShowMath(true)}
          onOpenLive={() => lumen.start(moduleId)}
          nextModule={nextMod ? { id: nextMod.id, title: nextMod.title } : null}
          onNextModule={goNextModule}
        />
      </div>

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
