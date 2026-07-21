import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Whiteboard } from "@/components/whiteboard/whiteboard";
import { getLesson } from "@/lessons";

export const Route = createFileRoute("/board/$topic")({
  loader: ({ params }) => {
    const lesson = getLesson(params.topic);
    if (!lesson) throw notFound();
    return { lesson };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.lesson.title} — Chalkboard`
          : "Lesson — Chalkboard",
      },
      {
        name: "description",
        content: loaderData?.lesson.blurb ?? "An animated math whiteboard lesson.",
      },
    ],
  }),
  notFoundComponent: LessonNotFound,
  errorComponent: ({ reset }) => (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <button
        onClick={reset}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </div>
  ),
  component: BoardPage,
});

function BoardPage() {
  const { lesson } = Route.useLoaderData();
  return (
    <div className="relative min-h-screen bg-white">
      <Link
        to="/"
        className="pointer-events-auto fixed left-4 top-4 z-30 flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 shadow-sm hover:bg-neutral-100"
      >
        <ChevronLeft className="h-4 w-4" />
        Topics
      </Link>
      <div
        className="fixed left-1/2 top-4 z-30 -translate-x-1/2 text-sm text-neutral-500"
        style={{ fontFamily: "var(--font-hand)" }}
      >
        {lesson.title}
      </div>
      <Whiteboard lesson={lesson} />
    </div>
  );
}

function LessonNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-3xl text-neutral-900">Lesson not found</h1>
        <Link
          to="/"
          className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Back to topics
        </Link>
      </div>
    </div>
  );
}