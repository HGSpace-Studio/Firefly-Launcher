import { useSyncExternalStore } from "react";
import { openedInstancesStore } from "../stores/openedInstances";
import type { InstanceInfo } from "../stores/openedInstances";

function subscribe(callback: () => void) {
  return openedInstancesStore.subscribe(callback);
}

function getSnapshot(): InstanceInfo[] {
  return openedInstancesStore.instances;
}

function getServerSnapshot(): InstanceInfo[] {
  return openedInstancesStore.instances;
}

export function useOpenedInstancesStore(): InstanceInfo[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}