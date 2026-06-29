mod alerts;
mod cache;
mod commands;
mod error;
mod indicators;
mod models;
mod providers;

use alerts::AlertState;
use commands::AppState;
use providers::finmind::FinMind;
use providers::fugle::{FugleHttp, FugleManager};
use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

/// Bring the main window back to the foreground (from tray / minimised / hidden).
fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // Closing the window hides it to the tray, unless the user chose to quit.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window.state::<AppState>().close_to_tray.load(Ordering::Relaxed);
                if to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = Connection::open(data_dir.join("cache.sqlite"))?;
            cache::init(&conn)?;
            let db = Arc::new(Mutex::new(conn));

            // FinMind token is optional; persisted in the frontend store and
            // pushed down via `set_finmind_token` after startup.
            let token = std::env::var("FINMIND_TOKEN").ok();
            let finmind = Arc::new(FinMind::new(token));

            let fugle = FugleManager::new(app.handle().clone());
            let alert_state = Arc::new(AlertState::new());

            // Background alert engine: evaluates rules off the webview, so alerts
            // keep firing while the window is hidden in the tray.
            alerts::spawn_engine(
                app.handle().clone(),
                db.clone(),
                finmind.clone(),
                fugle.quotes(),
                alert_state.clone(),
            );

            app.manage(AppState {
                db,
                finmind,
                fugle,
                fugle_http: FugleHttp::new(),
                alerts: alert_state,
                close_to_tray: AtomicBool::new(true),
            });

            // System tray: left-click opens the main window; menu offers show / quit.
            let show_i = MenuItem::with_id(app, "show", "顯示主介面", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "離開", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("KanPan 看盤")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

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
            commands::fugle_set_plan,
            commands::get_intraday_candles,
            commands::ai_chat,
            commands::set_alerts,
            commands::set_poll_minutes,
            commands::set_close_to_tray,
            commands::test_finmind,
            commands::test_fugle,
            commands::test_ai,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
