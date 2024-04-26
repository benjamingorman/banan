import json
from typing import Optional, List

import pydantic
from fastapi import FastAPI, Response

from src.config import load_config
from src.fetch_history import fetch_history, ProfilingNode

app = FastAPI()
config = load_config()


class ApiHistoryResponse(pydantic.BaseModel):
    history: Optional[List[ProfilingNode]] = None
    error: Optional[str] = None


@app.get("/")
async def root():
    return "Hello World"

@app.get("/api/history/{server_name}")
async def get_history(server_name: str, response: Response) -> ApiHistoryResponse:
    response.headers["Cache-Control"] = "max-age: 0"

    try:
        history = fetch_history(config, server_name)
    except Exception as e:
        return ApiHistoryResponse(error=str(e))

    with open("parsed.json", "w") as fh:
        fh.write(json.dumps([node.model_dump(exclude_unset=True) for node in history]))

    history.sort(key=lambda node: node.key)
    return ApiHistoryResponse(history=history)
