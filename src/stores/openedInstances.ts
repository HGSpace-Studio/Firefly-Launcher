type Listener = () => void;

export interface InstanceInfo {
  name: string;
  version: string;
  version_type: string;
  loader?: string;
}

class OpenedInstancesStore {
  private _instances = new Map<string, InstanceInfo>();
  private _listeners = new Set<Listener>();
  private _snapshot: InstanceInfo[] = [];

  get instances(): InstanceInfo[] {
    return this._snapshot;
  }

  addOpenedInstance(inst: InstanceInfo) {
    if (!this._instances.has(inst.name)) {
      this._instances.set(inst.name, inst);
      this._notify();
    }
  }

  removeOpenedInstance(name: string) {
    this._instances.delete(name);
    this._notify();
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify() {
    this._snapshot = Array.from(this._instances.values());
    for (const l of this._listeners) l();
  }
}

export const openedInstancesStore = new OpenedInstancesStore();