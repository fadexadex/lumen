import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { LearnerProfile, Roadmap } from "./types";

interface TutorState {
  profile: LearnerProfile | null;
  roadmap: Roadmap | null;
  stepByModule: Record<string, number>;
  setProfile: (p: LearnerProfile) => void;
  setRoadmap: (r: Roadmap) => void;
  setStep: (moduleId: string, step: number) => void;
  reset: () => void;
}

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useTutorStore = create<TutorState>()(
  persist(
    (set) => ({
      profile: null,
      roadmap: null,
      stepByModule: {},
      setProfile: (profile) => set({ profile }),
      setRoadmap: (roadmap) => set({ roadmap }),
      setStep: (moduleId, step) =>
        set((s) => ({ stepByModule: { ...s.stepByModule, [moduleId]: step } })),
      reset: () => set({ profile: null, roadmap: null, stepByModule: {} }),
    }),
    {
      name: "tutor:state",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.sessionStorage
          : (memoryStorage as unknown as Storage),
      ),
    },
  ),
);