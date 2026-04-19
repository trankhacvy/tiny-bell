use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use once_cell::sync::OnceCell;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

use crate::auth::AuthError;

pub const LOOPBACK_HOST: &str = "127.0.0.1";
pub const LOOPBACK_PORTS: [u16; 3] = [53123, 53124, 53125];
pub const OAUTH_TIMEOUT_SECS: u64 = 300;

pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

pub fn generate_pkce() -> PkcePair {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    let verifier = URL_SAFE_NO_PAD.encode(buf);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    PkcePair { verifier, challenge }
}

pub fn generate_state() -> String {
    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn parse_query(url: &str) -> HashMap<String, String> {
    let q = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    url::form_urlencoded::parse(q.as_bytes())
        .into_owned()
        .collect()
}

pub enum CallbackResult {
    Code(String),
    ProviderError(String),
}

pub fn extract_code(
    params: &HashMap<String, String>,
    expected_state: &str,
) -> Result<CallbackResult, AuthError> {
    if let Some(err) = params.get("error") {
        let desc = params
            .get("error_description")
            .cloned()
            .unwrap_or_else(|| err.clone());
        return Ok(CallbackResult::ProviderError(desc));
    }
    let state = params.get("state").ok_or(AuthError::StateMismatch)?;
    if !constant_time_eq(state, expected_state) {
        return Err(AuthError::StateMismatch);
    }
    let code = params.get("code").ok_or(AuthError::MissingCode)?;
    Ok(CallbackResult::Code(code.clone()))
}

struct ActiveServer {
    shutdown: Option<oneshot::Sender<()>>,
    join: Option<std::thread::JoinHandle<()>>,
}

static ACTIVE: OnceCell<Mutex<Option<ActiveServer>>> = OnceCell::new();

fn slot() -> &'static Mutex<Option<ActiveServer>> {
    ACTIVE.get_or_init(|| Mutex::new(None))
}

pub struct LoopbackBinding {
    pub port: u16,
    pub code_rx: oneshot::Receiver<Result<CallbackResult, AuthError>>,
}

pub fn spawn_loopback_server(expected_state: String) -> Result<LoopbackBinding, AuthError> {
    abort_current();

    let (server, port) = bind_first_available().map_err(|e| AuthError::Server(e))?;
    let (code_tx, code_rx) = oneshot::channel::<Result<CallbackResult, AuthError>>();
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    let server_arc = std::sync::Arc::new(server);
    let server_for_thread = server_arc.clone();
    let expected_state_for_thread = expected_state.clone();

    let join = std::thread::Builder::new()
        .name("oauth-loopback".into())
        .spawn(move || {
            let mut code_tx_opt = Some(code_tx);
            loop {
                match server_for_thread.recv_timeout(std::time::Duration::from_millis(250)) {
                    Ok(Some(req)) => {
                        let url = req.url().to_string();
                        let params = parse_query(&url);
                        let result = extract_code(&params, &expected_state_for_thread);
                        let html = match &result {
                            Ok(CallbackResult::Code(_)) => SUCCESS_HTML,
                            _ => FAILURE_HTML,
                        };
                        let header: tiny_http::Header =
                            "Content-Type: text/html; charset=utf-8".parse().unwrap();
                        let _ = req.respond(
                            tiny_http::Response::from_string(html).with_header(header),
                        );
                        if let Some(tx) = code_tx_opt.take() {
                            let _ = tx.send(result);
                        }
                        break;
                    }
                    Ok(None) => {}
                    Err(_) => {}
                }
                if shutdown_rx.try_recv().is_ok() {
                    if let Some(tx) = code_tx_opt.take() {
                        let _ = tx.send(Err(AuthError::ServerClosed));
                    }
                    break;
                }
            }
        })
        .map_err(|e| AuthError::Server(e.to_string()))?;

    {
        let mut guard = slot().lock().expect("oauth slot poisoned");
        *guard = Some(ActiveServer {
            shutdown: Some(shutdown_tx),
            join: Some(join),
        });
    }

    Ok(LoopbackBinding { port, code_rx })
}

fn bind_first_available() -> Result<(tiny_http::Server, u16), String> {
    let mut last_err = String::new();
    for port in LOOPBACK_PORTS {
        let addr = format!("{LOOPBACK_HOST}:{port}");
        match tiny_http::Server::http(&addr) {
            Ok(server) => return Ok((server, port)),
            Err(e) => last_err = format!("port {port}: {e}"),
        }
    }
    Err(format!(
        "none of ports {:?} are available ({last_err})",
        LOOPBACK_PORTS
    ))
}

pub fn abort_current() {
    let mut guard = match slot().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if let Some(mut active) = guard.take() {
        if let Some(tx) = active.shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(join) = active.join.take() {
            let _ = join.join();
        }
    }
}

