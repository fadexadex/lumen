import type { LearnerProfile } from "@/lib/types";
import { useTutorStore } from "@/lib/tutor-store";
import { startCourseStream } from "./client";

/**
 * Owns the active course-generation stream *outside* React, so it keeps running
 * when the learner navigates onboarding → roadmap → lesson. Every SSE event is
 * reduced into the tutor store; components just read the store.
 */
let abort: (() => void) | null = null;
let activeTopic: string | null = null;

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

export function stopCourseGeneration() {
  abort?.();
  abort = null;
  activeTopic = null;
}
