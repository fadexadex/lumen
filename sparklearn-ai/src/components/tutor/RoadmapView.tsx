import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";

export function RoadmapView() {
  const navigate = useNavigate();
  const profile = useTutorStore((s) => s.profile);
  const roadmap = useTutorStore((s) => s.roadmap);
  const completed = useTutorStore((s) => s.completed);
  const lastModuleId = useTutorStore((s) => s.lastModuleId);
  const ensureRoadmap = useTutorStore((s) => s.ensureRoadmap);
  const reset = useTutorStore((s) => s.reset);

  useEffect(() => {
    // A returning learner may have a profile but no rebuilt roadmap yet.
    if (profile && !roadmap) ensureRoadmap();
  }, [profile, roadmap, ensureRoadmap]);

  useEffect(() => {
    if (!profile) navigate({ to: "/" });
  }, [profile, navigate]);

  if (!profile || !roadmap) return null;

  const modules = roadmap.modules;
  const doneCount = modules.filter((m) => completed[m.id]).length;
  const allDone = doneCount === modules.length;
  // Where to resume: last opened module, else the first unfinished one.
  const resumeId =
    (lastModuleId && modules.some((m) => m.id === lastModuleId) && lastModuleId) ||
    modules.find((m) => !completed[m.id])?.id ||
    modules[0]?.id;
  const resumeMod = modules.find((m) => m.id === resumeId);
  const startOver = () => {
    reset();
    navigate({ to: "/" });
  };
  const open = (id: string) => navigate({ to: "/lesson/$moduleId", params: { moduleId: id } });
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
        <button
          type="button"
          className="text-sm roadmap-startover"
          style={{ color: "var(--tutor-muted)" }}
          onClick={startOver}
        >
          ← start over
        </button>
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--tutor-muted)" }}>
          Grade {profile.grade} · {profile.subject}
        </span>
      </header>

      <section className="roadmap-hero">
        <p className="text-sm mb-3" style={{ color: "var(--tutor-muted)" }}>
          {profile.name}'s path to
        </p>
        <h1 className="tutor-serif roadmap-hero-title">{roadmap.topic}</h1>
        <p className="roadmap-hero-sub">
          {modules.length} short modules woven together. Begin with the first, or wander.
        </p>

        {resumeMod && (
          <div className="roadmap-resume">
            <button type="button" className="tutor-primary-btn" onClick={() => open(resumeMod.id)}>
              {allDone
                ? "Revisit your path"
                : doneCount > 0
                  ? `Continue · ${resumeMod.title}`
                  : `Start · ${resumeMod.title}`}
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
          const current = m.id === resumeId && !allDone;
          const eyebrow = done
            ? "Complete"
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
                onClick={() => open(m.id)}
              >
                <p className="roadmap-card-eyebrow">{eyebrow}</p>
                <h3 className="tutor-serif roadmap-card-title">{m.title}</h3>
                <p className="roadmap-card-blurb">{m.blurb}</p>
                <span className="roadmap-card-cta">
                  {done ? "Revisit →" : "Open on the whiteboard →"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