pub fn redirect_uri_for(port: u16) -> String {
    format!("http://{LOOPBACK_HOST}:{port}/callback")
}

const SUCCESS_HTML: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Tiny Bell connected</title>
<style>
  body { font: 14px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; text-align: center; padding: 48px 24px; color: #0a0a0a; background: #fafafa; }
  h1 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
  p { color: #71717a; margin: 0; }
  .ok { font-size: 32px; margin-bottom: 12px; }
</style></head>
<body>
  <div class="ok">\u2713</div>
  <h1>Tiny Bell is connected</h1>
  <p>You can close this tab and return to the app.</p>
  <script>setTimeout(function(){ window.close(); }, 800);</script>
</body></html>"#;

const FAILURE_HTML: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Connection failed</title>
<style>
  body { font: 14px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; text-align: center; padding: 48px 24px; color: #0a0a0a; background: #fafafa; }
  h1 { font-size: 20px; margin: 0 0 8px; font-weight: 600; }
  p { color: #71717a; margin: 0; }
</style></head>
<body>
  <h1>Connection failed</h1>
  <p>Please return to Tiny Bell and try again.</p>
</body></html>"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_spec() {
        let pair = generate_pkce();
        let expected = URL_SAFE_NO_PAD.encode(Sha256::digest(pair.verifier.as_bytes()));
        assert_eq!(pair.challenge, expected);
        assert!(pair.verifier.len() >= 43);
    }

    #[test]
    fn pkce_is_non_deterministic() {
        let a = generate_pkce();
        let b = generate_pkce();
        assert_ne!(a.verifier, b.verifier);
    }

    #[test]
    fn state_is_random() {
        let a = generate_state();
        let b = generate_state();
        assert_ne!(a, b);
        assert!(!a.is_empty());
    }

    #[test]
    fn parse_query_handles_missing_and_extra_params() {
        let params = parse_query("/callback?code=abc&state=xyz&extra=1");
        assert_eq!(params.get("code").map(String::as_str), Some("abc"));
        assert_eq!(params.get("state").map(String::as_str), Some("xyz"));
        assert_eq!(params.get("extra").map(String::as_str), Some("1"));

        let empty = parse_query("/callback");
        assert!(empty.is_empty());
    }

    #[test]
    fn extract_code_rejects_state_mismatch() {
        let mut params = HashMap::new();
        params.insert("code".into(), "abc".into());
        params.insert("state".into(), "wrong".into());
        let r = extract_code(&params, "expected");
        assert!(matches!(r, Err(AuthError::StateMismatch)));
    }

    #[test]
    fn extract_code_accepts_matching_state() {
        let mut params = HashMap::new();
        params.insert("code".into(), "abc".into());
        params.insert("state".into(), "xyz".into());
        let r = extract_code(&params, "xyz").unwrap();
        assert!(matches!(r, CallbackResult::Code(ref c) if c == "abc"));
    }

    #[test]
    fn extract_code_surfaces_provider_error() {
        let mut params = HashMap::new();
        params.insert("error".into(), "access_denied".into());
        params.insert(
            "error_description".into(),
            "The user denied access".into(),
        );
        let r = extract_code(&params, "x").unwrap();
        assert!(matches!(r, CallbackResult::ProviderError(ref s) if s == "The user denied access"));
    }

    #[test]
    fn extract_code_missing_code_errors() {
        let mut params = HashMap::new();
        params.insert("state".into(), "xyz".into());
        let r = extract_code(&params, "xyz");
        assert!(matches!(r, Err(AuthError::MissingCode)));
    }

    #[test]
    fn constant_time_eq_distinguishes_inputs() {
        assert!(constant_time_eq("abc", "abc"));
        assert!(!constant_time_eq("abc", "abd"));
        assert!(!constant_time_eq("abc", "abcd"));
    }

    #[tokio::test]
    async fn loopback_server_binds_and_aborts_cleanly() {
        let binding = spawn_loopback_server("state-1".into()).expect("bind");
        assert!(LOOPBACK_PORTS.contains(&binding.port));
        abort_current();
        let result = binding.code_rx.await.expect("rx closed");
        assert!(matches!(result, Err(AuthError::ServerClosed)));
    }

    #[test]
    fn bind_failure_reports_all_ports() {
        let mut holds = Vec::new();
        for p in LOOPBACK_PORTS {
            if let Ok(listener) = std::net::TcpListener::bind(format!("{LOOPBACK_HOST}:{p}")) {
                holds.push(listener);
            }
        }
        if holds.len() != LOOPBACK_PORTS.len() {
            for l in holds {
                drop(l);
            }
            return;
        }

        let result = bind_first_available();
        for l in holds {
            drop(l);
        }
        assert!(result.is_err());
        let msg = result.err().unwrap();
        for p in LOOPBACK_PORTS {
            assert!(msg.contains(&p.to_string()), "missing port {p} in {msg}");
        }
    }
}
