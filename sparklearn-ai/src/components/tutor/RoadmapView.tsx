import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTutorStore } from "@/lib/tutor-store";

export function RoadmapView() {
  const navigate = useNavigate();
  const profile = useTutorStore((s) => s.profile);
  const roadmap = useTutorStore((s) => s.roadmap);

  useEffect(() => {
    if (!profile || !roadmap) navigate({ to: "/" });
  }, [profile, roadmap, navigate]);

  if (!profile || !roadmap) return null;

  const modules = roadmap.modules;
  const ROW = 220;
  const AMP = 90; // sideways swing of the spine
  const CX = 50;  // percent, spine centered
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
        <Link to="/" className="text-sm" style={{ color: "var(--tutor-muted)" }}>
          ← start over
        </Link>
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
          const first = idx === 0;
          const top = idx * ROW;
          return (
            <div
              key={m.id}
              className={`roadmap-row roadmap-row--${side} tutor-fade-in`}
              style={{ top, animationDelay: `${idx * 70}ms` }}
            >
              <span className="roadmap-dot" data-active={first}>
                {idx + 1}
              </span>
              <button
                type="button"
                className="roadmap-card"
                onClick={() =>
                  navigate({ to: "/lesson/$moduleId", params: { moduleId: m.id } })
                }
              >
                <p className="roadmap-card-eyebrow">
                  {first ? "Start here" : `Module ${idx + 1}`}
                </p>
                <h3 className="tutor-serif roadmap-card-title">{m.title}</h3>
                <p className="roadmap-card-blurb">{m.blurb}</p>
                <span className="roadmap-card-cta">Open on the whiteboard →</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}