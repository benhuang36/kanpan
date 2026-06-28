mod cache;
mod commands;
mod error;
mod indicators;
mod models;
mod providers;

use commands::AppState;
use providers::finmind::FinMind;
use providers::fugle::{FugleHttp, FugleManager};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = Connection::open(data_dir.join("cache.sqlite"))?;
            cache::init(&conn)?;

            // FinMind token is optional; persisted in the frontend store and
            // pushed down via `set_finmind_token` after startup.
            let token = std::env::var("FINMIND_TOKEN").ok();

            let fugle = FugleManager::new(app.handle().clone());

            app.manage(AppState {
                db: Mutex::new(conn),
                finmind: FinMind::new(token),
                fugle,
                fugle_http: FugleHttp::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_symbols,
            commands::refresh_symbols,
            commands::get_stock_detail,
            commands::set_finmind_token,
            commands::finmind_token_set,
            commands::set_fugle_key,
            commands::fugle_key_set,
            commands::fugle_subscribe,
            commands::fugle_unsubscribe,
            commands::get_intraday_candles,
            commands::ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
