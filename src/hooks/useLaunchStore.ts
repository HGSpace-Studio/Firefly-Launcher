import { useSyncExternalStore } from "react";
import { launchStore } from "../stores/instanceLaunch";

function subscribe(callback: () => void) {
  return launchStore.subscribe(callback);
}

function getSnapshot() {
  return launchStore.getSnapshot();
}

function getServerSnapshot() {
  return launchStore.getSnapshot();
}

export function useLaunchStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}