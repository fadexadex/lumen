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
  /** Earlier generated paths remain available when a learner starts a new topic. */
  courseHistory: Course[];
  /** New-topic onboarding skips identity and preference questions. */
  startingNewTopic: boolean;
  /** One-time, non-blocking orientation shown beside the Live tutor. */
  hasSeenLessonGuide: boolean;
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
  beginNewTopic: () => void;
  finishNewTopic: () => void;
  restoreCourse: (courseId: string) => void;
  dismissLessonGuide: () => void;
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
function reduceCourseEvent(s: TutorState, event: CourseStreamEvent): Partial<TutorState> | null {
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
      if (!s.course) return null;
      const modules = s.course.modules.map((m) =>
        m.id === event.id ? { ...m, status: event.status, error: event.error } : m,
      );
      const course = { ...s.course, modules, updatedAt: Date.now() };
      return { course, roadmap: deriveRoadmap(course) };
    }

    case "module_ready": {
      if (!s.course) return null;
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
      if (!s.course) return null;
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

    // module_partial is streamed for skeleton UX we don't use in the store.
    // Returning null skips set() entirely — critical: otherwise the persist
    // middleware would serialize the whole course to localStorage on every one
    // of the hundreds of partials per module, freezing the main thread.
    case "module_partial":
    default:
      return null;
  }
}

export const useTutorStore = create<TutorState>()(
  persist(
    (set, get) => ({
      profile: null,
      roadmap: null,
      course: null,
      courseHistory: [],
      startingNewTopic: false,
      hasSeenLessonGuide: false,
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
      beginNewTopic: () =>
        set((s) => ({
          courseHistory: s.course
            ? [s.course, ...s.courseHistory.filter((course) => course.id !== s.course?.id)]
            : s.courseHistory,
          course: null,
          roadmap: null,
          planningModules: [],
          genPhase: "idle",
          genLog: [],
          lastModuleId: null,
          startingNewTopic: true,
        })),
      finishNewTopic: () => set({ startingNewTopic: false }),
      restoreCourse: (courseId) =>
        set((s) => {
          const selected = s.courseHistory.find((course) => course.id === courseId);
          if (!selected) return s;
          const archived = s.course
            ? [s.course, ...s.courseHistory.filter((course) => course.id !== s.course?.id)]
            : s.courseHistory;
          return {
            profile: selected.profile,
            course: selected,
            courseHistory: archived.filter((course) => course.id !== selected.id),
            roadmap: deriveRoadmap(selected),
            startingNewTopic: false,
            lastModuleId: null,
            planningModules: [],
            genPhase: "done",
            genLog: [],
          };
        }),
      dismissLessonGuide: () => set({ hasSeenLessonGuide: true }),
      patchModule: (id, patch) =>
        set((s) => {
          if (!s.course) return s;
          const modules = s.course.modules.map((m) => (m.id === id ? { ...m, ...patch } : m));
          const course = { ...s.course, modules, updatedAt: Date.now() };
          return { course, roadmap: deriveRoadmap(course) };
        }),
      applyCourseEvent: (event) => {
        const patch = reduceCourseEvent(get(), event);
        if (patch) set(patch);
      },
      resetCourseGen: () =>
        set({ course: null, roadmap: null, planningModules: [], genPhase: "idle", genLog: [] }),
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
        if (course?.modules.length) {
          set({ roadmap: deriveRoadmap(course) });
          return;
        }
        if (profile && !course) set({ roadmap: buildRoadmap(profile.topic, profile.grade) });
      },
      reset: () =>
        set({
          profile: null,
          roadmap: null,
          course: null,
          courseHistory: [],
          startingNewTopic: false,
          hasSeenLessonGuide: false,
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
      // v4 keeps previous courses and returning-learner UI preferences.
      version: 4,
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
        if (fromVersion < 4) {
          if (p.courseHistory === undefined) p.courseHistory = [];
          if (p.startingNewTopic === undefined) p.startingNewTopic = false;
          if (p.hasSeenLessonGuide === undefined) p.hasSeenLessonGuide = false;
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
        courseHistory: s.courseHistory,
        startingNewTopic: s.startingNewTopic,
        hasSeenLessonGuide: s.hasSeenLessonGuide,
        subscription: s.subscription,
        stepByModule: s.stepByModule,
        completed: s.completed,
        lastModuleId: s.lastModuleId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Prefer a persisted generated course; fall back to the legacy mock roadmap.
        if (!state.roadmap && state.course?.modules.length) {
          state.roadmap = deriveRoadmap(state.course);
        } else if (!state.roadmap && state.profile && !state.course) {
          state.roadmap = buildRoadmap(state.profile.topic, state.profile.grade);
        }
      },
    },
  ),
);
