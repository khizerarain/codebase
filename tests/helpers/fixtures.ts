import type { CaptureSignalInput } from "../../src/taste/signals.js";
import type { VehicleInput } from "../../src/vehicles/schema.js";

/** Sample daily driver used across Phase 13 suites. */
export const SAMPLE_TACOMA: VehicleInput = {
  year: 2018,
  make: "Toyota",
  model: "Tacoma",
  currentMileage: 92000,
  fuelType: "gas",
  engine: "3.5 V6",
  modifications: ["bilstein 5100"],
  knownIssues: ["cold brake squeal"],
  notes: "daily driver",
};

/** Higher-mileage garage mate for multi-vehicle tests. */
export const SAMPLE_CIVIC: VehicleInput = {
  year: 2012,
  make: "Honda",
  model: "Civic",
  currentMileage: 145000,
  fuelType: "gas",
  knownIssues: ["intermittent CEL"],
};

export const SAMPLE_SERVICE_HISTORY = [
  {
    date: "2024-03-01",
    mileage: 85000,
    description: "Oil + filter",
    cost: 65,
    diy: true as const,
  },
  {
    date: "2025-01-15",
    mileage: 90000,
    description: "Front brake pads",
    cost: 180,
    diy: true as const,
  },
  {
    date: "2025-08-01",
    mileage: 91500,
    description: "Cabin air filter",
    cost: 25,
    diy: true as const,
  },
];

/** Signals that promote OEM preference skill when recorded 3×. */
export function oemTasteSignals(): CaptureSignalInput[] {
  return [1, 2, 3].map((i) => ({
    type: "accept" as const,
    originalResponse: `OEM pick ${i}`,
    userMessage: `parts choice ${i}`,
    reason: "OEM preferred quality parts please",
  }));
}

/** Signals that promote DIY-first skill. */
export function diyTasteSignals(): CaptureSignalInput[] {
  return [1, 2, 3].map((i) => ({
    type: "accept" as const,
    originalResponse: `DIY checklist ${i}`,
    userMessage: `how do I DIY oil ${i}?`,
    reason: "love DIY step-by-step checklists",
  }));
}
