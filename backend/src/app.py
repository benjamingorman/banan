import json

from fastapi import FastAPI, Response

from src.config import load_config
from src.fetch_history import fetch_history

app = FastAPI()
config = load_config()


@app.get("/")
async def root():
    return "Hello World"

@app.get("/api/history/{server_name}")
async def get_history(server_name: str, response: Response):
    response.headers["Cache-Control"] = "max-age: 0"

    try:
        history = fetch_history(config, server_name)
        print("history", json.dumps(history)[:100], "...")
    except Exception as e:
        return {"error": str(e)}

    data = [node for node in history.get("data", []) if node]
    with open("dump.json", "w") as fh:
        fh.write(json.dumps(data))
    print("data", json.dumps(data)[:100], "...")
    return {"history": sorted(data, key=lambda node: node["key"])}
