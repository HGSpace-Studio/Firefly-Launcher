type Listener = () => void;

export interface InstanceNavTarget {
  name: string;
  version: string;
  version_type: string;
  loader?: {
    type: "fabric" | "forge" | "neoforge" | "quilt";
    version: string;
  };
  icon?: string;
}

class NavigationStore {
  private _pendingInstance: InstanceNavTarget | null = null;
  private _listeners = new Set<Listener>();

  get pendingInstance(): InstanceNavTarget | null { return this._pendingInstance; }

  navigateToInstance(target: InstanceNavTarget) {
    this._pendingInstance = target;
    this._notify();
  }

  consumePendingInstance(): InstanceNavTarget | null {
    const val = this._pendingInstance;
    this._pendingInstance = null;
    this._notify();
    return val;
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify() {
    for (const l of this._listeners) l();
  }
}

export const navigationStore = new NavigationStore();