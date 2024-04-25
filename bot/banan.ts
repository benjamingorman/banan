export const BANAN_ENABLED = true;

export interface BananOpts {
  maxHistory?: number;
  autoSaveKey?: string;
}

export interface ProfilingNode {
  key: string;
  start: number;
  cpu: number;
  children: ProfilingNode[];
  marks?: ProfilingMark[];
}

interface StackFrame {
  key: string;
  start: number;
  children: ProfilingNode[];
}

/**
 * An interesting event that we want to highlight.
 * This will appear as a line in the UI.
 */
interface ProfilingMark {
  shortName: string;
  fullName: string;
  timestamp: number;
}

/**
 * A profiler for measuring CPU usage of different parts of the code.
 */
export class Banan {
  private static _instance: Banan;
  public static get instance(): Banan {
    return this._instance || this.reset();
  }

  public static reset(): Banan {
    return (this._instance = new this());
  }

  private tick?: number;
  private tickRootNode?: ProfilingNode;
  private stack: StackFrame[] = [];
  private autoSaveKey?: string;
  private marks: ProfilingMark[] = [];

  /** Keep a history of the last N ticks */
  private history: Array<ProfilingNode | undefined> = new Array(30);

  public init(opts?: BananOpts): void {
    this.history = new Array(opts?.maxHistory || 30);
    this.history.fill(undefined);
    Object.seal(this.history);

    if (opts?.autoSaveKey) {
      this.autoSaveKey = opts.autoSaveKey;
    }
  }

  public startTick(): void {
    this.tick = Game.time;
    this.stack = [];
    this.marks = [];
    this.tickRootNode = {
      key: "Tick " + this.tick,
      start: 0,
      cpu: 0,
      children: [],
    };
  }

  public endTick(): void {
    this.tick = undefined;
    this.tickRootNode!.cpu = Game.cpu.getUsed();
    this.tickRootNode!.marks = this.marks;
    this.history[this.getHistoryPtr()] = this.tickRootNode;

    if (this.autoSaveKey) {
      this.saveToMemory(this.autoSaveKey);
    }
  }

  public addMark(fullName: string, shortName?: string): void {
    if (!this.isEnabled()) return;
    this.marks.push({
      fullName,
      shortName: shortName || fullName,
      timestamp: Game.cpu.getUsed(),
    });
  }

  public getCurrentTickDump(): ProfilingNode | undefined {
    return this.history[this.getHistoryPtr(Game.time)];
  }

  public getPrevTickDump(): ProfilingNode | undefined {
    return this.history[this.getHistoryPtr(Game.time - 1)];
  }

  public getPrevTickCpuUsed(): number | undefined {
    return this.getPrevTickDump()?.cpu;
  }

  /**
   * Log information about the current tick to the console.
   */
  public logInfo(): void {
    const currentDump = this.getCurrentTickDump();
    if (currentDump) {
      console.log("🍌 Current tick CPU usage:", currentDump.cpu);
    } else {
      console.log("🍌 No current tick!");
    }
  }

  public getAverageCpuUsed(): number {
    let count = 0;
    const total = this.history.reduce((acc, node) => {
      if (node) {
        count++;
        return acc + node.cpu;
      }
      return acc;
    }, 0);
    return total / count;
  }

  public saveToMemory(key: string): void {
    (Memory as any)[key] = this.history;
  }

  /**
   * Decorator for profiling a function.
   */
  public profile(
    target: object | Function,
    key?: string | symbol,
    _descriptor?: TypedPropertyDescriptor<Function>,
  ): void {
    if (!BANAN_ENABLED) {
      // console.log("Banan is not active");
      return;
    }

    if (key) {
      // case of method decorator
      this.wrapFunction(target, key);
      return;
    }

    // case of class decorator

    const ctor = target as any;
    if (!ctor.prototype) {
      return;
    }

    const className = ctor.name;
    Reflect.ownKeys(ctor).forEach((k) => {
      if (k === "length" || k === "name" || k === "prototype") {
        return;
      }
      this.wrapFunction(ctor, k, className);
    });

    Reflect.ownKeys(ctor.prototype).forEach((k) => {
      this.wrapFunction(ctor.prototype, k, className);
    });
  }

  private getHistoryPtr(targetTick?: number): number {
    return (targetTick ?? Game.time) % this.history.length;
  }

  private isEnabled(): boolean {
    return Game.time === this.tick;
  }

  private wrapFunction(
    obj: object,
    key: PropertyKey,
    className?: string,
  ): void {
    // console.log("WRAP", obj, key);
    const descriptor = Reflect.getOwnPropertyDescriptor(obj, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      return;
    }

    if (key === "constructor") {
      return;
    }

    const originalFunction = descriptor.value;
    if (!originalFunction || typeof originalFunction !== "function") {
      return;
    }

    // set a key for the object in memory
    if (!className) {
      className = obj.constructor ? `${obj.constructor.name}` : "";
    }
    const memKey = className + `:${String(key)}`;

    // set a tag so we don't wrap a function twice
    // TODO use WeakMap?
    const savedName = `__${String(key)}__`;
    if (Reflect.has(obj, savedName)) {
      return;
    }

    Reflect.set(obj, savedName, originalFunction);

    ///////////

    // console.log("REFLECT SET", obj, key);
    const banan = this;
    Reflect.set(obj, key, function (this: any, ...args: any[]) {
      // console.log("IN REFLECT", obj, key);
      if (banan.isEnabled()) {
        banan.pushStack(memKey);
        const result = originalFunction.apply(this, args);
        banan.popStack(memKey);
        return result;
      }
      return originalFunction.apply(this, args);
    });
  }

  /**
   * Push a function call on to the stack when it begins.
   */
  private pushStack(key: string): void {
    this.stack.push({ key, start: Game.cpu.getUsed(), children: [] });
  }

  /**
   * Pop a function call off the stack when it begins.
   */
  private popStack(key: string): void {
    const stopCpu = Game.cpu.getUsed();

    const frame = this.stack.pop();
    if (!frame) {
      throw new Error("Banan stack empty");
    }

    if (frame.key !== key) {
      throw new Error("Banan stack mismatch");
    }
    const parent = this.stack[this.stack.length - 1] || this.tickRootNode;
    parent.children.push({
      key,
      start: frame.start,
      cpu: stopCpu - frame.start,
      children: frame.children,
    });
  }
}

export function profile(
  target: object | Function,
  key?: string | symbol,
  _descriptor?: TypedPropertyDescriptor<any>,
): void {
  Banan.instance.profile(target, key, _descriptor);
}
