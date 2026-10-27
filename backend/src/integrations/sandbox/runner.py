#!/usr/bin/env python3
import json
import os
import resource
import signal
import subprocess
import tempfile

events = []
path = "/input/payload.bin"

# Applies resource limits to the sandbox process.
def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
    resource.setrlimit(resource.RLIMIT_AS, (192 * 1024 * 1024, 192 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))

try:
    with open(path, "rb") as f:
        is_elf = f.read(4) == b"\x7fELF"
    if not is_elf:
        raise RuntimeError("Input is not ELF")
    events.append({"type": "process_created", "detail": "ELF entrypoint started"})
    with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
        child = subprocess.Popen([path], cwd="/tmp", stdin=subprocess.DEVNULL,
                                 stdout=stdout_file, stderr=stderr_file,
                                 env={"PATH": "/usr/bin:/bin", "HOME": "/tmp"},
                                 preexec_fn=limits, start_new_session=True)
        try:
            exit_code = child.wait(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            exit_code = 124
            events.append({"type": "execution_error", "detail": "Runner execution timed out"})

        stdout_file.seek(0); stdout = stdout_file.read(2000).decode("utf-8", "replace")
        stderr_file.seek(0); stderr = stderr_file.read(2000).decode("utf-8", "replace")
except Exception as exc:
    exit_code = 1
    events.append({"type": "execution_error", "detail": str(exc)[:300]})

print(json.dumps({"events": events[:100], "exitCode": exit_code,
                  "stdout": locals().get("stdout", ""), "stderr": locals().get("stderr", "")}, separators=(",", ":")))
