use futures_util::{SinkExt, StreamExt};
use napi::Result;
use napi_derive::napi;
use once_cell::sync::Lazy;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc, time::Instant};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig, Message},
};
use url::Url;
use uuid::Uuid;

type SessionMap = HashMap<String, Arc<Session>>;
type WsCommandResult = std::result::Result<(), String>;

static SESSIONS: Lazy<Mutex<SessionMap>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const INITIALIZE_TIMEOUT: Duration = Duration::from_secs(10);
const CLOSE_PEER_REPLY_TIMEOUT: Duration = Duration::from_millis(500);
const MAX_WEBSOCKET_MESSAGE_SIZE: usize = 128 << 20;
const DEFAULT_PING_INTERVAL: Duration = Duration::from_secs(30);
const DEFAULT_PING_TIMEOUT: Duration = Duration::from_secs(90);
const DEFAULT_READ_TIMEOUT: Duration = Duration::from_secs(35 * 60);
const PING_PAYLOAD: &[u8] = b"ncode";

enum WsCommand {
    Send {
        message: Message,
        tx_result: oneshot::Sender<WsCommandResult>,
    },
    Close {
        tx_result: oneshot::Sender<WsCommandResult>,
    },
}

struct Session {
    tx: mpsc::Sender<WsCommand>,
    rx: Mutex<mpsc::Receiver<String>>,
    close_reason: Arc<Mutex<Option<String>>>,
    read_timeout: Duration,
}

fn napi_error(message: impl Into<String>) -> napi::Error {
    napi::Error::from_reason(message.into())
}

fn ws_url_from_base(raw: &str) -> Result<String> {
    let mut url =
        Url::parse(raw).map_err(|err| napi_error(format!("invalid websocket url/base: {err}")))?;
    let scheme = match url.scheme() {
        "https" => "wss".to_string(),
        "http" => "ws".to_string(),
        "ws" | "wss" => url.scheme().to_string(),
        other => {
            return Err(napi_error(format!(
                "unsupported websocket url scheme: {other}"
            )))
        }
    };
    url.set_scheme(&scheme)
        .map_err(|_| napi_error("failed to set websocket scheme"))?;
    Ok(url.to_string())
}

fn apply_headers(request: &mut http::Request<()>, headers_json: Option<String>) -> Result<()> {
    let Some(headers_json) = headers_json else {
        return Ok(());
    };
    if headers_json.trim().is_empty() {
        return Ok(());
    }
    let parsed: Value = serde_json::from_str(&headers_json)
        .map_err(|err| napi_error(format!("invalid headers json: {err}")))?;
    let Some(object) = parsed.as_object() else {
        return Err(napi_error("headers json must be an object"));
    };
    for (key, value) in object {
        let Some(value) = value.as_str() else {
            continue;
        };
        let name = http::header::HeaderName::from_bytes(key.as_bytes())
            .map_err(|err| napi_error(format!("invalid header name {key}: {err}")))?;
        let value = http::header::HeaderValue::from_str(value)
            .map_err(|err| napi_error(format!("invalid header value for {key}: {err}")))?;
        request.headers_mut().insert(name, value);
    }
    Ok(())
}

async fn remove_session(session_id: &str) -> Option<Arc<Session>> {
    SESSIONS.lock().await.remove(session_id)
}

fn websocket_config() -> WebSocketConfig {
    WebSocketConfig {
        max_frame_size: Some(MAX_WEBSOCKET_MESSAGE_SIZE),
        max_message_size: Some(MAX_WEBSOCKET_MESSAGE_SIZE),
        ..Default::default()
    }
}

#[derive(Clone, Copy)]
struct WsOptions {
    ping_interval: Duration,
    ping_timeout: Duration,
    read_timeout: Duration,
}

impl Default for WsOptions {
    fn default() -> Self {
        Self {
            ping_interval: DEFAULT_PING_INTERVAL,
            ping_timeout: DEFAULT_PING_TIMEOUT,
            read_timeout: DEFAULT_READ_TIMEOUT,
        }
    }
}

