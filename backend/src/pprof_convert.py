from typing import Dict, Optional, List

import pydantic

from src.config import DEBUG_ENABLED
from src.fetch_history import ProfilingNode
from src.protogen.orig import pprof_pb2
from src.protogen.perftools.profiles import (
    Function,
    Line,
    Location,
    Mapping,
    Profile,
    Sample,
    ValueType,
)


def ms_to_ns(ms: float) -> int:
    return int(ms * 1e6)


class TimelineStackTrace(pydantic.BaseModel):
    start_ms: float
    location_stack: List[str]


class TimelineConverter:
    """Convert from banan call tree to list of stack traces.

    The profiling format that banan produces is a deterministic call tree.
    This is not really what pprof expects, since it expects samples from
    statistical profiling with a fixed period between them.

    Before converting to pprof format we must first convert our call tree
    to a list of stack traces with a fixed period.

    As an example:

          A
         ↙ ↘
        B   C

    This call tree needs to instead be represented as a set of stack frames,
    depending on how long was spent in each node:

        A A A B A A C C C
    """

    PERIOD_BETWEEN_TRACES_MS = 0.1

    def convert(self, root: ProfilingNode) -> List[TimelineStackTrace]:
        """Convert from tree structure to a list of stack traces."""
        print("Converting to timeline format...")

        traces = []

        # Loop through every possible stack frame
        frame_time = 0
        end = root.get_end_time()
        while frame_time < end:
            (frame_node, loc_stack) = root.search_by_time(frame_time, [])
            if not frame_node:
                raise ValueError(f"No frame at {frame_time}")

            frame_time += self.PERIOD_BETWEEN_TRACES_MS
            traces.append(
                TimelineStackTrace(
                    start_ms=frame_time, location_stack=list(reversed(loc_stack))
                )
            )
            # print(frame_time, frame_node.key)

        return traces


