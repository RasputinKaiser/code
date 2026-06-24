# Python-based kernel for py_repl.
# Communicates over JSON lines on stdin/stdout.

import ast
import asyncio
import inspect
import io
import json
import os
import sys
import traceback
from types import SimpleNamespace


def _send(message):
    payload = (json.dumps(message) + "\n").encode("utf-8")
    os.write(sys.__stdout__.fileno(), payload)


def _format_error(error):
    if isinstance(error, BaseException):
        text = "".join(traceback.format_exception_only(type(error), error)).strip()
        if text:
            return text
    return str(error)


pending_tool = {}
tool_counter = 0
cell_counter = 0

TMP_DIR = os.environ.get("NCODE_PY_TMP_DIR", os.getcwd())
module_dirs_env = os.environ.get("NCODE_PY_REPL_PYTHON_MODULE_DIRS", "")
for entry in module_dirs_env.split(os.pathsep):
    value = entry.strip()
    if not value:
        continue
    path = value if os.path.isabs(value) else os.path.abspath(value)
    if path not in sys.path:
        sys.path.insert(0, path)

state_globals = {
    "__name__": "__main__",
    "__package__": None,
}


async def _run_tool(exec_id, tool_name, args):
    global tool_counter

    if not isinstance(tool_name, str) or not tool_name:
        raise RuntimeError("codex.tool expects a tool name string")

    tool_id = f"{exec_id}-tool-{tool_counter}"
    tool_counter += 1

    arguments_json = "{}"
    if isinstance(args, str):
        arguments_json = args
    elif args is not None:
        arguments_json = json.dumps(args)

    loop = asyncio.get_running_loop()
    future = loop.create_future()
    pending_tool[tool_id] = future

    _send(
        {
            "type": "run_tool",
            "id": tool_id,
            "exec_id": exec_id,
            "tool_name": tool_name,
            "arguments": arguments_json,
        }
    )

    result = await future
    if not result.get("ok"):
        raise RuntimeError(result.get("error") or "tool failed")
    return result.get("response")


async def _handle_exec(message):
    global cell_counter

    exec_id = message.get("id")
    code = message.get("code")
    if not isinstance(exec_id, str) or not isinstance(code, str):
        return

    async def _tool(name, args=None):
        return await _run_tool(exec_id, name, args)

    state_globals["codex"] = SimpleNamespace(tmpDir=TMP_DIR, tool=_tool)
    state_globals["tmpDir"] = TMP_DIR

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = stdout_buf
    sys.stderr = stderr_buf

    try:
        filename = f"<cell-{cell_counter}>"
        cell_counter += 1
        flags = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT
        code_obj = compile(code, filename, "exec", flags=flags, dont_inherit=True)
        result = eval(code_obj, state_globals, state_globals)
        if inspect.isawaitable(result):
            await result

        output = stdout_buf.getvalue().rstrip()
        stderr_output = stderr_buf.getvalue().rstrip()
        if output and stderr_output:
            output = f"{output}\n{stderr_output}"
        elif not output:
            output = stderr_output

        _send(
            {
                "type": "exec_result",
                "id": exec_id,
                "ok": True,
                "output": output,
                "error": None,
            }
        )
    except BaseException as error:
        _send(
            {
                "type": "exec_result",
                "id": exec_id,
                "ok": False,
                "output": "",
                "error": _format_error(error),
            }
        )
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr


async def _read_stdin(exec_queue):
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if line == "":
            await exec_queue.put(None)
            return

        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except Exception:
            continue

        msg_type = message.get("type")
        if msg_type == "exec":
            await exec_queue.put(message)
        elif msg_type == "run_tool_result":
            tool_id = message.get("id")
            future = pending_tool.pop(tool_id, None)
            if future and not future.done():
                future.set_result(message)


async def _main():
    exec_queue = asyncio.Queue()
    reader = asyncio.create_task(_read_stdin(exec_queue))
    try:
        while True:
            message = await exec_queue.get()
            if message is None:
                return
            await _handle_exec(message)
    finally:
        reader.cancel()


if __name__ == "__main__":
    asyncio.run(_main())
