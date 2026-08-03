import { z } from "zod";

export const TasteSignalSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(["accept", "reject", "edit"]),
  originalResponse: z.string(),
  userCorrection: z.string().optional(),
  reason: z.string().optional(),
  context: z.object({
    userMessage: z.string(),
    vehicleIds: z.array(z.string()).optional(),
  }),
});

export type TasteSignal = z.infer<typeof TasteSignalSchema>;

export const TasteSummarySchema = z.object({
  totalSignals: z.number().int().nonnegative(),
  accepts: z.number().int().nonnegative(),
  rejects: z.number().int().nonnegative(),
  edits: z.number().int().nonnegative(),
  recentReasons: z.array(z.string()),
  markdown: z.string(),
});

export type TasteSummary = z.infer<typeof TasteSummarySchema>;

export const PreferenceCategorySchema = z.enum([
  "diy_vs_shop",
  "part_quality",
  "budget",
  "risk",
  "maintenance_style",
  "brand",
  "ev_ice",
  "communication",
  "performance",
  "other",
]);

export type PreferenceCategory = z.infer<typeof PreferenceCategorySchema>;

export const PreferenceScopeSchema = z.enum(["personal", "vehicle"]);
export type PreferenceScope = z.infer<typeof PreferenceScopeSchema>;

export const PreferenceSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  category: PreferenceCategorySchema,
  scope: PreferenceScopeSchema.default("personal"),
  vehicleIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  sourceSignalIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  lastUpdated: z.string(),
});

export type Preference = z.infer<typeof PreferenceSchema>;

export const SkillSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  whenToApply: z.string(),
  rules: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
  scope: PreferenceScopeSchema.default("personal"),
  vehicleIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
  evidenceCount: z.number().int().nonnegative().default(1),
  enabled: z.boolean().default(true),
  source: z.enum(["learned", "user"]).default("learned"),
  lastUsed: z.string().optional(),
  lastUpdated: z.string(),
  createdAt: z.string(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const TasteProfileSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string(),
  preferences: z.array(PreferenceSchema).default([]),
  skillSlugs: z.array(z.string()).default([]),
});

export type TasteProfile = z.infer<typeof TasteProfileSchema>;

export const LearningInsightSchema = z.object({
  preferencesUpserted: z.array(z.string()),
  skillsUpserted: z.array(z.string()),
  preferencesRemoved: z.array(z.string()).default([]),
  summaryLines: z.array(z.string()),
});

export type LearningInsight = z.infer<typeof LearningInsightSchema>;
