// Process start time, for the dashboard's uptime figure. (Request counts/traffic are now persisted
// in SQLite — see request_logs — instead of in-memory.)
export const stats = {
  startedAt: Date.now(),
};
