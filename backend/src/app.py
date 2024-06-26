import io
import json
import logging
import math
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import List, Set

import pydantic
import requests
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse

from src.config import DEBUG_DIR, DEBUG_ENABLED, PYROSCOPE_URL, load_config
from src.fetch_history import ProfilingNode, fetch_history
from src.pprof_convert import PprofConverter, ms_to_ns


if DEBUG_ENABLED:
    os.makedirs(DEBUG_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_schedules()
    yield


logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
stream_handler = logging.StreamHandler(sys.stdout)
log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
stream_handler.setFormatter(log_formatter)
logger.addHandler(stream_handler)

app = FastAPI(lifespan=lifespan)
config = load_config()

# Avoid uploading to Pyroscope for ticks we've already sent
pyroscope_sent_ticks: Set[str] = set()


class ApiHistoryResponse(pydantic.BaseModel):
    history: List[ProfilingNode]


def init_schedules():
    """Setup a schedule to periodically push to Pyroscope."""
    logger.info("Initializing schedules")
    scheduler = BackgroundScheduler()
    scheduler.add_job(scrape_all_and_push_to_pyroscope, "cron", second="*/30")
    scheduler.start()


def scrape_all_and_push_to_pyroscope():
    """Push profiling data to pyroscope from every screeps server we can."""
    logger.info("Pushing to pyroscope...")

    for server_cfg in config.servers:
        logger.info("Loading data from server %s", server_cfg.name)

        history = []
        try:
            history = fetch_history(config, server_cfg.name)
        except Exception:
            logger.exception(f"Error fetching history for: {server_cfg.name}")

        for tick in history:
            tick_str = f"{server_cfg.name}:{tick.key}"

            if tick_str in pyroscope_sent_ticks:
                logger.info("Already sent tick %s", tick_str)
                continue

            try:
                push_single_tick_to_pyroscope(server_cfg.name, tick)
                pyroscope_sent_ticks.add(tick_str)
            except Exception:
                logger.exception(
                    f"Error pushing tick to Pyroscope for: {server_cfg.name}"
                )


def push_single_tick_to_pyroscope(server_name: str, tick: ProfilingNode):
    """Push a single tick of profiling data to Pyroscope.

    See https://grafana.com/docs/pyroscope/latest/configure-server/about-server-api/
    """
    pprof_bytes = PprofConverter().convert_to_pprof_bytes(tick)

    if DEBUG_ENABLED:
        with open(f"{DEBUG_DIR}/{server_name}.prof", "wb") as fh:
            fh.write(pprof_bytes)

    if not tick.timestamp:
        raise ValueError("Expecting to find a timestamp on tick")

    # TODO actual timestamp from dump
    app_name = f"screeps-{server_name}"
    from_time = ms_to_ns(tick.timestamp)
    until_time = ms_to_ns(tick.timestamp) + ms_to_ns(tick.cpu)

    url_params = {
        "name": app_name,
        "format": "pprof",
        "from": from_time,
        "until": until_time,
    }

    resp = requests.post(PYROSCOPE_URL + "/ingest", params=url_params, data=pprof_bytes)
    resp.raise_for_status()

    logger.info("Successfully sent {}:{} to Pyroscope".format(app_name, tick.key))
    logger.info(
        "tick_duration_ms: {}, from: {}, until: {}".format(
            tick.cpu, from_time, until_time
        )
    )


@app.get("/api/history/{server_name}")
async def get_history(server_name: str, response: Response) -> ApiHistoryResponse:
    """Fetch profiling history from screeps and return in Banan format"""
    response.headers["Cache-Control"] = "max-age: 0"

    try:
        history = fetch_history(config, server_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    with open(f"{DEBUG_DIR}/parsed.json", "w") as fh:
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
        pprof_bytes = get_screeps_profile_pprof_bytes(server_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        io.BytesIO(pprof_bytes), media_type="application/octet-stream"
    )


def get_screeps_profile_pprof_bytes(server_name: str) -> bytes:
    """Fetch banan history for the given server and return pprof bytestring."""
    history = fetch_history(config, server_name)
    example_node = history[0]
    pprof_bytes = PprofConverter().convert_to_pprof_bytes(example_node)
    return pprof_bytes