fn duration_from_options_ms(
    options: &Value,
    camel_key: &str,
    snake_key: &str,
    default: Duration,
) -> Duration {
    options
        .get(camel_key)
        .or_else(|| options.get(snake_key))
        .and_then(Value::as_u64)
        .map(Duration::from_millis)
        .filter(|duration| !duration.is_zero())
        .unwrap_or(default)
}

fn parse_options(options_json: Option<String>) -> Result<WsOptions> {
    let Some(options_json) = options_json else {
        return Ok(WsOptions::default());
    };
    if options_json.trim().is_empty() {
        return Ok(WsOptions::default());
    }
    let parsed: Value = serde_json::from_str(&options_json)
        .map_err(|err| napi_error(format!("invalid websocket options json: {err}")))?;
    let Some(object) = parsed.as_object() else {
        return Err(napi_error("websocket options json must be an object"));
    };
    let options = Value::Object(object.clone());
    let ping_interval = duration_from_options_ms(
        &options,
        "pingIntervalMs",
        "ping_interval_ms",
        DEFAULT_PING_INTERVAL,
    );
    let ping_timeout = duration_from_options_ms(
        &options,
        "pingTimeoutMs",
        "ping_timeout_ms",
        DEFAULT_PING_TIMEOUT,
    )
    .max(ping_interval.saturating_mul(2));
    let read_timeout = duration_from_options_ms(
        &options,
        "readTimeoutMs",
        "read_timeout_ms",
        DEFAULT_READ_TIMEOUT,
    );
    Ok(WsOptions {
        ping_interval,
        ping_timeout,
        read_timeout,
    })
}

async fn request_ws_command(
    session: &Session,
    make_command: impl FnOnce(oneshot::Sender<WsCommandResult>) -> WsCommand,
    closed_message: impl Into<String>,
) -> Result<()> {
    let (tx_result, rx_result) = oneshot::channel();
    session
        .tx
        .send(make_command(tx_result))
        .await
        .map_err(|_| napi_error(closed_message.into()))?;
    rx_result
        .await
        .map_err(|_| napi_error("websocket command result channel closed"))?
        .map_err(napi_error)
}

#[napi]
pub fn ws_v2_native_available() -> bool {
    true
}

