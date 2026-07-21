import { createFileRoute, Link } from "@tanstack/react-router";
import { lessonList } from "@/lessons";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen w-full bg-white">
      <div className="mx-auto max-w-4xl px-8 py-24">
        <h1
          className="text-6xl text-neutral-900"
          style={{ fontFamily: "var(--font-hand)" }}
        >
          Chalkboard
        </h1>
        <p
          className="mt-3 text-2xl text-neutral-600"
          style={{ fontFamily: "var(--font-hand)" }}
        >
          Pick a topic and watch it get written out on the board.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lessonList.map((l) => (
            <Link
              key={l.slug}
              to="/board/$topic"
              params={{ topic: l.slug }}
              className="group block border border-neutral-300 p-6 transition-colors hover:border-neutral-900"
            >
              <div
                className="text-3xl text-neutral-900"
                style={{ fontFamily: "var(--font-hand)" }}
              >
                {l.title}
              </div>
              <div className="mt-2 text-sm text-neutral-600">{l.blurb}</div>
              <div className="mt-4 text-sm text-neutral-500 transition-colors group-hover:text-neutral-900">
                Open board →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
