// Event data and popup state shared by the controller and pure render helpers.
export const eventStore = {
  status: "idle", // idle | loading | ready | error
  snapshot: null,
  serverTime: null,
  serverOffsetMs: 0,
  error: "",
  open: false,
};

export function resetEventStore() {
  eventStore.status = "idle";
  eventStore.snapshot = null;
  eventStore.serverTime = null;
  eventStore.serverOffsetMs = 0;
  eventStore.error = "";
  eventStore.open = false;
}
