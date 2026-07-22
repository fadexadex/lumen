import type { LessonScript, RoadmapModule, LearnerProfile } from "@/lib/types";

/**
 * Per-module generation lifecycle. Drives roadmap card UI and the lesson-route guard.
 *
 *  pending ──start──► generating ──validate ok──► ready
 *                        │
 *                        └──validate fail ×2──► failed ──retry──► generating
 */
export type ModuleGenStatus = "pending" | "generating" | "ready" | "failed";

/**
 * Wave B enrichment: web-researched material attached to a module *after* its
 * lesson content is already `ready`. Never blocks reading — see the two-wave
 * model in docs/plan-generative-courses-build.html.
 */
export interface ModuleResources {
  /** Sources the curator surfaced from the web (Tavily). Shown as a small chip. */
  citations?: { title: string; url: string }[];
  /** One extra practice question authored from the researched material. */
  extraPractice?: {
    prompt: string;
    options?: string[];
    answer: string;
    hint?: string;
  };
  /** Whether a concept animation was authored for this module (payload lives on the script). */
  hasConceptAnimation?: boolean;
  /** When Wave B finished for this module. */
  enrichedAt?: number;
}

/** A roadmap module plus its generation state and (when ready) its rendered script. */
export interface CourseModule extends RoadmapModule {
  status: ModuleGenStatus;
  /** Present once `status === "ready"`. The board-ready contract. */
  script?: LessonScript;
  /** Wave B output; arrives independently of `script`. */
  resources?: ModuleResources;
  /** Human-readable reason when `status === "failed"`. */
  error?: string;
}

/** The full generated course held in the store and the server-side course map. */
export interface Course {
  id: string;
  profile: LearnerProfile;
  topic: string;
  modules: CourseModule[];
  createdAt: number;
  updatedAt: number;
}

/**
 * SSE event names streamed by POST /api/course/start. Both the onboarding
 * action feed and the roadmap subscribe to the same stream.
 */
export type CourseStreamEvent =
  | { type: "course"; id: string; topic: string }
  | { type: "roadmap_partial"; modules: Partial<RoadmapModule>[] }
  | { type: "roadmap"; modules: CourseModule[] }
  | { type: "module_status"; id: string; status: ModuleGenStatus; error?: string }
  | { type: "module_partial"; id: string; partial: Partial<LessonScript> }
  | { type: "module_ready"; id: string; script: LessonScript }
  | { type: "module_enriched"; id: string; resources: ModuleResources }
  | { type: "done" };
