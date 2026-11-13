import type { JobKind, JobStatus, ProjectType } from "@/lib/types";

export type FleetStatus = "driving" | "stopped" | "offline";

export type FleetMapping = {
  geotab_device_id: string;
  label: string | null;
  profile_id: string | null;
  invite_email?: string | null;
};

export type FleetPerson = {
  id: string;
  full_name: string;
  color: string;
  avatar_url?: string | null;
  /** True when this person is still an invite (no profile yet). */
  invited?: boolean;
  email?: string;
};

export type FleetVisitAssignee = { id: string; full_name: string; color: string; avatar_url?: string | null };

export type FleetVisitPin = {
  jobId: string;
  title: string;
  customerName: string;
  address: string | null;
  startsAt: string;
  endsAt: string;
  latitude: number;
  longitude: number;
  assigneeIds: string[];
  projectId: string | null;
  projectName: string | null;
  projectType: ProjectType;
  kind: JobKind;
  status: JobStatus;
  assignees: FleetVisitAssignee[];
};

export type FleetNearestVisit = {
  jobId: string;
  title: string;
  customerName: string;
  address: string | null;
  startsAt: string;
  distanceMeters: number;
  distanceLabel: string;
  straightLineMeters: number;
  straightLineLabel: string;
  drivingDistanceMeters: number;
  drivingDistanceLabel: string;
  driveSource: "osrm" | "straight-line";
  etaMinutes: number | null;
  etaAt: string | null;
  /** e.g. "Arrives ~9:40 AM, 10 min late" */
  etaSummary: string | null;
  late: boolean;
  kind: "enroute" | "onsite";
  onSiteSince: string | null;
  onSiteSinceLabel: string | null;
  /** Driving geometry as [lat, lng] pairs; empty when we only have a straight-line fallback. */
  route: [number, number][];
};

export type FleetVehicle = {
  id: string;
  name: string;
  label: string | null;
  status: FleetStatus;
  speedMph: number | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  lastUpdate: string | null;
  isDeviceCommunicating: boolean;
  stoppedForLabel: string | null;
  /** Set when the vehicle has been stopped for more than 24 hours. */
  parkedSince: string | null;
  geotabDriverName: string | null;
  profile: FleetPerson | null;
  nearestVisit: FleetNearestVisit | null;
};

export type FleetLocationsResponse = {
  sample: boolean;
  asOf: string;
  /** "census" once addresses can be geocoded; visit pins appear only for jobs with stored (or sample-fallback) coords. */
  geocoding: "census";
  vehicles: FleetVehicle[];
  visits: FleetVisitPin[];
};

/** Raw position pulled from MyGeotab (or sample), before mapping to a team member. */
export type GeotabVehicleSnapshot = {
  id: string;
  name: string;
  status: FleetStatus;
  speedKmh: number | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  lastUpdate: string | null;
  isDeviceCommunicating: boolean;
  currentStateDuration: string | null;
  geotabDriverName: string | null;
};