#[napi]
pub async fn ws_v2_connect(
    url: String,
    headers_json: Option<String>,
    client_name: Option<String>,
    options_json: Option<String>,
) -> Result<String> {
    let options = parse_options(options_json)?;
    let url = ws_url_from_base(&url)?;
    let mut request = url
        .into_client_request()
        .map_err(|err| napi_error(format!("failed to build websocket request: {err}")))?;
    apply_headers(&mut request, headers_json)?;

    let (mut websocket, _) = timeout(
        CONNECT_TIMEOUT,
        connect_async_with_config(request, Some(websocket_config()), false),
    )
    .await
    .map_err(|_| napi_error("websocket connect timed out after 10000ms"))?
    .map_err(|err| napi_error(format!("websocket connect failed: {err}")))?;

    timeout(INITIALIZE_TIMEOUT, async {
        initialize_websocket(&mut websocket, client_name).await
    })
    .await
    .map_err(|_| napi_error("websocket initialize timed out after 10000ms"))??;

    let (tx_command, mut rx_command) = mpsc::channel::<WsCommand>(1024);
    let (tx_in, rx_in) = mpsc::channel::<String>(1024);
    let close_reason = Arc::new(Mutex::new(None));
    let pump_close_reason = Arc::clone(&close_reason);

    tokio::spawn(async move {
        let mut last_peer_activity = Instant::now();
        let ping_interval = options.ping_interval;
        let ping_timeout = options.ping_timeout;
        let mut ping_deadline = tokio::time::Instant::now() + ping_interval;
        loop {
            tokio::select! {
                command = rx_command.recv() => {
                    let Some(command) = command else {
                        let _ = websocket.close(None).await;
                        break;
                    };
                    match command {
                        WsCommand::Send { message, tx_result } => {
                            let result = websocket
                                .send(message)
                                .await
                                .map_err(|err| format!("websocket send failed: {err}"));
                            let should_break = result.is_err();
                            if should_break {
                                if let Err(err) = &result {
                                    *pump_close_reason.lock().await = Some(err.clone());
                                }
                            }
                            let _ = tx_result.send(result);
                            if should_break {
                                break;
                            }
                        }
                        WsCommand::Close { tx_result } => {
                            let result = websocket
                                .close(None)
                                .await
                                .map_err(|err| format!("websocket close failed: {err}"));
                            if result.is_ok() {
                                let _ = timeout(CLOSE_PEER_REPLY_TIMEOUT, async {
                                    while let Some(message) = websocket.next().await {
                                        match message {
                                            Ok(Message::Close(_)) => break,
                                            Ok(Message::Ping(payload)) => {
                                                let _ = websocket.send(Message::Pong(payload)).await;
                                            }
                                            Ok(_) => {}
                                            Err(err) => {
                                                *pump_close_reason.lock().await = Some(format!(
                                                    "websocket read failed during close: {err}"
                                                ));
                                                break;
                                            }
                                        }
                                    }
                                })
                                .await;
                            }
                            let _ = tx_result.send(result);
                            break;
                        }
                    }
                }
                frame = websocket.next() => {
                    let Some(frame) = frame else {
                        *pump_close_reason.lock().await = Some("websocket closed".to_string());
                        break;
                    };
                    let frame = match frame {
                        Ok(frame) => frame,
                        Err(err) => {
                            *pump_close_reason.lock().await = Some(format!("websocket read failed: {err}"));
                            break;
                        }
                    };
                    last_peer_activity = Instant::now();
                    match frame {
                        Message::Text(text) => {
                            if tx_in.send(text.to_string()).await.is_err() {
                                let _ = websocket.close(None).await;
                                break;
                            }
                        }
                        Message::Binary(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            if tx_in.send(text).await.is_err() {
                                let _ = websocket.close(None).await;
                                break;
                            }
                        }
                        Message::Ping(payload) => {
                            if let Err(err) = websocket.send(Message::Pong(payload)).await {
                                *pump_close_reason.lock().await = Some(format!("websocket pong failed: {err}"));
                                break;
                            }
                        }
                        Message::Pong(_) => {}
                        Message::Close(frame) => {
                            let reason = frame
                                .as_ref()
                                .map(|frame| frame.reason.to_string())
                                .filter(|reason| !reason.is_empty())
                                .unwrap_or_else(|| "websocket closed by peer".to_string());
                            *pump_close_reason.lock().await = Some(reason);
                            break;
                        }
                        Message::Frame(_) => {}
                    }
                }
                _ = tokio::time::sleep_until(ping_deadline) => {
                    let idle = last_peer_activity.elapsed();
                    if idle >= ping_timeout {
                        *pump_close_reason.lock().await = Some(format!(
                            "websocket ping timeout: no peer activity for {}ms",
                            idle.as_millis()
                        ));
                        let _ = timeout(CLOSE_PEER_REPLY_TIMEOUT, websocket.close(None)).await;
                        break;
                    }
                    if idle >= ping_interval {
                        if let Err(err) = websocket.send(Message::Ping(PING_PAYLOAD.to_vec())).await {
                            *pump_close_reason.lock().await = Some(format!("websocket ping failed: {err}"));
                            break;
                        }
                    }
                    ping_deadline = tokio::time::Instant::now() + ping_interval;
                }
            }
        }
    });

    let session_id = Uuid::new_v4().to_string();
    SESSIONS.lock().await.insert(
        session_id.clone(),
        Arc::new(Session {
            tx: tx_command,
            rx: Mutex::new(rx_in),
            close_reason,
            read_timeout: options.read_timeout,
        }),
    );
    Ok(session_id)
}

