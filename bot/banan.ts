/** Whether to enable Banan or not. Turn off when not profiling. */
export const BANAN_ENABLED = true;

/** Options for configuring the profiler. */
export interface BananOpts {
  maxHistory?: number;
  autoSaveKey?: string;
}

/** A node in the profiling tree. */
export interface ProfilingNode {
  key: string;
  start: number;
  cpu: number;
  children: ProfilingNode[];
  marks?: ProfilingMark[];
}

/**
 * A stack frame for the profiler.
 * These are only ever created temporarily, and will be converted
 * to ProfilingNodes when the stack frame is popped.
 * */
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
  /** The singleton instance of the profiler */
  private static _instance: Banan;
  public static get instance(): Banan {
    return this._instance || this.reset();
  }

  /** Reset the state of the profiler */
  public static reset(): Banan {
    return (this._instance = new this());
  }

  /** The current tick number */
  private tick?: number;

  /** The root node of the current tick's profiling tree */
  private tickRootNode?: ProfilingNode;

  /** The stack of nodes currently being profiled */
  private stack: StackFrame[] = [];

  /** The key to use for auto-saving the profiler data to Memory */
  private autoSaveKey?: string;

  /** A list of interesting events that we want to highlight */
  private marks: ProfilingMark[] = [];

  /** Keep a history of the last N ticks */
  private history: Array<ProfilingNode | undefined> = new Array(30);

  /**
   * Initialize the profiler with supplied options.
   */
  public init(opts?: BananOpts): void {
    if (!BANAN_ENABLED) return;
    this.history = new Array(opts?.maxHistory || 30);
    this.history.fill(undefined);
    Object.seal(this.history);

    if (opts?.autoSaveKey) {
      this.autoSaveKey = opts.autoSaveKey;
    }
  }

  /**
   * Should be called at the start of each tick.
   */
  public startTick(): void {
    if (!BANAN_ENABLED) return;
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

  /**
   * Should be called at the end of each tick.
   */
  public endTick(): void {
    if (!BANAN_ENABLED) return;
    this.tick = undefined;
    this.tickRootNode!.cpu = Game.cpu.getUsed();
    this.tickRootNode!.marks = this.marks;
    this.history[this.getHistoryPtr()] = this.tickRootNode;

    if (this.autoSaveKey) {
      this.saveToMemory(this.autoSaveKey);
    }
  }

  /**
   * Add a mark to the recording, which indicates an important event
   * in the bot that we want to highlight on the flame graph.
   */
  public addMark(fullName: string, shortName?: string): void {
    if (!BANAN_ENABLED) return;
    if (!this.isRecording()) return;
    this.marks.push({
      fullName,
      shortName: shortName || fullName,
      timestamp: Game.cpu.getUsed(),
    });
  }

  /**
   * Return the profiling node from the current tick.
   */
  public getCurrentTickDump(): ProfilingNode | undefined {
    if (!BANAN_ENABLED) return undefined;
    return this.history[this.getHistoryPtr(Game.time)];
  }

  /**
   * Return the profiling node from the previous tick.
   */
  public getPrevTickDump(): ProfilingNode | undefined {
    if (!BANAN_ENABLED) return undefined;
    return this.history[this.getHistoryPtr(Game.time - 1)];
  }

  /**
   * Return the CPU used in the current tick.
   */
  public getPrevTickCpuUsed(): number | undefined {
    if (!BANAN_ENABLED) return undefined;
    return this.getPrevTickDump()?.cpu;
  }

  /**
   * Log information about the current tick to the console.
   */
  public logInfo(): void {
    if (!BANAN_ENABLED) return;
    const currentDump = this.getCurrentTickDump();
    if (currentDump) {
      console.log("🍌 Current tick CPU usage:", currentDump.cpu);
    } else {
      console.log("🍌 No current tick!");
    }
  }

  /**
   * Return the average CPU used over the last N ticks.
   */
  public getAverageCpuUsed(): number {
    if (!BANAN_ENABLED) return 0;
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

  /**
   * Write the current profiling history to memory.
   */
  public saveToMemory(key: string): void {
    (Memory as any)[key] = this.history;
  }

  /**
   * Get a pointer to the history array for the given tick.
   */
  private getHistoryPtr(targetTick?: number): number {
    return (targetTick ?? Game.time) % this.history.length;
  }

  /**
   * Are we currently in the middle of a tick and recording?
   */
  private isRecording(): boolean {
    return Game.time === this.tick;
  }

  /**
   * Decorator for profiling a function.
   */
  public profile(
    target: object | Function,
    key?: string | symbol,
    _descriptor?: TypedPropertyDescriptor<Function>,
  ): void {
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

  /**
   * Wrap a function with profiling code.
   */
  private wrapFunction(
    obj: object,
    key: PropertyKey,
    className?: string,
  ): void {
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

    const banan = this;
    Reflect.set(obj, key, function (this: any, ...args: any[]) {
      if (banan.isRecording()) {
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

/**
 * Profiling decorator that should be applied to any code to be profiled.
 */
export function profile(
  target: object | Function,
  key?: string | symbol,
  _descriptor?: TypedPropertyDescriptor<any>,
): void {
  if (!BANAN_ENABLED) return;
  Banan.instance.profile(target, key, _descriptor);
}
