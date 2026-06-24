use serde::Deserialize;
use serde::Serialize;
use serde_json::Value as JsonValue;
use std::collections::VecDeque;
use std::env;
use std::fs;
use std::io;
use std::io::BufRead;
use std::io::BufReader;
use std::io::BufWriter;
use std::io::Write;
use std::path::PathBuf;
use std::process::Child;
use std::process::ChildStdin;
use std::process::ChildStdout;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;

const KERNEL_SOURCE: &str =
    include_str!("../assets/kernel.py");
const PY_REPL_MIN_PYTHON_VERSION: &str =
    include_str!("../assets/python-version.txt");
const STDERR_TAIL_LINE_LIMIT: usize = 20;
const STDERR_TAIL_LINE_MAX_BYTES: usize = 512;
const STDERR_TAIL_MAX_BYTES: usize = 4_096;
const STDERR_TAIL_SEPARATOR: &str = " | ";

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ParentMessage {
    Exec {
        id: String,
        code: String,
        #[serde(default)]
        timeout_ms: Option<u64>,
    },
    RunToolResult {
        #[serde(rename = "id")]
        _id: String,
        #[serde(rename = "ok")]
        _ok: bool,
        #[serde(default)]
        #[serde(rename = "response")]
        _response: Option<JsonValue>,
        #[serde(default)]
        #[serde(rename = "error")]
        _error: Option<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum HostMessage<'a> {
    ExecResult {
        id: &'a str,
        ok: bool,
        output: &'a str,
        error: Option<&'a str>,
    },
}

struct KernelProcess {
    _child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut input = stdin.lock().lines();
    let mut output = BufWriter::new(stdout.lock());
    let mut kernel: Option<KernelProcess> = None;

    while let Some(line) = next_nonempty_line(&mut input)? {
        let message = match serde_json::from_str::<ParentMessage>(&line) {
            Ok(message) => message,
            Err(_) => continue,
        };

        match message {
            ParentMessage::Exec {
                id,
                code,
                timeout_ms,
            } => {
                if kernel.is_none() {
                    kernel = Some(spawn_kernel()?);
                }

                let result = relay_exec(
                    &id,
                    &code,
                    timeout_ms,
                    kernel.as_mut().expect("kernel initialized"),
                    &mut input,
                    &mut output,
                );

                if let Err(error) = result {
                    write_exec_result(&mut output, &id, false, "", Some(&error))?;
                    kernel = None;
                }
            }
            ParentMessage::RunToolResult { .. } => {
                // Ignored outside an active exec loop.
            }
        }
    }

    Ok(())
}

fn next_nonempty_line<I>(input: &mut I) -> io::Result<Option<String>>
where
    I: Iterator<Item = io::Result<String>>,
{
    for line in input {
        let line = line?;
        if !line.trim().is_empty() {
            return Ok(Some(line));
        }
    }
    Ok(None)
}

fn relay_exec<I, W>(
    exec_id: &str,
    code: &str,
    timeout_ms: Option<u64>,
    kernel: &mut KernelProcess,
    parent_input: &mut I,
    parent_output: &mut W,
) -> Result<(), String>
where
    I: Iterator<Item = io::Result<String>>,
    W: Write,
{
    let exec_message = serde_json::json!({
        "type": "exec",
        "id": exec_id,
        "code": code,
        "timeout_ms": timeout_ms,
    });
    write_json_line(&mut kernel.stdin, &exec_message).map_err(|err| err.to_string())?;

    loop {
        let mut line = String::new();
        let bytes_read = kernel
            .stdout
            .read_line(&mut line)
            .map_err(|err| err.to_string())?;

        if bytes_read == 0 {
            return Err(format!(
                "py_repl rust host lost the Python kernel: {}",
                format_stderr_tail(&kernel.stderr_tail)
            ));
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let message_type = extract_type(trimmed);
        match message_type.as_deref() {
            Some("run_tool") => {
                parent_output
                    .write_all(trimmed.as_bytes())
                    .and_then(|_| parent_output.write_all(b"\n"))
                    .and_then(|_| parent_output.flush())
                    .map_err(|err| err.to_string())?;

                let response = wait_for_parent_run_tool_result(parent_input)?;
                write_json_line(&mut kernel.stdin, &response).map_err(|err| err.to_string())?;
            }
            Some("exec_result") => {
                parent_output
                    .write_all(trimmed.as_bytes())
                    .and_then(|_| parent_output.write_all(b"\n"))
                    .and_then(|_| parent_output.flush())
                    .map_err(|err| err.to_string())?;
                return Ok(());
            }
            _ => {}
        }
    }
}

fn wait_for_parent_run_tool_result<I>(parent_input: &mut I) -> Result<JsonValue, String>
where
    I: Iterator<Item = io::Result<String>>,
{
    loop {
        let line = next_nonempty_line(parent_input).map_err(|err| err.to_string())?;
        let Some(line) = line else {
            return Err("py_repl rust host lost its parent while waiting for run_tool_result".to_string());
        };

        let value = serde_json::from_str::<JsonValue>(&line).map_err(|err| err.to_string())?;
        if extract_type_from_value(&value).as_deref() == Some("run_tool_result") {
            return Ok(value);
        }
    }
}

fn extract_type(line: &str) -> Option<String> {
    serde_json::from_str::<JsonValue>(line)
        .ok()
        .and_then(|value| extract_type_from_value(&value))
}

fn extract_type_from_value(value: &JsonValue) -> Option<String> {
    value
        .get("type")
        .and_then(JsonValue::as_str)
        .map(str::to_owned)
}

fn write_exec_result<W: Write>(
    writer: &mut W,
    id: &str,
    ok: bool,
    output: &str,
    error: Option<&str>,
) -> io::Result<()> {
    let message = HostMessage::ExecResult {
        id,
        ok,
        output,
        error,
    };
    write_json_line(writer, &message)
}

fn write_json_line<W: Write, T: Serialize>(writer: &mut W, value: &T) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, value)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

fn spawn_kernel() -> io::Result<KernelProcess> {
    let python = resolve_python_executable()?;
    let kernel_dir = create_kernel_runtime_dir()?;
    let kernel_path = kernel_dir.join("kernel.py");
    fs::write(&kernel_path, KERNEL_SOURCE)?;

    let mut command = Command::new(python);
    command.arg(&kernel_path);
    command.current_dir(env::current_dir()?);
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.env(
      "CODEX_PY_TMP_DIR",
      env::temp_dir().to_string_lossy().to_string(),
    );
    if let Some(module_dirs) = resolve_python_module_dirs() {
        command.env("CODEX_PY_REPL_PYTHON_MODULE_DIRS", module_dirs);
    }

    let mut child = command.spawn()?;
    let child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "missing py_repl stdin"))?;
    let child_stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "missing py_repl stdout"))?;
    let child_stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "missing py_repl stderr"))?;

    let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));
    let stderr_tail_writer = Arc::clone(&stderr_tail);
    std::thread::spawn(move || {
        let reader = BufReader::new(child_stderr);
        for line in reader.lines() {
            let Ok(line) = line else {
                break;
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(mut tail) = stderr_tail_writer.lock() {
                push_stderr_tail_line(&mut tail, trimmed);
            }
        }
    });

    Ok(KernelProcess {
        _child: child,
        stdin: BufWriter::new(child_stdin),
        stdout: BufReader::new(child_stdout),
        stderr_tail,
    })
}

