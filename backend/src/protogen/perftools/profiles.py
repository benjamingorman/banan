# Generated by the protocol buffer compiler.  DO NOT EDIT!
# sources: src/protobuf/pprof.proto
# plugin: python-betterproto
from dataclasses import dataclass
from typing import List

import betterproto


@dataclass
class Profile(betterproto.Message):
    # A description of the samples associated with each Sample.value. For a cpu
    # profile this might be:   [["cpu","nanoseconds"]] or [["wall","seconds"]] or
    # [["syscall","count"]] For a heap profile, this might be:
    # [["allocations","count"], ["space","bytes"]], If one of the values
    # represents the number of events represented by the sample, by convention it
    # should be at index 0 and use sample_type.unit == "count".
    sample_type: List["ValueType"] = betterproto.message_field(1)
    # The set of samples recorded in this profile.
    sample: List["Sample"] = betterproto.message_field(2)
    # Mapping from address ranges to the image/binary/library mapped into that
    # address range.  mapping[0] will be the main binary.
    mapping: List["Mapping"] = betterproto.message_field(3)
    # Locations referenced by samples.
    location: List["Location"] = betterproto.message_field(4)
    # Functions referenced by locations.
    function: List["Function"] = betterproto.message_field(5)
    # A common table for strings referenced by various messages. string_table[0]
    # must always be "".
    string_table: List[str] = betterproto.string_field(6)
    # frames with Function.function_name fully matching the following regexp will
    # be dropped from the samples, along with their successors.
    drop_frames: int = betterproto.int64_field(7)
    # frames with Function.function_name fully matching the following regexp will
    # be kept, even if it matches drop_frames.
    keep_frames: int = betterproto.int64_field(8)
    # Time of collection (UTC) represented as nanoseconds past the epoch.
    time_nanos: int = betterproto.int64_field(9)
    # Duration of the profile, if a duration makes sense.
    duration_nanos: int = betterproto.int64_field(10)
    # The kind of events between sampled occurrences. e.g [ "cpu","cycles" ] or [
    # "heap","bytes" ]
    period_type: "ValueType" = betterproto.message_field(11)
    # The number of events between sampled occurrences.
    period: int = betterproto.int64_field(12)
    # Free-form text associated with the profile. The text is displayed as is to
    # the user by the tools that read profiles (e.g. by pprof). This field should
    # not be used to store any machine-readable information, it is only for
    # human-friendly content. The profile must stay functional if this field is
    # cleaned.
    comment: List[int] = betterproto.int64_field(13)
    # Index into the string table of the type of the preferred sample value. If
    # unset, clients should default to the last sample value.
    default_sample_type: int = betterproto.int64_field(14)


@dataclass
class ValueType(betterproto.Message):
    """ValueType describes the semantics and measurement units of a value."""

    type: int = betterproto.int64_field(1)
    unit: int = betterproto.int64_field(2)


@dataclass
class Sample(betterproto.Message):
    """
    Each Sample records values encountered in some program context. The program
    context is typically a stack trace, perhaps augmented with auxiliary
    information like the thread-id, some indicator of a higher level request
    being handled etc.
    """

    # The ids recorded here correspond to a Profile.location.id. The leaf is at
    # location_id[0].
    location_id: List[int] = betterproto.uint64_field(1)
    # The type and unit of each value is defined by the corresponding entry in
    # Profile.sample_type. All samples must have the same number of values, the
    # same as the length of Profile.sample_type. When aggregating multiple
    # samples into a single sample, the result has a list of values that is the
    # element-wise sum of the lists of the originals.
    value: List[int] = betterproto.int64_field(2)
    # label includes additional context for this sample. It can include things
    # like a thread id, allocation size, etc. NOTE: While possible, having
    # multiple values for the same label key is strongly discouraged and should
    # never be used. Most tools (e.g. pprof) do not have good (or any) support
    # for multi-value labels. And an even more discouraged case is having a
    # string label and a numeric label of the same name on a sample.  Again,
    # possible to express, but should not be used.
    label: List["Label"] = betterproto.message_field(3)


