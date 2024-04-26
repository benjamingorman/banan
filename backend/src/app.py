import json
import io
from typing import List

import pydantic
from fastapi import FastAPI, Response, HTTPException
from fastapi.responses import StreamingResponse

from src.config import load_config
from src.fetch_history import fetch_history, ProfilingNode
from src.pprof_convert import PprofConverter

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

    with open(f"{server_name}.prof", "wb") as fh:
        fh.write(serialized_profile)

    # with open(f"{server_name}.prof.json", "w") as fh:
    #     fh.write(profile.to_json(indent=2))

    print(serialized_profile)
    return StreamingResponse(
        io.BytesIO(serialized_profile), media_type="application/octet-stream"
    )
