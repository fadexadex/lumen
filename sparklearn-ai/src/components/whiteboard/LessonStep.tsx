import { BlockMath, InlineMath } from "react-katex";
import { useEffect, useState } from "react";
import type { LessonStep } from "@/lib/types";

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) { clearInterval(id); return v; }
        return v + 2;
      });
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return <span className="typewriter">{text.slice(0, n)}</span>;
}

export function LessonStepCard({ step }: { step: LessonStep }) {
  return (
    <div className="lesson-card tutor-fade-in">
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--tutor-muted)" }}>
        {step.kind === "explanation" ? "Concept" : step.kind === "example" ? "Example" : "Try it"}
      </p>
      <h2 className="tutor-serif text-3xl mb-5 leading-tight">{step.title}</h2>

      {step.kind === "explanation" && (
        <>
          <p className="text-base leading-relaxed mb-4">
            <Typewriter text={step.body} />
          </p>
          {step.math && (
            <div className="my-4 text-lg">
              <BlockMath math={step.math} />
            </div>
          )}
        </>
      )}

      {step.kind === "example" && (
        <div className="space-y-3">
          {step.lines.map((l, i) => (
            <div
              key={i}
              className="tutor-fade-in"
              style={{ animationDelay: `${i * 250}ms` }}
            >
              {l.math ? <BlockMath math={l.math} /> : <p className="text-base leading-relaxed">{l.text}</p>}
            </div>
          ))}
        </div>
      )}

      {step.kind === "practice" && (
        <>
          <p className="text-base leading-relaxed mb-3">{step.prompt}</p>
          {step.math && !step.options && (
            <div className="my-3 text-lg"><InlineMath math={step.math} /></div>
          )}
          {step.options && (
            <div className="flex flex-col gap-2 my-4">
              {step.options.map((opt, i) => (
                <button
                  key={i}
                  className="practice-option"
                  type="button"
                >
                  <span className="practice-option-index">{String.fromCharCode(65 + i)}</span>
                  <InlineMath math={opt} />
                </button>
              ))}
            </div>
          )}
          <p className="text-sm mt-4" style={{ color: "var(--tutor-muted)" }}>
            Pick one, or open Live to think it through together.
          </p>
        </>
      )}
    </div>
  );
}