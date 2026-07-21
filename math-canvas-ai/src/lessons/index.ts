import { linear } from "./linear";
import { pythagoras } from "./pythagoras";
import { quadratic } from "./quadratic";
import { trigonometry } from "./trigonometry";
import type { Lesson } from "./types";

export const lessons: Record<string, Lesson> = {
  quadratic,
  linear,
  pythagoras,
  trigonometry,
};

export const lessonList: Lesson[] = [quadratic, linear, pythagoras, trigonometry];

export function getLesson(slug: string): Lesson | undefined {
  return lessons[slug];
}