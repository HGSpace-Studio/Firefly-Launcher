import { useSyncExternalStore } from "react";
import { navigationStore } from "../stores/navigation";
import type { InstanceNavTarget } from "../stores/navigation";

function subscribe(callback: () => void) {
  return navigationStore.subscribe(callback);
}

function getSnapshot(): InstanceNavTarget | null {
  return navigationStore.pendingInstance;
}

function getServerSnapshot(): InstanceNavTarget | null {
  return navigationStore.pendingInstance;
}

export function useNavigationStore(): InstanceNavTarget | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}