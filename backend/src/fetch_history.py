import json
import os

from src.config import AppConfig, load_config
import screepsapi


def fetch_history(cfg: AppConfig, server_name: str):
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
    if not resp or not resp["ok"]:
        raise ValueError("Failed to fetch history: {}".format(resp))

    return resp


if __name__ == "__main__":
    cfg = load_config()
    print(json.dumps(fetch_history(cfg, "pserver"), indent=4))
