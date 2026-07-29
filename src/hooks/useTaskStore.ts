import { useSyncExternalStore } from "react";
import { taskStore } from "../stores/taskStore";
import type { Task } from "../stores/taskStore";

function subscribe(callback: () => void) {
  return taskStore.subscribe(callback);
}

function getSnapshot(): Task[] {
  return taskStore.tasks;
}

function getServerSnapshot(): Task[] {
  return taskStore.tasks;
}

export function useTaskStore(): Task[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}