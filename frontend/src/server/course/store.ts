import type { Course } from "@/lib/course-gen/types";

/**
 * Demo persistence: in-memory, pinned to `globalThis` so it survives Vite dev's
 * per-request SSR module re-evaluation (and HMR). Good enough for a single-node
 * server; a serverless/edge deploy (Cloudflare isolates) would need Durable
 * Objects / KV / SQLite instead — the client also persists the course in
 * localStorage, so reload survives regardless.
 */
const globalForCourses = globalThis as typeof globalThis & {
  __lumenCourses?: Map<string, Course>;
};

export const courses: Map<string, Course> =
  globalForCourses.__lumenCourses ?? (globalForCourses.__lumenCourses = new Map());
