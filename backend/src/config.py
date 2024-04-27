"""Configuration file parsing and validation."""

import os
from typing import List, Optional

from pydantic import BaseModel
from pydantic_yaml import parse_yaml_raw_as

DEBUG_ENABLED = os.getenv("DEBUG")
DEBUG_DIR = "debug"
PYROSCOPE_URL = os.getenv("PYROSCOPE_URL", "http://pyroscope:4040")
CONFIG_FILE_NAME = "secrets.yml"


class ServerConfig(BaseModel):
    name: str
    host: str
    token: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    shard: str = "shard0"
    secure: bool = False


class AppConfig(BaseModel):
    servers: List[ServerConfig]
    banan_history_key: str

    def get_server_cfg(self, name: str) -> Optional[ServerConfig]:
        """Get a server configuration by name."""
        for server_cfg in self.servers:
            if server_cfg.name == name:
                return server_cfg
        return None


def load_config(cfg_file=CONFIG_FILE_NAME) -> AppConfig:
    with open(cfg_file, "r") as cfg_fh:
        return parse_yaml_raw_as(AppConfig, cfg_fh.read())
