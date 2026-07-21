export type LearningStyle = "stories" | "examples" | "step-by-step" | "challenge";
export type AudioPref = "off" | "music" | "voice";

export interface LearnerProfile {
  name: string;
  grade: number;
  subject: string;
  topic: string;
  style: LearningStyle;
  audio: AudioPref;
}

export interface RoadmapModule {
  id: string;
  title: string;
  blurb: string;
}

export interface Roadmap {
  topic: string;
  modules: RoadmapModule[];
}

export type StepKind = "explanation" | "example" | "practice";

export interface LessonStepExplanation {
  kind: "explanation";
  title: string;
  body: string;
  math?: string;
}
export interface LessonStepExample {
  kind: "example";
  title: string;
  lines: { text?: string; math?: string }[];
}
export interface LessonStepPractice {
  kind: "practice";
  title: string;
  prompt: string;
  math?: string;
  options?: string[];
  answer: string;
  hint?: string;
}
export type LessonStep = LessonStepExplanation | LessonStepExample | LessonStepPractice;

export interface LessonScript {
  moduleId: string;
  title: string;
  steps: LessonStep[];
  diagram?: LessonDiagram;
}

export interface LessonDiagram {
  /** For a parabola y = ax² + bx + c */
  parabola?: { a: number; b: number; c: number; roots?: number[]; vertex?: [number, number] };
  /** Algebra-tile decomposition: x² count, x count, unit count, plus factored form. */
  tiles?: { xSquared: number; x: number; unit: number; factored?: [string, string] };
  /** Points to mark on a number line, plus range. */
  numberLine?: { points: { x: number; label?: string }[]; range: [number, number] };
  /** Optional per-step captions used by the storyboard/diagram concepts. */
  captions?: string[];
}
