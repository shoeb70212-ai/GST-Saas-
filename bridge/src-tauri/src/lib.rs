use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::watch;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub api_base: String,
    pub device_id: String,
    pub device_secret: String,
    pub tally_host: String,
    pub tally_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusPayload {
    pub state: String,
    pub detail: Option<String>,
}

struct AppState {
    config: Mutex<Option<BridgeConfig>>,
    status: Mutex<StatusPayload>,
    stop_tx: Mutex<Option<watch::Sender<bool>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config: Mutex::new(None),
            status: Mutex::new(StatusPayload {
                state: "idle".into(),
                detail: None,
            }),
            stop_tx: Mutex::new(None),
        }
    }
}

fn set_status(state: &AppState, s: &str, detail: Option<String>) {
    *state.status.lock() = StatusPayload {
        state: s.into(),
        detail,
    };
}

#[tauri::command]
fn save_config(config: BridgeConfig, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    *state.config.lock() = Some(config);
    set_status(&state, "configured", Some("Config saved".into()));
    Ok(())
}

#[tauri::command]
fn get_status(state: State<'_, Arc<AppState>>) -> StatusPayload {
    state.status.lock().clone()
}

#[tauri::command]
fn stop_polling(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Some(tx) = state.stop_tx.lock().as_ref() {
        let _ = tx.send(true);
    }
    set_status(&state, "idle", Some("Stopped".into()));
    Ok(())
}

#[tauri::command]
async fn start_polling(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let cfg = state
        .config
        .lock()
        .clone()
        .ok_or_else(|| "Save config first".to_string())?;

    // Stop previous loop
    if let Some(tx) = state.stop_tx.lock().as_ref() {
        let _ = tx.send(true);
    }
    let (tx, mut rx) = watch::channel(false);
    *state.stop_tx.lock() = Some(tx);

    let st = state.inner().clone();
    set_status(&st, "ok", Some("Polling…".into()));

    tauri::async_runtime::spawn(async move {
        let http = reqwest::Client::new();
        loop {
            if *rx.borrow() {
                break;
            }
            match poll_once(&http, &cfg).await {
                Ok(Some(msg)) => set_status(&st, "ok", Some(msg)),
                Ok(None) => set_status(&st, "ok", Some("Idle — waiting for jobs".into())),
                Err(e) => set_status(&st, "error", Some(e)),
            }
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {}
                _ = rx.changed() => {
                    if *rx.borrow() { break; }
                }
            }
        }
    });

    Ok(())
}

async fn poll_once(http: &reqwest::Client, cfg: &BridgeConfig) -> Result<Option<String>, String> {
    // Token
    let token_url = format!("{}/api/bridge/devices/token", cfg.api_base.trim_end_matches('/'));
    let token_resp = http
        .post(&token_url)
        .json(&serde_json::json!({
            "device_id": cfg.device_id,
            "device_secret": cfg.device_secret,
        }))
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    if !token_resp.status().is_success() {
        return Err(format!("Token HTTP {}", token_resp.status()));
    }
    let token_json: serde_json::Value = token_resp
        .json()
        .await
        .map_err(|e| format!("Token parse: {e}"))?;
    let access = token_json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No access_token".to_string())?;

    let next_url = format!("{}/api/bridge/jobs/next", cfg.api_base.trim_end_matches('/'));
    let next_resp = http
        .get(&next_url)
        .bearer_auth(access)
        .send()
        .await
        .map_err(|e| format!("jobs/next failed: {e}"))?;
    if !next_resp.status().is_success() {
        return Err(format!("jobs/next HTTP {}", next_resp.status()));
    }
    let next_json: serde_json::Value = next_resp.json().await.map_err(|e| e.to_string())?;
    let job = match next_json.get("job") {
        Some(j) if !j.is_null() => j,
        _ => return Ok(None),
    };
    let job_id = job.get("id").and_then(|v| v.as_str()).ok_or("job id")?;
    let xml = job.get("xml").and_then(|v| v.as_str()).ok_or("job xml")?;

    let tally_url = format!("http://{}:{}", cfg.tally_host, cfg.tally_port);
    let tally_resp = http
        .post(&tally_url)
        .header("Content-Type", "application/xml")
        .body(xml.to_string())
        .send()
        .await;
    let (ok, body) = match tally_resp {
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_default();
            let failed = !status.is_success()
                || text.to_uppercase().contains("LINEERROR")
                || text.to_uppercase().contains("<ERROR>");
            (!failed, text)
        }
        Err(e) => (false, format!("Tally unreachable: {e}")),
    };

    let result_url = format!(
        "{}/api/bridge/jobs/{}/result",
        cfg.api_base.trim_end_matches('/'),
        job_id
    );
    let _ = http
        .post(&result_url)
        .bearer_auth(access)
        .json(&serde_json::json!({
            "status": if ok { "pushed" } else { "failed" },
            "tally_response": body.chars().take(20000).collect::<String>(),
            "error_message": if ok { serde_json::Value::Null } else { serde_json::Value::String(body.chars().take(500).collect()) },
        }))
        .send()
        .await;

    if ok {
        Ok(Some(format!("Pushed job {job_id}")))
    } else {
        Err(format!("Tally push failed for {job_id}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            save_config,
            start_polling,
            stop_polling,
            get_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
