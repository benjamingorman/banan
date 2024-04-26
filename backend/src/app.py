import json
import io
from typing import List

import pydantic
from fastapi import FastAPI, Response, HTTPException
from fastapi.responses import StreamingResponse

from src.config import load_config
from src.fetch_history import fetch_history, ProfilingNode
from src.pprof_convert import PprofConverter
from src.protogen.orig import pprof_pb2

app = FastAPI()
config = load_config()


class ApiHistoryResponse(pydantic.BaseModel):
    history: List[ProfilingNode]


@app.get("/")
async def root():
    return "Hello World"


@app.get("/api/history/{server_name}")
async def get_history(server_name: str, response: Response) -> ApiHistoryResponse:
    """Fetch profiling history from screeps and return in Banan format"""
    response.headers["Cache-Control"] = "max-age: 0"

    try:
        history = fetch_history(config, server_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    with open("parsed.json", "w") as fh:
        fh.write(json.dumps([node.model_dump(exclude_unset=True) for node in history]))

    history.sort(key=lambda node: node.key)
    return ApiHistoryResponse(history=history)


@app.get("/api/history_pprof/{server_name}")
async def get_history_pprof(server_name: str, response: Response):
    """Fetch profiling history from screeps and convert to pprof format.

    This allows for other standard profiling tools to inspect the dump.
    Could be useful for upload to Pyroscope for example.
    """
    response.headers["Cache-Control"] = "max-age: 0"

    try:
        history = fetch_history(config, server_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    example_node = history[0]

    profile = PprofConverter().convert_to_pprof_format(example_node)
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

    with open(f"{server_name}.prof", "wb") as fh:
        fh.write(serialized_patched)

    return StreamingResponse(
        io.BytesIO(serialized_patched), media_type="application/octet-stream"
    )
