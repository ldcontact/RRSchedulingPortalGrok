/**
 * Staff team-texting constants.
 *
 * Sending uses Messaging Service MGd9c501ee58d692b02045cac722b2c0fa and the
 * existing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN env vars. A dedicated
 * TEAM_SMS_MESSAGING_SERVICE_SID may override the default SID.
 *
 * Never use the Unify Notification service or its number.
 */

export const TEAM_SMS_MESSAGING_SERVICE_SID_DEFAULT = "MGd9c501ee58d692b02045cac722b2c0fa";

/** Unify Notification — do not send through this service. */
export const FORBIDDEN_MESSAGING_SERVICE_SIDS = ["MG130598d4d72b7e57bc75683e76b9caec"] as const;

/** Unify / reserved number — never send to or from this. */
export const FORBIDDEN_PHONE_NUMBERS = ["+12342307005"] as const;

export const BATCH_WINDOW_MINUTES = 10;
/** Quiet hours in America/Chicago: 8:00 PM inclusive through 7:00 AM exclusive. */
export const QUIET_HOURS_START_MINUTES = 20 * 60;
export const QUIET_HOURS_END_MINUTES = 7 * 60;
export const MORNING_SUMMARY_MINUTES = 7 * 60;

export const TEAM_SMS_KINDS = ["assignment", "same_day", "morning", "batch"] as const;
export type TeamSmsKind = (typeof TEAM_SMS_KINDS)[number];

export const TEAM_SMS_STATUSES = ["queued", "held", "sent", "failed", "canceled"] as const;
export type TeamSmsStatus = (typeof TEAM_SMS_STATUSES)[number];

export const TEAM_SMS_ENTITY_TYPES = ["visit", "service_request", "task"] as const;
export type TeamSmsEntityType = (typeof TEAM_SMS_ENTITY_TYPES)[number];

export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;
