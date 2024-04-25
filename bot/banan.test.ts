import { Banan, ProfilingNode, profile } from "../src/utils/profiler/banan";
import { mockGame, mockMemory } from "./mocks";

let cpuUsed = 0;

beforeEach(() => {
  cpuUsed = 0;
  const cpu: CPU = {
    getUsed: () => cpuUsed,
    limit: 100,
    shardLimits: {},
    tickLimit: 100,
    bucket: 100,
    unlock: () => OK,
    unlocked: true,
    unlockedTime: 0,
    setShardLimits: (limits: CPUShardLimits) => OK,
    generatePixel: () => OK,
  };
  mockGame({ cpu });
  mockMemory();
  Banan.reset();
});

const newTestClass = () => {
  @profile
  class TestClass {
    doWork(iterations?: number) {
      for (let i = 0; i < (iterations || 1); i++) {
        this.worker();
      }
    }

    worker() {
      cpuUsed += 1;
    }
  }
  return new TestClass();
};

describe("Banan", () => {
  it("does nothing when not active", () => {
    const test = newTestClass();
    test.doWork();
    expect(Banan.instance.getCurrentTickDump()).toBeUndefined();
  });

  test("basic integration test", () => {
    Banan.instance.init();
    Banan.instance.startTick();
    const test = newTestClass();
    test.doWork(2);
    Banan.instance.endTick();

    const dump = Banan.instance.getCurrentTickDump() as ProfilingNode;
    console.log("dump", JSON.stringify(dump));
    expect(dump).not.toBeUndefined();

    const child = dump.children[0];
    expect(child.key).toBe("TestClass:doWork");
    expect(child.cpu).toBe(2);

    const grandchild1 = child.children[0];
    expect(grandchild1.key).toBe("TestClass:worker");
    expect(grandchild1.cpu).toBe(1);

    const grandchild2 = child.children[1];
    expect(grandchild2.key).toBe("TestClass:worker");
    expect(grandchild2.cpu).toBe(1);

    expect(dump.cpu).toBe(2);
  });

  test("integration test with history", () => {
    /** On the first tick call doWork 2 times
     * On the second tick call doWork 1 time
     * Total should be 3 and average 1.5
     */

    const test = newTestClass();

    Banan.instance.startTick();
    test.doWork(2);
    Banan.instance.endTick();

    Game.time += 1;
    cpuUsed = 0;

    Banan.instance.startTick();
    test.doWork(1);
    Banan.instance.endTick();

    const prevDump = Banan.instance.getPrevTickDump() as ProfilingNode;
    expect(prevDump.cpu).toBe(2);

    const currentDump = Banan.instance.getCurrentTickDump() as ProfilingNode;
    expect(currentDump.cpu).toBe(1);

    const average = Banan.instance.getAverageCpuUsed();
    expect(average).toBe(1.5);
  });

  test("autosave to memory", () => {
    const test = newTestClass();

    Banan.instance.init({ autoSaveKey: "BANAN" });
    Banan.instance.startTick();
    test.doWork(2);
    Banan.instance.endTick();

    expect((Memory as any).BANAN).toHaveLength(30);
    expect((Memory as any).BANAN[Game.time % 30].cpu).toBe(2);
  });
});
