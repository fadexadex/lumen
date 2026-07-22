import type { LearnerProfile } from "@/lib/types";
import type { CourseStreamEvent } from "./types";

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

        // SSE frames are separated by a blank line.
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            onEvent(JSON.parse(dataLine.slice(6)) as CourseStreamEvent);
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) onError?.(err);
    }
  })();

  return () => controller.abort();
}

/** Fallback / reconnect: fetch the current course snapshot. */
export async function fetchCourse(id: string) {
  const res = await fetch(`/api/course/${id}`);
  if (!res.ok) throw new Error(`course fetch failed: ${res.status}`);
  return res.json();
}
