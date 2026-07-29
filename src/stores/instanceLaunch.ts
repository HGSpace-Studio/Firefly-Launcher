type Listener = () => void;

interface LaunchStoreSnapshot {
  currentInstanceName: string | null;
  currentLaunchFn: (() => Promise<void>) | null;
  currentStopFn: (() => Promise<void>) | null;
}

class LaunchStore {
  private _currentInstanceName: string | null = null;
  private _currentLaunchFn: (() => Promise<void>) | null = null;
  private _currentStopFn: (() => Promise<void>) | null = null;
  private _listeners = new Set<Listener>();
  private _snapshot: LaunchStoreSnapshot;

  constructor() {
    this._snapshot = this._buildSnapshot();
  }

  get currentInstanceName(): string | null { return this._currentInstanceName; }
  get currentLaunchFn(): (() => Promise<void>) | null { return this._currentLaunchFn; }
  get currentStopFn(): (() => Promise<void>) | null { return this._currentStopFn; }

  getSnapshot(): LaunchStoreSnapshot {
    return this._snapshot;
  }

  private _buildSnapshot(): LaunchStoreSnapshot {
    return {
      currentInstanceName: this._currentInstanceName,
      currentLaunchFn: this._currentLaunchFn,
      currentStopFn: this._currentStopFn,
    };
  }

  setCurrentInstanceName(name: string | null) {
    this._currentInstanceName = name;
    this._notify();
  }

  setCurrentLaunchFn(fn: (() => Promise<void>) | null) {
    this._currentLaunchFn = fn;
    this._notify();
  }

  setCurrentStopFn(fn: (() => Promise<void>) | null) {
    this._currentStopFn = fn;
    this._notify();
  }

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify() {
    this._snapshot = this._buildSnapshot();
    for (const l of this._listeners) l();
  }
}

export const launchStore = new LaunchStore();