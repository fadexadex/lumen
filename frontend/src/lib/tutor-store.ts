import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LearnerProfile, Roadmap, Subscription } from "./types";
import type { Course, CourseModule, CourseStreamEvent } from "./course-gen/types";
import { buildRoadmap } from "./mock-roadmaps";

/** Roadmap projection of a generated course (back-compat for existing screens). */
function deriveRoadmap(course: Course | null): Roadmap | null {
  if (!course) return null;
  return {
    topic: course.topic,
    modules: course.modules.map((m) => ({ id: m.id, title: m.title, blurb: m.blurb })),
  };
}

/** Phase of the onboarding "actions" animation. */
export type GenPhase = "idle" | "planning" | "writing" | "ready" | "done";
export interface GenAction {
  key: string;
  label: string;
}

/** Append an action line to the feed, de-duplicated by key. */
function pushAction(log: GenAction[], key: string, label: string): GenAction[] {
  if (log.some((a) => a.key === key)) return log;
  return [...log, { key, label }];
}

interface TutorState {
  profile: LearnerProfile | null;
  roadmap: Roadmap | null;
  /** Generated course (schema content + per-module status). Source of truth. */
  course: Course | null;
  /** Transient: modules streaming in during the roadmap "planning" moment. */
  planningModules: { id?: string; title?: string; blurb?: string }[];
  /** Transient: the action feed shown while generating (not persisted). */
  genPhase: GenPhase;
  genLog: GenAction[];
  /** Set after a verified Monnify payment. Display-only for now (no credit spend). */
  subscription: Subscription | null;
  stepByModule: Record<string, number>;
  /** Modules the learner has reached the end of. */
  completed: Record<string, boolean>;
  /** Last module opened — powers "continue where you left off". */
  lastModuleId: string | null;
  setProfile: (p: LearnerProfile) => void;
  setRoadmap: (r: Roadmap) => void;
  setCourse: (c: Course) => void;
  patchModule: (id: string, patch: Partial<CourseModule>) => void;
  /** Reduce one SSE course event into the store (drives feed + roadmap live). */
  applyCourseEvent: (event: CourseStreamEvent) => void;
  /** Clear generation state before starting a fresh course. */
  resetCourseGen: () => void;
  setSubscription: (s: Subscription) => void;
  setStep: (moduleId: string, step: number) => void;
  markComplete: (moduleId: string) => void;
  setLastModule: (moduleId: string) => void;
  /** Rebuild the roadmap from the saved profile (used after rehydrate). */
  ensureRoadmap: () => void;
  reset: () => void;
}

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Reduce one SSE course event into a store patch. Keeps the course + derived
 * roadmap in sync and maintains the onboarding action feed (genLog / genPhase).
 */
