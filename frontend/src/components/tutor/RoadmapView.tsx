import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";
import { retryCourseModule } from "@/lib/course-gen/client";
import {
  courseIsSettled,
  resumeCourseGeneration,
  startCourseGeneration,
  stopCourseGeneration,
} from "@/lib/course-gen/session";
import type { ModuleGenStatus } from "@/lib/course-gen/types";

export function RoadmapView() {
  const navigate = useNavigate();
  const profile = useTutorStore((s) => s.profile);
  const roadmap = useTutorStore((s) => s.roadmap);
  const course = useTutorStore((s) => s.course);
  const genPhase = useTutorStore((s) => s.genPhase);
  const subscription = useTutorStore((s) => s.subscription);
  const startingNewTopic = useTutorStore((s) => s.startingNewTopic);
  const completed = useTutorStore((s) => s.completed);
  const lastModuleId = useTutorStore((s) => s.lastModuleId);
  const courseHistory = useTutorStore((s) => s.courseHistory);
  const ensureRoadmap = useTutorStore((s) => s.ensureRoadmap);
  const beginNewTopic = useTutorStore((s) => s.beginNewTopic);
  const restoreCourse = useTutorStore((s) => s.restoreCourse);
  const patchModule = useTutorStore((s) => s.patchModule);

  useEffect(() => {
    // A returning learner may have a profile but no rebuilt roadmap yet.
    if (profile && !roadmap) ensureRoadmap();
  }, [profile, roadmap, ensureRoadmap]);

  useEffect(() => {
    // Safety net: a paid learner with no generated course (e.g. generation never
    // ran, or errored) should have it start here rather than see a dead path.
    if (
      profile &&
      subscription?.status === "active" &&
      !course &&
      genPhase === "idle" &&
      !startingNewTopic
    ) {
      startCourseGeneration(profile);
    }
  }, [profile, subscription, course, genPhase, startingNewTopic]);

  useEffect(() => {
    if (course && !courseIsSettled(course)) resumeCourseGeneration(course);
  }, [course]);

  useEffect(() => {
    if (!profile) {
      navigate({ to: "/" });
      return;
    }
    if (subscription?.status !== "active") {
      navigate({ to: "/subscribe" });
    }
  }, [profile, subscription, navigate]);

  if (!profile || subscription?.status !== "active") return null;

  if (!roadmap) {
    return (
      <div className="tutor-app onboard-shell min-h-screen flex flex-col items-center justify-center px-6">
        <div className="onboard-finish" aria-live="polite">
          <div className="onboard-finish-status">
            <span className="live-dot" />
            <span className="text-sm" style={{ color: "var(--tutor-muted)" }}>
              outlining your path
            </span>
          </div>
          <h1 className="tutor-serif text-3xl md:text-4xl">Lumen is planning your course…</h1>
          <div className="onboard-finish-bar" aria-hidden>
            <span />
          </div>
        </div>
      </div>
    );
  }

  const modules = roadmap.modules;
  // Per-module generation status (falls back to "ready" for legacy/mock roadmaps).
  const statusOf = (id: string): ModuleGenStatus =>
    course?.modules.find((m) => m.id === id)?.status ?? "ready";
  const resourcesOf = (id: string) => course?.modules.find((m) => m.id === id)?.resources;
  const readyCount = modules.filter((m) => statusOf(m.id) === "ready").length;
  const generating = genPhase === "planning" || genPhase === "writing";
  const doneCount = modules.filter((m) => completed[m.id]).length;
  const allDone = doneCount === modules.length;
  // Where to resume: last opened module, else the first unfinished one.
  const resumeId =
    (lastModuleId && modules.some((m) => m.id === lastModuleId) && lastModuleId) ||
    modules.find((m) => !completed[m.id])?.id ||
    modules[0]?.id;
  const resumeMod = modules.find((m) => m.id === resumeId);
  const startOver = () => {
    stopCourseGeneration();
    beginNewTopic();
    navigate({ to: "/" });
  };
  const open = (id: string) => navigate({ to: "/lesson/$moduleId", params: { moduleId: id } });
  const retry = async (id: string) => {
    if (!course) return;
    patchModule(id, { status: "generating", error: undefined });
    try {
      const module = await retryCourseModule(course.id, id);
      patchModule(id, module);
    } catch (error) {
      patchModule(id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const ROW = 220;
  const AMP = 90; // sideways swing of the spine
  const CX = 50; // percent, spine centered
  const height = modules.length * ROW;

  // Build one continuous serpentine path through every module row.
  // Between row i and row i+1, swing toward the side of module i's card
  // then back — so the whole line reads as a single flowing ribbon.
  const pathD = modules
    .map((_, i) => {
      const y = i * ROW + ROW / 2;
      if (i === 0) return `M ${CX} ${y}`;
      const prevY = (i - 1) * ROW + ROW / 2;
      const midY = (prevY + y) / 2;
      const dir = i % 2 === 0 ? -1 : 1; // matches card side of row i-1
      const c1x = CX + dir * AMP;
      const c2x = CX - dir * AMP;
      return `C ${c1x} ${midY}, ${c2x} ${midY}, ${CX} ${y}`;
    })
    .join(" ");

  return (
    <div className="tutor-app min-h-screen">
      <header className="roadmap-header">
        <div className="roadmap-path-actions">
          <button
            type="button"
            className="text-sm roadmap-startover"
            style={{ color: "var(--tutor-muted)" }}
            onClick={startOver}
          >
            + new topic
          </button>
          {courseHistory.length > 0 && (
            <details className="roadmap-history">
              <summary>Previous paths</summary>
              <div className="roadmap-history-menu">
                {courseHistory.map((previous) => (
                  <button
                    key={previous.id}
                    type="button"
                    onClick={() => restoreCourse(previous.id)}
                  >
                    <strong>{previous.topic}</strong>
                    <span>{previous.modules.length} modules</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--tutor-muted)" }}
          >
            Grade {profile.grade} · {profile.subject}
          </span>
          {subscription?.credits != null && (
            <span className="paywall-credits-chip" title="Display only — not spent in lessons yet">
              {subscription.credits} credits
            </span>
          )}
        </div>
      </header>

      <section className="roadmap-hero">
        <p className="text-sm mb-3" style={{ color: "var(--tutor-muted)" }}>
          {profile.name}'s path to
        </p>
        <h1 className="tutor-serif roadmap-hero-title">{roadmap.topic}</h1>
        <p className="roadmap-hero-sub">
          {modules.length} short modules woven together. Begin with the first, or wander.
        </p>
        {course && readyCount < modules.length && (
          <p className="roadmap-gen-status" aria-live="polite">
            <span className="live-dot" />
            {readyCount} of {modules.length} lessons ready
            {generating ? " · still writing the rest…" : " · finishing in the background"}
          </p>
        )}

        {resumeMod && (
          <div className="roadmap-resume">
            <button
              type="button"
              className="tutor-primary-btn"
              disabled={statusOf(resumeMod.id) !== "ready"}
              onClick={() => statusOf(resumeMod.id) === "ready" && open(resumeMod.id)}
            >
              {allDone
                ? "Revisit your path"
                : doneCount > 0
                  ? `Continue · ${resumeMod.title}`
                  : statusOf(resumeMod.id) === "ready"
                    ? `Start · ${resumeMod.title}`
                    : `Writing · ${resumeMod.title}`}
              <span aria-hidden> →</span>
            </button>
            <div className="roadmap-resume-track" aria-hidden>
              <span style={{ width: `${(doneCount / modules.length) * 100}%` }} />
            </div>
            <p className="roadmap-resume-meta">
              {doneCount} of {modules.length} modules complete
            </p>
          </div>
        )}
      </section>

      <div className="roadmap-flow" style={{ height }}>
        <svg
          className="roadmap-spine"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d={pathD}
            fill="none"
            stroke="var(--tutor-line)"
            strokeWidth="0.35"
            strokeLinecap="round"
            strokeDasharray="0.6 1.4"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 1.4 }}
          />
        </svg>

        {modules.map((m, idx) => {
          const side = idx % 2 === 0 ? "right" : "left";
          const top = idx * ROW;
          const done = !!completed[m.id];
          const status = statusOf(m.id);
          const actionable = status === "ready" || status === "failed";
          const current = m.id === resumeId && !allDone && status === "ready";
          const resources = resourcesOf(m.id);
          const eyebrow = done
            ? "Complete"
            : status === "generating"
              ? "Writing lesson…"
              : status === "pending"
                ? "Waiting…"
                : status === "failed"
                  ? "Couldn't generate"
                  : current
                    ? doneCount > 0
                      ? "Continue here"
                      : "Start here"
                    : `Module ${idx + 1}`;
          return (
            <div
              key={m.id}
              className={`roadmap-row roadmap-row--${side} tutor-fade-in`}
              style={{ top, animationDelay: `${idx * 70}ms` }}
            >
              <span className="roadmap-dot" data-active={current} data-done={done || undefined}>
                {done ? "✓" : idx + 1}
              </span>
              <button
                type="button"
                className="roadmap-card"
                data-current={current || undefined}
                data-done={done || undefined}
                data-status={status}
                disabled={!actionable}
                aria-disabled={!actionable}
                onClick={() => {
                  if (status === "failed") void retry(m.id);
                  else if (status === "ready") open(m.id);
                }}
              >
                <p className="roadmap-card-eyebrow">{eyebrow}</p>
                <h3 className="tutor-serif roadmap-card-title">{m.title}</h3>
                <p className="roadmap-card-blurb">{m.blurb}</p>
                {resources?.citations?.length ? (
                  <span className="roadmap-card-sources">
                    {resources.citations.length} source
                    {resources.citations.length > 1 ? "s" : ""} added
                  </span>
                ) : null}
                <span className="roadmap-card-cta">
                  {status === "generating"
                    ? "Writing…"
                    : status === "pending"
                      ? "Queued"
                      : status === "failed"
                        ? "Retry lesson"
                        : done
                          ? "Revisit →"
                          : "Open on the whiteboard →"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
