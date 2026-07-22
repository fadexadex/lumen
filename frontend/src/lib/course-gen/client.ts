import type { LearnerProfile } from "@/lib/types";
import type { Course, CourseModule, CourseStreamEvent } from "./types";

export function consumeSseBuffer(
  buffer: string,
  onEvent: (event: CourseStreamEvent) => void,
): string {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";

  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      onEvent(JSON.parse(data) as CourseStreamEvent);
    } catch {
      // Ignore malformed frames; a later complete snapshot can recover state.
    }
  }
  return remainder;
}

/**
 * POST the profile and read the SSE course stream, invoking `onEvent` for each
 * typed event. Uses fetch + ReadableStream (not EventSource) because start is a
 * POST. Returns an abort function.
 */
export function startCourseStream(
  profile: LearnerProfile,
  onEvent: (event: CourseStreamEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/course/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`course start failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        buffer = consumeSseBuffer(buffer, onEvent);
      }
    } catch (err) {
      if (!controller.signal.aborted) onError?.(err);
    }
  })();

  return () => controller.abort();
}

/** Fallback / reconnect: fetch the current course snapshot. */
export async function fetchCourse(id: string): Promise<Course> {
  const res = await fetch(`/api/course/${id}`);
  if (!res.ok) throw new Error(`course fetch failed: ${res.status}`);
  return (await res.json()) as Course;
}

export async function retryCourseModule(courseId: string, moduleId: string): Promise<CourseModule> {
  const res = await fetch(`/api/course/${courseId}/modules/${moduleId}/retry`, { method: "POST" });
  const body = (await res.json()) as CourseModule | { error?: string };
  if (!res.ok) {
    const message = "error" in body && body.error ? body.error : `retry failed: ${res.status}`;
    throw new Error(message);
  }
  return body as CourseModule;
}
