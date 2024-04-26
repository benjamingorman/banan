from gzip import decompress
import json
import os
from typing import Dict, List, Tuple, Optional

import screepsapi
import pydantic

from src.config import AppConfig, load_config


class KeyMap(pydantic.BaseModel):
    """See equivalent TypeScript definition."""
    map: Dict[str, int]
    maxID: int

class ProfilingMark(pydantic.BaseModel):
    """See equivalent TypeScript definition."""
    shortName: str
    fullName: str
    timestamp: float

class CompressedProfilingDump(pydantic.BaseModel):
    """See equivalent TypeScript definition."""
    m: List[ProfilingMark]

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


def decompress_history(comp: CompressedProfilingHistory) -> List[ProfilingNode]:
    """Decompress a dump of profiling history."""
    return [decompress_dump(comp.keyMap, dump) for dump in comp.ticks]

def decompress_dump(keyMap: KeyMap, dump: CompressedProfilingDump) -> ProfilingNode:
    """Decompress a single dump."""
    # Invert the key map so we can find a key by ID
    inverted_key_map = {v: k for k, v in keyMap.map.items()}
    decomp = decompress_node(inverted_key_map, dump.d)
    decomp.marks = dump.m
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
    with open("dump.json", "w") as fh:
        fh.write(json.dumps(resp))

    if not resp or not resp["ok"]:
        raise ValueError("Failed to fetch history: {}".format(resp))

    comp = CompressedProfilingHistory.model_validate_json(resp["data"])
    return decompress_history(comp)



if __name__ == "__main__":
    cfg = load_config()
    print(json.dumps(fetch_history(cfg, "pserver"), indent=4))
