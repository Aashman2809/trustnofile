#!/usr/bin/env python3
"""Trusted AWS Batch supervisor. The untrusted ELF is always a dropped-privilege child."""
import ctypes
import json
import os
import resource
import signal
import subprocess
import tempfile
import time
import urllib.request

MAX_INPUT = 48 * 1024 * 1024
MAX_OUTPUT = 128 * 1024
input_url = os.environ.pop("TNF_INPUT_URL")
result_url = os.environ.pop("TNF_RESULT_URL")
timeout_ms = max(1000, min(int(os.environ.pop("TNF_EXECUTION_TIMEOUT_MS", "30000")), 60000))
job_id = os.environ.pop("TNF_JOB_ID", "")
events = []

def result(status, exit_code=None, stdout="", stderr="", detail=None):
    body = {"status": status, "message": detail, "behavioralEvidence": {
        "events": events[:100], "exitCode": exit_code,
        "stdout": stdout[:2000], "stderr": stderr[:2000]}, "logs": [], "artifacts": []}
    data = json.dumps(body, separators=(",", ":")).encode()
    request = urllib.request.Request(result_url, data=data, method="PUT", headers={
        "Content-Type": "application/json", "x-amz-server-side-encryption": "AES256"})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status not in (200, 201):
            raise RuntimeError("Could not persist sandbox result")

def limit_child():
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    resource.setrlimit(resource.RLIMIT_AS, (192 * 1024 * 1024, 192 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
    os.setgroups([])
    os.setgid(65534)
    os.setuid(65534)
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError(ctypes.get_errno(), "PR_SET_NO_NEW_PRIVS failed")

try:
    with tempfile.TemporaryDirectory(prefix="tnf-batch-") as work:
        payload = os.path.join(work, "payload.bin")
        request = urllib.request.Request(input_url)
        with urllib.request.urlopen(request, timeout=30) as response, open(payload, "xb") as target:
            size = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_INPUT:
                    raise ValueError("input too large")
                target.write(chunk)
        os.chmod(work, 0o755)
        os.chmod(payload, 0o555)
        with open(payload, "rb") as source:
            if source.read(4) != b"\x7fELF":
                raise ValueError("input is not ELF")
        events.append({"type": "process_created", "detail": "ELF entrypoint started in isolated Batch task"})
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            child = subprocess.Popen([payload], cwd=work, stdin=subprocess.DEVNULL,
                stdout=out, stderr=err, env={"PATH": "/usr/bin:/bin", "HOME": "/tmp"},
                preexec_fn=limit_child, start_new_session=True)
            try:
                code = child.wait(timeout=timeout_ms / 1000)
                state = "completed"
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
                code, state = 124, "timeout"
                events.append({"type": "execution_error", "detail": "Runner execution timed out"})
            out.seek(0); stdout = out.read(MAX_OUTPUT).decode("utf-8", "replace")
            err.seek(0); stderr = err.read(MAX_OUTPUT).decode("utf-8", "replace")
        result(state, code, stdout, stderr)
except Exception as error:
    try:
        events.append({"type": "execution_error", "detail": str(error)[:300]})
        result("failed", 1, detail="The isolated Batch sandbox job failed.")
    except Exception:
        raise
