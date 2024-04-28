import {
  BANAN_CONFIG,
  Banan,
  CompressedProfilingDump,
  ProfilingNode,
  profile,
} from "../src/utils/profiler/banan";
import { mockGame, mockMemory } from "./mocks";

let cpuUsed = 0;

beforeEach(() => {
  BANAN_CONFIG.enabled = true;
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
    Banan.instance.init();
    expect(Banan.instance.getCurrentTickDump()).toBeFalsy();
  });

  test("basic integration test", () => {
    Banan.instance.init();
    Banan.instance.startTick();
    const test = newTestClass();
    test.doWork(2);
    Banan.instance.endTick();

    const root = Banan.instance.getCurrentTickDump() as CompressedProfilingDump;
    console.log("root", JSON.stringify(root));
    expect(root).not.toBeFalsy();

    const child = root.d[4][0];
    // expect(child[0]).toBe("TestClass:doWork");
    expect(child[2]).toBe(2);

    const grandchild1 = child[4][0];
    // expect(grandchild1.key).toBe("TestClass:worker");
    expect(grandchild1[2]).toBe(1);

    const grandchild2 = child[4][1];
    // expect(grandchild2.key).toBe("TestClass:worker");
    expect(grandchild2[2]).toBe(1);

    expect(root.d[2]).toBe(2);
  });

  test("integration test with history", () => {
    /** On the first tick call doWork 2 times
     * On the second tick call doWork 1 time
     * Total should be 3 and average 1.5
     */

    const test = newTestClass();

    Banan.instance.init();
    Banan.instance.startTick();
    test.doWork(2);
    Banan.instance.endTick();

    Game.time += 1;
    cpuUsed = 0;

    Banan.instance.startTick();
    test.doWork(1);
    Banan.instance.endTick();

    const prevDump = Banan.instance.getPrevTickDump()!;
    const currentDump = Banan.instance.getCurrentTickDump()!;

    // @ts-ignore
    console.log("history", JSON.stringify(Banan.instance.history));
    console.log("prevDump", JSON.stringify(prevDump));
    console.log("currentDump", JSON.stringify(currentDump));
    expect(prevDump.d[4][0][2]).toBe(2);
    expect(currentDump.d[4][0][2]).toBe(1);

    const average = Banan.instance.getAverageCpuUsed();
    expect(average).toBe(1.5);
  });

  test("autosave to memory", () => {
    const test = newTestClass();

    Banan.instance.init({ autoSaveKey: "BANAN" });
    Banan.instance.startTick();
    test.doWork(2);
    Banan.instance.endTick();

    const dump = JSON.parse((Memory as any).BANAN);
    expect(dump.ticks.length).toBeGreaterThan(0);
  });
});
