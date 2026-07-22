import type { LearnerProfile } from "@/lib/types";
import { useTutorStore } from "@/lib/tutor-store";
import type { Course } from "./types";
import { fetchCourse, startCourseStream } from "./client";

/**
 * Owns the active course-generation stream *outside* React, so it keeps running
 * when the learner navigates onboarding → roadmap → lesson. Every SSE event is
 * reduced into the tutor store; components just read the store.
 */
let abort: (() => void) | null = null;
let activeTopic: string | null = null;
let pollingCourseId: string | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export function courseIsSettled(course: Course): boolean {
  return (
    course.modules.length > 0 &&
    course.modules.every((module) => module.status === "ready" || module.status === "failed")
  );
}

export function startCourseGeneration(profile: LearnerProfile) {
  // Don't restart an in-flight run for the same topic.
  if (abort && activeTopic === profile.topic) return;
  stopCourseGeneration();

  activeTopic = profile.topic;
  useTutorStore.getState().resetCourseGen();

  abort = startCourseStream(
    profile,
    (event) => useTutorStore.getState().applyCourseEvent(event),
    (err) => {
      console.error("course generation stream error", err);
      activeTopic = null;
    },
  );
}

/** Resume a generation stream after reload by polling the server snapshot. */
export function resumeCourseGeneration(course: Course) {
  if (courseIsSettled(course) || pollingCourseId === course.id) return;
  stopCoursePolling();
  pollingCourseId = course.id;

  const poll = async () => {
    if (pollingCourseId !== course.id) return;
    try {
      const snapshot = await fetchCourse(course.id);
      useTutorStore.getState().setCourse(snapshot);
      if (courseIsSettled(snapshot)) {
        stopCoursePolling();
        return;
      }
    } catch (error) {
      stopCoursePolling();
      // The in-memory server store was probably restarted. Preserve completed
      // work when possible; otherwise start a fresh run so the UI cannot stick.
      const current = useTutorStore.getState().course;
      if (current && !courseIsSettled(current)) startCourseGeneration(current.profile);
      console.warn("course reconnect failed; restarted generation", error);
      return;
    }
    pollTimer = setTimeout(poll, 1500);
  };
  void poll();
}

function stopCoursePolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollingCourseId = null;
}

export function stopCourseGeneration() {
  abort?.();
  abort = null;
  activeTopic = null;
  stopCoursePolling();
}
