import { z } from "zod";

export const AlertSeveritySchema = z.enum(["info", "watch", "urgent"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AutomationAlertSchema = z.object({
  id: z.string(),
  watchdogId: z.string(),
  severity: AlertSeveritySchema,
  title: z.string(),
  reason: z.string(),
  vehicleId: z.string().optional(),
  vehicleLabel: z.string().optional(),
  suggestedCommands: z.array(z.string()).default([]),
  /** Stable key for dismiss / de-dupe */
  fingerprint: z.string(),
  createdAt: z.string(),
});

export type AutomationAlert = z.infer<typeof AutomationAlertSchema>;

export const DismissalSchema = z.object({
  fingerprint: z.string(),
  dismissedAt: z.string(),
  /** ISO date; omit = until manually cleared */
  until: z.string().optional(),
});

export type Dismissal = z.infer<typeof DismissalSchema>;

export const WatchdogStateSchema = z.object({
  enabled: z.record(z.boolean()).default({}),
  lastRunAt: z.record(z.string()).default({}),
  dismissals: z.array(DismissalSchema).default([]),
  alertHistory: z.array(AutomationAlertSchema).default([]),
});

export type WatchdogState = z.infer<typeof WatchdogStateSchema>;

export interface WatchdogDefinition {
  id: string;
  name: string;
  description: string;
  /** Default on/off — quiet defaults */
  defaultEnabled: boolean;
}

export interface WatchdogRunContext {
  now: Date;
}
