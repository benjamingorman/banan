import json
import sys
import os

import pytest

sys.path.append(".")
from src.fetch_history import (
    ProfilingNode,
    CompressedProfilingHistory,
    decompress_history,
)
from src.pprof_convert import TimelineConverter, TimelineStackTrace, PprofConverter


# @pytest.fixture
# def example_tick() -> ProfilingNode:
#     # First assert the file exists
#     assert os.path.exists("tests/data/dump.json")

#     with open("tests/data/dump.json", "rb") as fh:
#         data = json.loads(fh.read().decode("utf-8"))
#         history_comp = CompressedProfilingHistory.parse_obj(data["data"])

#     history_decomp = decompress_history(history_comp)
#     return history_decomp[0]


def test_timeline_convert():
    child_a = ProfilingNode(key="A", start=1.0, cpu=10, intents=0, children=[])
    child_b = ProfilingNode(key="B", start=20, cpu=5, intents=0, children=[])
    example_tick = ProfilingNode(
        key="Tick 100", start=0, cpu=40, intents=0, children=[child_a, child_b]
    )

    print(example_tick)
    stack_traces = TimelineConverter().convert(example_tick)
    assert len(stack_traces)


def test_pprof_convert():
    child_a = ProfilingNode(key="A", start=1.0, cpu=10, intents=0, children=[])
    child_b = ProfilingNode(key="B", start=20, cpu=5, intents=0, children=[])
    example_tick = ProfilingNode(
        key="Tick 100", start=0, cpu=40, intents=0, children=[child_a, child_b]
    )

    profile = PprofConverter().convert_to_pprof_format(example_tick)
    for sample in profile.sample:
        location_set = set(sample.location_id)
        # There shouldn't be any duplicates here
        assert len(location_set) == len(sample.location_id), (
            location_set,
            sample.location_id,
        )

    serialized_protobuf = PprofConverter().convert_to_pprof_bytes(example_tick)
    assert len(serialized_protobuf)
