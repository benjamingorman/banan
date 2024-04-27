import json
from typing import Dict, List, Optional, Tuple

import pydantic
import screepsapi

from src.config import DEBUG_DIR, DEBUG_ENABLED, AppConfig, load_config

EXPECTED_BANAN_FORMAT_VERSION = 2


class KeyMap(pydantic.BaseModel):
    """See equivalent TypeScript definition."""

    map: Dict[str, int]
    maxID: int


class ProfilingMark(pydantic.BaseModel):
    """See equivalent TypeScript definition."""

    shortName: str
    fullName: str
    timestamp: float
    """Timestamp of the dump in CPU time since start of tick."""


class CompressedProfilingDump(pydantic.BaseModel):
    """See equivalent TypeScript definition."""

    t: int
    """Timestamp of the dump in unix milliseconds."""

    m: List[ProfilingMark]
    """List of interesting events marked by Screeps code."""

    d: Tuple[int, float, float, int, Tuple]
    """Order is: keyMap id of key, start, cpu, intents, children"""


class CompressedProfilingHistory(pydantic.BaseModel):
    """See equivalent TypeScript definition."""

    version: int
    ticks: List[CompressedProfilingDump]
    keyMap: KeyMap


class ProfilingNode(pydantic.BaseModel):
    """A decompressed profiling node."""

    key: str
    start: float
    cpu: float
    intents: int
    children: List["ProfilingNode"]
    marks: Optional[List[ProfilingMark]] = None
    timestamp: Optional[int] = None

    def self_cost(self) -> float:
        """Return the cpu cost of this node minus the cost of the children."""
        total = self.cpu
        for child in self.children:
            total -= child.cpu
        return total

    def get_end_time(self) -> float:
        return self.start + self.cpu

    def search_by_time(
        self, search_time: float, call_stack: List[str]
    ) -> Tuple[Optional["ProfilingNode"], List[str]]:
        """Search for the deepest child node which was running at the given time.

        Return the found node (if any) as well as the frame stack.
        """
        call_stack.append(self.key)

        if search_time < self.start or search_time > self.get_end_time():
            return None, call_stack

        # It's a leaf node so it must be this
        if not self.children:
            return self, call_stack

        for child in self.children:
            (target, _) = child.search_by_time(search_time, call_stack)
            if target:
                return target, call_stack
            else:
                call_stack.pop()

        # No children matched so it must be this
        return self, call_stack


def decompress_history(comp: CompressedProfilingHistory) -> List[ProfilingNode]:
    """Decompress a dump of profiling history."""
    if comp.version != EXPECTED_BANAN_FORMAT_VERSION:
        raise ValueError(
            f"Expected banan format version {EXPECTED_BANAN_FORMAT_VERSION} but got {comp.version}"
        )
    return [decompress_dump(comp.keyMap, dump) for dump in comp.ticks]


def decompress_dump(keyMap: KeyMap, dump: CompressedProfilingDump) -> ProfilingNode:
    """Decompress a single dump."""
    # Invert the key map so we can find a key by ID
    inverted_key_map = {v: k for k, v in keyMap.map.items()}
    decomp = decompress_node(inverted_key_map, dump.d)
    decomp.marks = dump.m
    decomp.timestamp = dump.t
    return decomp


def decompress_node(inverted_key_map: Dict[int, str], node: Tuple) -> ProfilingNode:
    """Recursively decompress a single node."""
    key_id = node[0]
    key = inverted_key_map.get(key_id)
    if key is None:
        raise ValueError("Did not find key ID {} in key map".format(key_id))

    return ProfilingNode(
        key=key,
        start=node[1],
        cpu=node[2],
        intents=node[3],
        children=[decompress_node(inverted_key_map, child) for child in node[4]],
    )


def fetch_history(cfg: AppConfig, server_name: str) -> List[ProfilingNode]:
    server_cfg = cfg.get_server_cfg(server_name)
    if not server_cfg:
        raise ValueError("No such server: {}".format(server_name))

    pargs = []
    kwargs = {}

    if server_cfg.token:
        kwargs["token"] = server_cfg.token
    else:
        pargs.append(server_cfg.email)
        pargs.append(server_cfg.password)

    kwargs["host"] = server_cfg.host
    kwargs["secure"] = server_cfg.secure

    api = screepsapi.API(*pargs, **kwargs)

    resp = api.memory(shard="shard0", path=cfg.banan_history_key)
    if DEBUG_ENABLED:
        with open(f"{DEBUG_DIR}/dump.json", "w") as fh:
            fh.write(json.dumps(resp))

    if not resp or not resp.get("ok") or not resp.get("data"):
        raise ValueError("Failed to fetch history: {}".format(resp))

    comp = CompressedProfilingHistory.model_validate_json(resp["data"])
    return decompress_history(comp)


if __name__ == "__main__":
    cfg = load_config()
    print(json.dumps(fetch_history(cfg, "pserver"), indent=4))