@dataclass
class Label(betterproto.Message):
    # Index into string table. An annotation for a sample (e.g.
    # "allocation_size") with an associated value. Keys with "pprof::" prefix are
    # reserved for internal use by pprof.
    key: int = betterproto.int64_field(1)
    # At most one of the following must be present
    str: int = betterproto.int64_field(2)
    num: int = betterproto.int64_field(3)
    # Should only be present when num is present. Specifies the units of num. Use
    # arbitrary string (for example, "requests") as a custom count unit. If no
    # unit is specified, consumer may apply heuristic to deduce the unit.
    # Consumers may also  interpret units like "bytes" and "kilobytes" as memory
    # units and units like "seconds" and "nanoseconds" as time units, and apply
    # appropriate unit conversions to these.
    num_unit: int = betterproto.int64_field(4)


@dataclass
class Mapping(betterproto.Message):
    # Unique nonzero id for the mapping.
    id: int = betterproto.uint64_field(1)
    # Address at which the binary (or DLL) is loaded into memory.
    memory_start: int = betterproto.uint64_field(2)
    # The limit of the address range occupied by this mapping.
    memory_limit: int = betterproto.uint64_field(3)
    # Offset in the binary that corresponds to the first mapped address.
    file_offset: int = betterproto.uint64_field(4)
    # The object this entry is loaded from.  This can be a filename on disk for
    # the main binary and shared libraries, or virtual abstractions like
    # "[vdso]".
    filename: int = betterproto.int64_field(5)
    # A string that uniquely identifies a particular program version with high
    # probability. E.g., for binaries generated by GNU tools, it could be the
    # contents of the .note.gnu.build-id field.
    build_id: int = betterproto.int64_field(6)
    # The following fields indicate the resolution of symbolic info.
    has_functions: bool = betterproto.bool_field(7)
    has_filenames: bool = betterproto.bool_field(8)
    has_line_numbers: bool = betterproto.bool_field(9)
    has_inline_frames: bool = betterproto.bool_field(10)


@dataclass
class Location(betterproto.Message):
    """Describes function and line table debug information."""

    # Unique nonzero id for the location.  A profile could use instruction
    # addresses or any integer sequence as ids.
    id: int = betterproto.uint64_field(1)
    # The id of the corresponding profile.Mapping for this location. It can be
    # unset if the mapping is unknown or not applicable for this profile type.
    mapping_id: int = betterproto.uint64_field(2)
    # The instruction address for this location, if available.  It should be
    # within [Mapping.memory_start...Mapping.memory_limit] for the corresponding
    # mapping. A non-leaf address may be in the middle of a call instruction. It
    # is up to display tools to find the beginning of the instruction if
    # necessary.
    address: int = betterproto.uint64_field(3)
    # Multiple line indicates this location has inlined functions, where the last
    # entry represents the caller into which the preceding entries were inlined.
    # E.g., if memcpy() is inlined into printf:    line[0].function_name ==
    # "memcpy"    line[1].function_name == "printf"
    line: List["Line"] = betterproto.message_field(4)
    # Provides an indication that multiple symbols map to this location's
    # address, for example due to identical code folding by the linker. In that
    # case the line information above represents one of the multiple symbols.
    # This field must be recomputed when the symbolization state of the profile
    # changes.
    is_folded: bool = betterproto.bool_field(5)


@dataclass
class Line(betterproto.Message):
    # The id of the corresponding profile.Function for this line.
    function_id: int = betterproto.uint64_field(1)
    # Line number in source code.
    line: int = betterproto.int64_field(2)
    # Column number in source code.
    column: int = betterproto.int64_field(3)


@dataclass
class Function(betterproto.Message):
    # Unique nonzero id for the function.
    id: int = betterproto.uint64_field(1)
    # Name of the function, in human-readable form if available.
    name: int = betterproto.int64_field(2)
    # Name of the function, as identified by the system. For instance, it can be
    # a C++ mangled name.
    system_name: int = betterproto.int64_field(3)
    # Source file containing the function.
    filename: int = betterproto.int64_field(4)
    # Line number in source file.
    start_line: int = betterproto.int64_field(5)
