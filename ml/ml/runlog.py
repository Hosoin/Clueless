"""실험 기록: 학습 스크립트가 끝날 때 한 줄씩 out/runs.jsonl 에 남긴다 (언제·어느 코드·어떤 설정·어떤 결과).
shortcut: 로컬 파일 기록. Azure ML로 옮기면 MLflow(mlflow.log_params / log_metrics)로 바꾼다.
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path

LOG = Path("out/runs.jsonl")


def git_commit() -> str:
    try:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "."], capture_output=True, text=True).stdout.strip()
        return sha + ("+수정중" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def log_run(task: str, params: dict, metrics: dict) -> None:
    LOG.parent.mkdir(exist_ok=True)
    row = {"time": datetime.now().isoformat(timespec="seconds"), "task": task, "commit": git_commit(), "params": params, "metrics": metrics}
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