fn resolve_python_module_dirs() -> Option<String> {
    env::var("NCODE_PY_REPL_PYTHON_MODULE_DIRS")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            env::var("CLAUDE_CODE_PY_REPL_PYTHON_MODULE_DIRS")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
}

fn resolve_python_executable() -> io::Result<String> {
    let explicit = env::var("NCODE_PY_REPL_PYTHON_PATH")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            env::var("CLAUDE_CODE_PY_REPL_PYTHON_PATH")
                .ok()
                .filter(|value| !value.trim().is_empty())
        });

    let candidates = if let Some(explicit) = explicit {
        vec![explicit]
    } else {
        vec!["python3".to_string(), "python".to_string()]
    };

    let min_version = parse_python_version(PY_REPL_MIN_PYTHON_VERSION.trim()).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid py_repl minimum Python version",
        )
    })?;

    for candidate in candidates {
        let output = Command::new(&candidate)
            .arg("-c")
            .arg("import sys; print(\".\".join(str(part) for part in sys.version_info[:3]))")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();

        let Ok(output) = output else {
            continue;
        };
        if !output.status.success() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let Some(version) = parse_python_version(stdout.trim()) else {
            continue;
        };

        if compare_version(&version, &min_version) >= 0 {
            return Ok(candidate);
        }
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!(
            "py_repl rust host requires Python {}+",
            PY_REPL_MIN_PYTHON_VERSION.trim()
        ),
    ))
}

