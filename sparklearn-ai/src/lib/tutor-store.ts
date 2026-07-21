import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LearnerProfile, Roadmap, Subscription } from "./types";
import { buildRoadmap } from "./mock-roadmaps";

interface TutorState {
  profile: LearnerProfile | null;
  roadmap: Roadmap | null;
  /** Set after a verified Monnify payment. Display-only for now (no credit spend). */
  subscription: Subscription | null;
  stepByModule: Record<string, number>;
  /** Modules the learner has reached the end of. */
  completed: Record<string, boolean>;
  /** Last module opened — powers "continue where you left off". */
  lastModuleId: string | null;
  setProfile: (p: LearnerProfile) => void;
  setRoadmap: (r: Roadmap) => void;
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

export const useTutorStore = create<TutorState>()(
  persist(
    (set, get) => ({
      profile: null,
      roadmap: null,
      subscription: null,
      stepByModule: {},
      completed: {},
      lastModuleId: null,
      setProfile: (profile) => set({ profile }),
      setRoadmap: (roadmap) => set({ roadmap }),
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
        const { profile, roadmap } = get();
        if (profile && !roadmap) {
          set({ roadmap: buildRoadmap(profile.topic, profile.grade) });
        }
      },
      reset: () =>
        set({
          profile: null,
          roadmap: null,
          subscription: null,
          stepByModule: {},
          completed: {},
          lastModuleId: null,
        }),
    }),
    {
      name: "tutor:state",
      // Bump when persisted shape gains subscription entitlement.
      version: 2,
      migrate: (persisted, fromVersion) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        // v1 → v2: add subscription field (null until paid).
        if (fromVersion < 2 && p.subscription === undefined) {
          return { ...p, subscription: null };
        }
        return p as typeof p & { subscription?: unknown };
      },
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (memoryStorage as unknown as Storage),
      ),
      partialize: (s) => ({
        profile: s.profile,
        subscription: s.subscription,
        stepByModule: s.stepByModule,
        completed: s.completed,
        lastModuleId: s.lastModuleId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.profile && !state.roadmap) {
          state.roadmap = buildRoadmap(state.profile.topic, state.profile.grade);
        }
      },
    },
  ),
);