class PprofConverter:
    def __init__(self):
        self.string_map: Dict[str, int] = {}
        self.location_id_map: Dict[str, int] = {}
        self.location_map: Dict[int, Location] = {}
        self.function_map: Dict[int, Function] = {}

        self.next_location_id = 1
        self.profile = Profile()

    def convert_to_pprof_bytes(self, node: ProfilingNode) -> bytes:
        """Convert a from banan format to a pprof format bytestring."""
        profile = self.convert_to_pprof_format(node)
        serialized_profile = bytes(profile)

        # Patch the string table:
        # python-betterproto seems to have a bug where it won't properly
        # serialize the empty string at the start of the string table
        # To fix this, load the dump with the original Google python
        # code and just patch the string table.
        patched_profile = pprof_pb2.Profile()
        patched_profile.ParseFromString(serialized_profile)
        patched_profile.string_table.insert(0, "")

        serialized_patched = patched_profile.SerializeToString()

        if DEBUG_ENABLED:
            with open("debug/profile.prof", "wb") as fh:
                fh.write(serialized_patched)

            profile2 = Profile()
            profile2.parse(serialized_patched)

            with open("debug/profile.prof.json", "w") as fh:
                fh.write(profile2.to_json(indent=2))

        return serialized_patched

    def convert_to_pprof_format(self, node: ProfilingNode) -> Profile:
        """Convert a from banan format to a pprof format Profile object.

        This object comes from generated Python code created by
        python-betterproto from the pprof protobuf.
        """
        cpu_in_ns = ms_to_ns(node.cpu)
        start_in_ns = ms_to_ns(node.start)

        # TODO: seems like a bug in python-betterproto - this doesn't get serialized
        self.profile.string_table.append("")  # empty string must be first entry

        if node.timestamp:
            self.profile.time_nanos = ms_to_ns(node.timestamp)
        self.profile.duration_nanos = cpu_in_ns
        self.profile.period = ms_to_ns(TimelineConverter.PERIOD_BETWEEN_TRACES_MS)

        unit_name = "nanoseconds"
        self.profile.period_type = ValueType(
            type=self._get_string_map_id("cpu"),
            unit=self._get_string_map_id(unit_name),
        )

        # self.profile.sample_type.append(
        #     ValueType(
        #         type=self._get_string_map_id("cpu"),
        #         unit=self._get_string_map_id(unit_name),
        #     )
        # )

        self.profile.sample_type.append(
            ValueType(
                type=self._get_string_map_id("samples"),
                unit=self._get_string_map_id("count"),
            )
        )

        self.profile.default_sample_type = self._get_string_map_id("samples")

        self.profile.mapping = []

        stack_frames = TimelineConverter().convert(node)
        print("Converting from timeline to pprof format...")

        for frame in stack_frames:
            location_id_stack = []

            for key in frame.location_stack:
                location_id_stack.append(self._get_location_id(key))
                if key not in self.location_map:
                    self._get_location(key)
                    self._get_function(key)

            sample = Sample(location_id=location_id_stack, value=[1])
            self.profile.sample.append(sample)

        self._check_validity()

        print("Done")
        return self.profile

    def _check_validity(self):
        """Check for validity."""
        for key, lid in self.location_id_map.items():
            if not self.location_map.get(lid):
                raise RuntimeError(
                    f"{key}, {lid} missing from location_map {self.location_map}"
                )
            if not self.function_map.get(lid):
                raise RuntimeError(
                    f"{key}, {lid} missing from function_map {self.function_map}"
                )
            assert self.profile.location[lid - 1], key
            assert self.profile.function[lid - 1], key

        for key, sid in self.string_map.items():
            assert (
                self.profile.string_table[sid] == key
            ), f"{key} {self.profile.string_table[sid]}"

        return self.profile

    def _recurse_add_node(self, node: ProfilingNode, sample: Optional[Sample] = None):
        lid = self._get_location_id(node.key)
        loc = self._get_location(node.key)
        self._get_function(node.key)

        # If no sample exists, bootstrap the first sample
        if not sample:
            sample = Sample(location_id=[loc.id], value=[ms_to_ns(node.self_cost()), 1])
            self.profile.sample.append(sample)
        else:
            sample.location_id.insert(0, lid)

        for child in node.children:
            # For each child, prepend the stack and the cost of the child
            child_sample = Sample(
                location_id=[] + sample.location_id,
                value=[ms_to_ns(child.self_cost()), 1],
            )
            self.profile.sample.append(sample)
            self._recurse_add_node(child, child_sample)

        return self.profile

    def _get_location(self, key: str) -> Location:
        lid = self._get_location_id(key)
        loc = self.location_map.get(lid)
        if not loc:
            line = Line(
                function_id=lid,
                line=1,
                column=1,
            )
            # Create a new location
            loc = Location(id=lid, address=1, mapping_id=lid, line=[line])
            self.location_map[lid] = loc
            self.profile.location.append(loc)

            mapping = Mapping(id=lid, filename=self._get_string_map_id("main.ts"))
            self.profile.mapping.append(mapping)
        return loc

    def _get_function(self, key: str) -> Function:
        lid = self._get_location_id(key)
        func = self.function_map.get(lid)
        if not func:
            func = Function(
                id=lid,
                name=self._get_string_map_id(key),
                system_name=self._get_string_map_id(key),
                filename=self._get_string_map_id("main.ts"),
                start_line=1,
            )
            self.function_map[lid] = func
            self.profile.function.append(func)
        return func

    def _get_location_id(self, key: str):
        """Get the GID of a function from the pprof function table.

        If the key doesn't exist in the table it will be added.
        """
        lid = self.location_id_map.get(key)
        if lid is None:
            lid = self.next_location_id
            self.next_location_id += 1
            self.location_id_map[key] = lid
        return lid

    def _get_string_map_id(self, key: str):
        """Get the ID of a string from the pprof string table.

        If the key doesn't exist in the table it will be added.
        Keep a parallel copy of the pprof string table as a map, to make it
        easier to decide if we need to add a new key or not.
        """
        key_id = self.string_map.get(key)
        if key_id is None:
            key_id = len(self.profile.string_table)
            self.string_map[key] = key_id
            self.profile.string_table.append(key)
        return key_id


if __name__ == "__main__":
    profile = Profile()
    with open("debug/example_cpu.prof", "rb") as example_fh:
        profile = profile.parse(example_fh.read())

    with open("debug/example_cpu.prof.json", "w") as fh:
        fh.write(profile.to_json(indent=2))

    pserver_profile = Profile()
    with open("debug/pserver.prof", "rb") as example_fh:
        pserver_profile = pserver_profile.parse(example_fh.read())

    with open("debug/pserver.prof.json", "w") as fh:
        fh.write(pserver_profile.to_json(indent=2))