async fn initialize_websocket(
    websocket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    client_name: Option<String>,
) -> Result<()> {
    let init_id = format!("initialize-{}", Uuid::new_v4());
    let initialize = json!({
        "id": init_id,
        "method": "initialize",
        "params": { "client": client_name.unwrap_or_else(|| "ncode-openai-compat-ws-v2".to_string()) }
    })
    .to_string();
    websocket
        .send(Message::Text(initialize))
        .await
        .map_err(|err| napi_error(format!("websocket initialize send failed: {err}")))?;

    loop {
        let Some(frame) = websocket.next().await else {
            return Err(napi_error("websocket closed before initialize response"));
        };
        let frame = frame
            .map_err(|err| napi_error(format!("websocket initialize receive failed: {err}")))?;
        let text = match frame {
            Message::Text(text) => text.to_string(),
            Message::Binary(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Message::Ping(payload) => {
                websocket
                    .send(Message::Pong(payload))
                    .await
                    .map_err(|err| napi_error(format!("websocket pong failed: {err}")))?;
                continue;
            }
            Message::Close(_) => {
                return Err(napi_error("websocket closed before initialize response"))
            }
            _ => continue,
        };
        let parsed: Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if parsed.get("id").and_then(Value::as_str) != Some(init_id.as_str()) {
            continue;
        }
        if parsed.get("error").is_some() {
            return Err(napi_error(format!("websocket initialize failed: {parsed}")));
        }
        return Ok(());
    }
}

#[napi]
pub async fn ws_v2_start(
    session_id: String,
    request_id: String,
    payload_json: String,
) -> Result<()> {
    let session = {
        let sessions = SESSIONS.lock().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| napi_error(format!("unknown websocket session: {session_id}")))?
    };
    let payload: Value = serde_json::from_str(&payload_json)
        .map_err(|err| napi_error(format!("invalid payload json: {err}")))?;
    let message = json!({
        "id": request_id,
        "method": "chat.completions.start",
        "params": payload,
    })
    .to_string();
    request_ws_command(
        &session,
        |tx_result| WsCommand::Send {
            message: Message::Text(message),
            tx_result,
        },
        "websocket command channel closed while sending start",
    )
    .await
}

#[napi]
pub async fn ws_v2_next(session_id: String) -> Result<Option<String>> {
    let session = {
        let sessions = SESSIONS.lock().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| napi_error(format!("unknown websocket session: {session_id}")))?
    };
    let mut rx = session.rx.lock().await;
    let read_timeout = session.read_timeout;
    match timeout(read_timeout, rx.recv()).await {
        Ok(Some(message)) => Ok(Some(message)),
        Ok(None) => {
            if let Some(reason) = session.close_reason.lock().await.take() {
                Err(napi_error(reason))
            } else {
                Ok(None)
            }
        }
        Err(_) => {
            let message = format!(
                "websocket read timed out after {}ms (no message from server)",
                read_timeout.as_millis()
            );
            *session.close_reason.lock().await = Some(message.clone());
            let _ = remove_session(&session_id).await;
            let _ = timeout(
                CLOSE_PEER_REPLY_TIMEOUT,
                request_ws_command(
                    &session,
                    |tx_result| WsCommand::Close { tx_result },
                    "websocket command channel closed while closing timed-out read",
                ),
            )
            .await;
            Err(napi_error(message))
        }
    }
}

#[napi]
pub async fn ws_v2_cancel(session_id: String, request_id: String) -> Result<()> {
    let session = {
        let sessions = SESSIONS.lock().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| napi_error(format!("unknown websocket session: {session_id}")))?
    };
    let message = json!({
        "id": format!("cancel-{request_id}"),
        "method": "chat.completions.cancel",
        "params": { "id": request_id },
    })
    .to_string();
    request_ws_command(
        &session,
        |tx_result| WsCommand::Send {
            message: Message::Text(message),
            tx_result,
        },
        "websocket command channel closed while sending cancel",
    )
    .await
}

#[napi]
pub async fn ws_v2_close(session_id: String) -> Result<()> {
    if let Some(session) = remove_session(&session_id).await {
        let _ = request_ws_command(
            &session,
            |tx_result| WsCommand::Close { tx_result },
            "websocket command channel closed while closing",
        )
        .await;
    }
    Ok(())
}
