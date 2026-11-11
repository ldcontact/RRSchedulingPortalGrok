export type FleetStatus = "driving" | "stopped" | "offline";

export type FleetMapping = {
  geotab_device_id: string;
  label: string | null;
  profile_id: string | null;
};

export type FleetPerson = {
  id: string;
  full_name: string;
  color: string;
  avatar_url?: string | null;
};

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
};

export type FleetNearestVisit = {
  jobId: string;
  title: string;
  customerName: string;
  address: string | null;
  distanceMeters: number;
  distanceLabel: string;
  etaMinutes: number | null;
  kind: "enroute" | "onsite";
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