function reduceCourseEvent(s: TutorState, event: CourseStreamEvent): Partial<TutorState> {
  switch (event.type) {
    case "course":
      return {
        course: {
          id: event.id,
          topic: event.topic,
          profile: s.profile as LearnerProfile,
          modules: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        planningModules: [],
        genPhase: "planning",
        genLog: pushAction(s.genLog, "plan", "Outlining your path"),
      };

    case "roadmap_partial":
      return { planningModules: event.modules };

    case "roadmap": {
      const course = s.course
        ? { ...s.course, modules: event.modules, updatedAt: Date.now() }
        : null;
      return {
        course,
        roadmap: deriveRoadmap(course),
        planningModules: event.modules,
        genPhase: "writing",
        genLog: pushAction(s.genLog, "write", "Writing your first lesson"),
      };
    }

    case "module_status": {
      if (!s.course) return {};
      const modules = s.course.modules.map((m) =>
        m.id === event.id ? { ...m, status: event.status, error: event.error } : m,
      );
      const course = { ...s.course, modules, updatedAt: Date.now() };
      return { course, roadmap: deriveRoadmap(course) };
    }

    case "module_ready": {
      if (!s.course) return {};
      const isFirst = s.course.modules[0]?.id === event.id;
      const modules = s.course.modules.map((m) =>
        m.id === event.id
          ? { ...m, status: "ready" as const, script: event.script, error: undefined }
          : m,
      );
      const course = { ...s.course, modules, updatedAt: Date.now() };
      return {
        course,
        roadmap: deriveRoadmap(course),
        ...(isFirst
          ? {
              genPhase: "ready" as GenPhase,
              genLog: pushAction(s.genLog, "ready", "Your first lesson is ready"),
            }
          : {}),
      };
    }

    case "module_enriched": {
      if (!s.course) return {};
      const modules = s.course.modules.map((m) =>
        m.id === event.id ? { ...m, resources: event.resources } : m,
      );
      const course = { ...s.course, modules, updatedAt: Date.now() };
      return {
        course,
        genLog: pushAction(s.genLog, "resources", "Gathering resources from the web"),
      };
    }

    case "done":
      return { genPhase: "done" };

    default:
      return {};
  }
}

export const useTutorStore = create<TutorState>()(
  persist(
    (set, get) => ({
      profile: null,
      roadmap: null,
      course: null,
      planningModules: [],
      genPhase: "idle",
      genLog: [],
      subscription: null,
      stepByModule: {},
      completed: {},
      lastModuleId: null,
      setProfile: (profile) => set({ profile }),
      setRoadmap: (roadmap) => set({ roadmap }),
      setCourse: (course) => set({ course, roadmap: deriveRoadmap(course) }),
      patchModule: (id, patch) =>
        set((s) => {
          if (!s.course) return s;
          const modules = s.course.modules.map((m) => (m.id === id ? { ...m, ...patch } : m));
          const course = { ...s.course, modules, updatedAt: Date.now() };
          return { course, roadmap: deriveRoadmap(course) };
        }),
      applyCourseEvent: (event) => set((s) => reduceCourseEvent(s, event)),
      resetCourseGen: () =>
        set({ course: null, planningModules: [], genPhase: "idle", genLog: [] }),
      setSubscription: (subscription) => set({ subscription }),
      setStep: (moduleId, step) =>
        set((s) => ({ stepByModule: { ...s.stepByModule, [moduleId]: step } })),
      markComplete: (moduleId) =>
        set((s) =>
          s.completed[moduleId] ? s : { completed: { ...s.completed, [moduleId]: true } },
        ),
      setLastModule: (moduleId) =>
        set((s) => (s.lastModuleId === moduleId ? s : { lastModuleId: moduleId })),
      ensureRoadmap: () => {
        const { profile, roadmap, course } = get();
        if (roadmap) return;
        if (course) {
          set({ roadmap: deriveRoadmap(course) });
          return;
        }
        if (profile) set({ roadmap: buildRoadmap(profile.topic, profile.grade) });
      },
      reset: () =>
        set({
          profile: null,
          roadmap: null,
          course: null,
          planningModules: [],
          genPhase: "idle",
          genLog: [],
          subscription: null,
          stepByModule: {},
          completed: {},
          lastModuleId: null,
        }),
    }),
    {
      name: "tutor:state",
      // Bump when the persisted shape changes (v3 adds the generated course).
      version: 3,
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        // v1 → v2: add subscription field (null until paid).
        if (fromVersion < 2 && p.subscription === undefined) {
          p.subscription = null;
        }
        // v2 → v3: add generated course field (null until generated).
        if (fromVersion < 3 && p.course === undefined) {
          p.course = null;
        }
        return p as typeof p & { subscription?: unknown; course?: unknown };
      },
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (memoryStorage as unknown as Storage),
      ),
      partialize: (s) => ({
        profile: s.profile,
        // Persist the generated course so a returning learner keeps their path
        // (server course map is in-memory and won't survive a restart).
        course: s.course,
        subscription: s.subscription,
        stepByModule: s.stepByModule,
        completed: s.completed,
        lastModuleId: s.lastModuleId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Prefer a persisted generated course; fall back to the legacy mock roadmap.
        if (!state.roadmap && state.course) {
          state.roadmap = deriveRoadmap(state.course);
        } else if (!state.roadmap && state.profile) {
          state.roadmap = buildRoadmap(state.profile.topic, state.profile.grade);
        }
      },
    },
  ),
);
