//! Google sign-in (OAuth2 PKCE + loopback) and watch-list sync via Google Drive
//! `appDataFolder`. The backend stores only an opaque JSON blob in Drive; the
//! frontend decides what goes in it and how to merge.
//!
//! NOTE: requires a user-supplied Desktop OAuth client (Client ID + Secret) and
//! Drive API enabled. Untested end-to-end without real credentials.

use crate::error::{AppError, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata openid email";
const FILE_NAME: &str = "kanpan-sync.json";

#[derive(Serialize, Deserialize, Clone)]
struct Account {
    client_id: String,
    client_secret: String,
    refresh_token: String,
    email: String,
}

fn account_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::msg("無法取得資料夾"))?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join("google.json"))
}

fn load_account(app: &AppHandle) -> Option<Account> {
    let path = account_path(app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn save_account(app: &AppHandle, acc: &Account) -> Result<()> {
    let path = account_path(app)?;
    std::fs::write(path, serde_json::to_string(acc).unwrap_or_default())
        .map_err(|_| AppError::msg("無法儲存登入資訊"))?;
    Ok(())
}

fn enc(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

fn rand_verifier() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..64).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

fn challenge(verifier: &str) -> String {
    let mut h = Sha256::new();
    h.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(h.finalize())
}

/// Block until the OAuth redirect hits the loopback server; return the `code`.
fn wait_for_code(listener: TcpListener) -> Option<String> {
    let (mut stream, _) = listener.accept().ok()?;
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line).ok()?;
    // line = "GET /?code=XXX&scope=... HTTP/1.1"
    let code = line
        .split_whitespace()
        .nth(1)
        .and_then(|p| p.split('?').nth(1))
        .and_then(|q| q.split('&').find(|kv| kv.starts_with("code=")))
        .map(|kv| urlencoding::decode(&kv["code=".len()..]).unwrap_or_default().into_owned());
    let body = "<html><body style=\"font-family:sans-serif\">KanPan：登入完成，可關閉此視窗。</body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    code
}

async fn fetch_email(client: &reqwest::Client, access: &str) -> Option<String> {
    let v: Value = client.get(USERINFO_URL).bearer_auth(access).send().await.ok()?.json().await.ok()?;
    v.get("email").and_then(|e| e.as_str()).map(String::from)
}

/// Mint a fresh access token from the stored refresh token.
async fn access_token(app: &AppHandle) -> Result<String> {
    let acc = load_account(app).ok_or_else(|| AppError::msg("尚未登入 Google"))?;
    let client = reqwest::Client::new();
    let tok: Value = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", acc.client_id.as_str()),
            ("client_secret", acc.client_secret.as_str()),
            ("refresh_token", acc.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|_| AppError::msg("無法連線到 Google"))?
        .error_for_status()
        .map_err(|_| AppError::msg("Google 授權已失效，請重新登入"))?
        .json()
        .await?;
    tok.get("access_token")
        .and_then(|t| t.as_str())
        .map(String::from)
        .ok_or_else(|| AppError::msg("無法取得存取權杖"))
}

async fn drive_file_id(client: &reqwest::Client, access: &str) -> Result<Option<String>> {
    let v: Value = client
        .get("https://www.googleapis.com/drive/v3/files")
        .query(&[
            ("spaces", "appDataFolder"),
            ("q", &format!("name='{FILE_NAME}'")),
            ("fields", "files(id,name)"),
        ])
        .bearer_auth(access)
        .send()
        .await?
        .error_for_status()
        .map_err(|_| AppError::msg("讀取 Drive 失敗"))?
        .json()
        .await?;
    Ok(v.get("files")
        .and_then(|f| f.as_array())
        .and_then(|a| a.first())
        .and_then(|f| f.get("id"))
        .and_then(|i| i.as_str())
        .map(String::from))
}

// ---- commands ----

#[tauri::command]
pub async fn google_sign_in(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<String> {
    if client_id.is_empty() || client_secret.is_empty() {
        return Err(AppError::msg("請先填入 Google Client ID 與 Secret"));
    }
    let verifier = rand_verifier();
    let chal = challenge(&verifier);
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|_| AppError::msg("無法開啟本機連接埠"))?;
    let port = listener.local_addr().map_err(|_| AppError::msg("無法取得連接埠"))?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let auth_url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        enc(&client_id),
        enc(&redirect),
        enc(SCOPE),
        chal,
    );
    webbrowser::open(&auth_url).map_err(|_| AppError::msg("無法開啟瀏覽器"))?;

    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(listener))
        .await
        .map_err(|_| AppError::msg("登入流程中斷"))?
        .ok_or_else(|| AppError::msg("未取得授權碼（已取消？）"))?;

    let client = reqwest::Client::new();
    let tok: Value = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect.as_str()),
        ])
        .send()
        .await
        .map_err(|_| AppError::msg("無法連線到 Google"))?
        .error_for_status()
        .map_err(|_| AppError::msg("Token 交換失敗，請確認 Client ID / Secret"))?
        .json()
        .await?;

    let refresh_token = tok
        .get("refresh_token")
        .and_then(|t| t.as_str())
        .ok_or_else(|| AppError::msg("未取得 refresh token，請於同意畫面允許離線存取"))?
        .to_string();
    let access = tok.get("access_token").and_then(|t| t.as_str()).unwrap_or("");
    let email = fetch_email(&client, access).await.unwrap_or_default();

    save_account(&app, &Account { client_id, client_secret, refresh_token, email: email.clone() })?;
    Ok(email)
}

#[tauri::command]
pub fn google_status(app: AppHandle) -> Option<String> {
    load_account(&app).map(|a| a.email)
}

#[tauri::command]
pub fn google_sign_out(app: AppHandle) -> Result<()> {
    if let Ok(path) = account_path(&app) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// Download the synced blob (or None if nothing stored yet).
#[tauri::command]
pub async fn google_sync_pull(app: AppHandle) -> Result<Option<String>> {
    let access = access_token(&app).await?;
    let client = reqwest::Client::new();
    let Some(id) = drive_file_id(&client, &access).await? else {
        return Ok(None);
    };
    let text = client
        .get(format!("https://www.googleapis.com/drive/v3/files/{id}"))
        .query(&[("alt", "media")])
        .bearer_auth(&access)
        .send()
        .await?
        .error_for_status()
        .map_err(|_| AppError::msg("下載同步資料失敗"))?
        .text()
        .await?;
    Ok(Some(text))
}

/// Upload (create or overwrite) the synced blob.
#[tauri::command]
pub async fn google_sync_push(app: AppHandle, content: String) -> Result<()> {
    let access = access_token(&app).await?;
    let client = reqwest::Client::new();
    let existing = drive_file_id(&client, &access).await?;
    let resp = if let Some(id) = existing {
        client
            .patch(format!(
                "https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media"
            ))
            .bearer_auth(&access)
            .header("Content-Type", "application/json")
            .body(content)
            .send()
            .await
    } else {
        let boundary = "kanpanBoundary7e3f";
        let body = format!(
            "--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{{\"name\":\"{name}\",\"parents\":[\"appDataFolder\"]}}\r\n--{b}\r\nContent-Type: application/json\r\n\r\n{content}\r\n--{b}--",
            b = boundary,
            name = FILE_NAME,
            content = content,
        );
        client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
            .bearer_auth(&access)
            .header("Content-Type", format!("multipart/related; boundary={boundary}"))
            .body(body)
            .send()
            .await
    };
    resp.map_err(|_| AppError::msg("上傳同步資料失敗"))?
        .error_for_status()
        .map_err(|_| AppError::msg("上傳同步資料失敗"))?;
    Ok(())
}
