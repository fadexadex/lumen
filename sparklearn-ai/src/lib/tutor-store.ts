import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LearnerProfile, Roadmap } from "./types";
import { buildRoadmap } from "./mock-roadmaps";

interface TutorState {
  profile: LearnerProfile | null;
  roadmap: Roadmap | null;
  stepByModule: Record<string, number>;
  /** Modules the learner has reached the end of. */
  completed: Record<string, boolean>;
  /** Last module opened — powers "continue where you left off". */
  lastModuleId: string | null;
  setProfile: (p: LearnerProfile) => void;
  setRoadmap: (r: Roadmap) => void;
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
      stepByModule: {},
      completed: {},
      lastModuleId: null,
      setProfile: (profile) => set({ profile }),
      setRoadmap: (roadmap) => set({ roadmap }),
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
          stepByModule: {},
          completed: {},
          lastModuleId: null,
        }),
    }),
    {
      name: "tutor:state",
      // Bump only when the persisted shape breaks — NOT on every app update,
      // so shipping changes never forces learners to redo onboarding.
      version: 1,
      // Persist durably across browser sessions (was sessionStorage before,
      // which wiped onboarding every time the tab closed).
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (memoryStorage as unknown as Storage),
      ),
      // The roadmap is derived from the profile — don't store it. This lets us
      // improve/expand roadmaps in updates without stranding returning learners
      // on a stale, cached path.
      partialize: (s) => ({
        profile: s.profile,
        stepByModule: s.stepByModule,
        completed: s.completed,
        lastModuleId: s.lastModuleId,
      }),
      // Rebuild the roadmap from the restored profile as soon as we rehydrate.
      onRehydrateStorage: () => (state) => {
        if (state?.profile && !state.roadmap) {
          state.roadmap = buildRoadmap(state.profile.topic, state.profile.grade);
        }
      },
    },
  ),
);