fn parse_python_version(input: &str) -> Option<Vec<u32>> {
    let mut parts = Vec::new();
    for segment in input.split('.') {
        let value = segment.trim().parse::<u32>().ok()?;
        parts.push(value);
    }
    if parts.len() < 3 {
        return None;
    }
    Some(parts)
}

fn compare_version(left: &[u32], right: &[u32]) -> i32 {
    let length = left.len().max(right.len());
    for index in 0..length {
        let left_value = *left.get(index).unwrap_or(&0);
        let right_value = *right.get(index).unwrap_or(&0);
        if left_value != right_value {
            return if left_value > right_value { 1 } else { -1 };
        }
    }
    0
}

fn create_kernel_runtime_dir() -> io::Result<PathBuf> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "ncode-py-repl-host-{}-{now}",
        std::process::id()
    ));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn format_stderr_tail(stderr_tail: &Arc<Mutex<VecDeque<String>>>) -> String {
    let Ok(lines) = stderr_tail.lock() else {
        return "<stderr unavailable>".to_string();
    };
    if lines.is_empty() {
        return "<empty>".to_string();
    }
    lines.iter().cloned().collect::<Vec<_>>().join(STDERR_TAIL_SEPARATOR)
}

fn push_stderr_tail_line(lines: &mut VecDeque<String>, line: &str) {
    let bounded_line = truncate_utf8_prefix_by_bytes(
        line,
        STDERR_TAIL_LINE_MAX_BYTES.min(STDERR_TAIL_MAX_BYTES),
    );
    if bounded_line.is_empty() {
        return;
    }

    while !lines.is_empty()
        && (lines.len() >= STDERR_TAIL_LINE_LIMIT
            || stderr_tail_bytes_with_candidate(lines, &bounded_line) > STDERR_TAIL_MAX_BYTES)
    {
        lines.pop_front();
    }

    lines.push_back(bounded_line);
}

fn stderr_tail_formatted_bytes(lines: &VecDeque<String>) -> usize {
    if lines.is_empty() {
        return 0;
    }
    let payload_bytes: usize = lines.iter().map(String::len).sum();
    let separator_bytes = STDERR_TAIL_SEPARATOR.len() * (lines.len() - 1);
    payload_bytes + separator_bytes
}

fn stderr_tail_bytes_with_candidate(lines: &VecDeque<String>, line: &str) -> usize {
    if lines.is_empty() {
        return line.len();
    }
    stderr_tail_formatted_bytes(lines) + STDERR_TAIL_SEPARATOR.len() + line.len()
}

fn truncate_utf8_prefix_by_bytes(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }
    if max_bytes == 0 {
        return String::new();
    }

    let mut end = max_bytes;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    input[..end].to_string()
}

#[cfg(test)]
mod tests {
    use super::compare_version;
    use super::parse_python_version;

    #[test]
    fn parses_python_versions() {
        assert_eq!(parse_python_version("3.10.0"), Some(vec![3, 10, 0]));
        assert_eq!(parse_python_version("3.12.3"), Some(vec![3, 12, 3]));
        assert_eq!(parse_python_version("3.10"), None);
    }

    #[test]
    fn compares_python_versions() {
        assert_eq!(compare_version(&[3, 10, 0], &[3, 10, 0]), 0);
        assert_eq!(compare_version(&[3, 12, 0], &[3, 10, 0]), 1);
        assert_eq!(compare_version(&[3, 9, 9], &[3, 10, 0]), -1);
    }
}
