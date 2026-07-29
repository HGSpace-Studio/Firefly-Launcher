import { invoke } from "@tauri-apps/api/core";

export type TaskStatus = "idle" | "launching" | "running" | "exited" | "error" | "downloading" | "completed" | "crashed";

export interface Task {
  id: string;
  type: "launch" | "install";
  title: string;
  status: TaskStatus;
  progress: number;
  label: string;
  error?: string;
  instanceId?: string;
  gameVersion?: string;
  javaVersion?: string;
  systemVersion?: string;
  crashLog?: string;
}

type Listener = () => void;

class TaskStore {
  private _tasks = new Map<string, Task>();
  private _listeners = new Set<Listener>();
  private _cleanups = new Map<string, () => void>();
  private _snapshot: Task[] = [];

  get tasks(): Task[] {
    return this._snapshot;
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify() {
    this._snapshot = Array.from(this._tasks.values());
    for (const l of this._listeners) l();
  }

  getTask(id: string): Task | undefined {
    return this._tasks.get(id);
  }

  addTask(task: Task) {
    const existing = this._tasks.get(task.id);
    if (existing) {
      this._tasks.set(task.id, { ...existing, ...task });
    } else {
      this._tasks.set(task.id, task);
    }
    this._notify();
  }

  updateTask(id: string, partial: Partial<Task>) {
    const existing = this._tasks.get(id);
    if (existing) {
      this._tasks.set(id, { ...existing, ...partial });
      this._notify();
    }
  }

  removeTask(id: string) {
    const cleanup = this._cleanups.get(id);
    if (cleanup) { cleanup(); this._cleanups.delete(id); }
    this._tasks.delete(id);
    this._notify();
  }

  async registerLaunchListeners(instanceName: string = "") {
    await invoke("register_launch_listeners", { instanceName });
  }

  async registerInstallListeners(taskId: string) {
    try {
      await invoke("register_install_progress_listeners", { taskId });
    } catch {
      // ignore
    }
  }
}

export const taskStore = new TaskStore();

export function addTask(task: Task) {
  taskStore.addTask(task);
}

export function updateTask(id: string, partial: Partial<Task>) {
  taskStore.updateTask(id, partial);
}

export function removeTask(id: string) {
  taskStore.removeTask(id);
}

export function registerLaunchListeners(instanceName?: string) {
  return taskStore.registerLaunchListeners(instanceName);
}

export function registerInstallListeners(taskId: string) {
  return taskStore.registerInstallListeners(taskId);
}

export function getTask(id: string): Task | undefined {
  return taskStore.getTask(id);
}

export function generateId(): string {
  return "task_" + Math.random().toString(36).substring(2, 9);
}