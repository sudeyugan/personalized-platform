mod commands;
mod local_voice;
mod repositories;
mod services;
#[cfg(test)]
mod spikes;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

fn install_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let interact = MenuItem::with_id(app, "companion-interactive", "显示伙伴并交谈", true, None::<&str>)?;
    let quiet = MenuItem::with_id(app, "companion-quiet", "安静显示（鼠标穿透）", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "companion-hide", "隐藏伙伴", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open-main", "打开一隅", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出一隅", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&interact, &quiet, &hide, &open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("yiyu-main")
        .menu(&menu)
        .tooltip("一隅")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "companion-interactive" => { let _ = app.emit_to("main", "companion:tray-action", "interactive"); }
            "companion-quiet" => { let _ = app.emit_to("main", "companion:tray-action", "quiet"); }
            "companion-hide" => { let _ = app.emit_to("main", "companion:tray-action", "hide"); }
            "open-main" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(commands::CompanionAssetScope::default())
        .manage(local_voice::LocalVoiceState::default())
        .setup(|app| {
            repositories::install_panic_marker(app.handle())?;
            install_tray(app)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::get_storage_status,
            commands::configure_storage,
            commands::create_diagnostic_bundle,
            commands::load_library,
            commands::save_library,
            commands::save_recovery_draft,
            commands::load_recovery_drafts,
            commands::clear_recovery_draft,
            commands::search_library,
            commands::import_image_asset,
            commands::import_companion_video_asset,
            commands::read_image_asset,
            commands::set_companion_asset_scope,
            commands::read_companion_image_asset,
            commands::delete_image_asset,
            commands::import_audio_track,
            commands::read_audio_track,
            commands::delete_audio_track,
            commands::store_secret,
            commands::has_secret,
            commands::delete_secret,
            commands::companion_chat_completion,
            commands::companion_chat_completion_stream,
            commands::elevenlabs_text_to_speech,
            commands::elevenlabs_speech_to_text,
            commands::elevenlabs_realtime_scribe_token,
            local_voice::local_voice_status,
            local_voice::local_voice_install_models,
            local_voice::local_voice_cancel_install,
            local_voice::local_voice_enroll,
            local_voice::local_voice_delete_profile,
            local_voice::local_voice_start,
            local_voice::local_voice_process_pcm,
            local_voice::local_voice_stop,
            commands::create_backup,
            commands::ensure_daily_backup,
            commands::list_backups,
            commands::preview_backup,
            commands::restore_backup,
            commands::write_export_bundle,
            commands::create_vault,
            commands::unlock_vault,
            commands::save_vault,
            commands::vault_unlocked,
            commands::lock_vault,
            commands::lock_all_vaults,
        ])
        .on_window_event(|window, event| {
            if should_exit_with_window(window.label())
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Yiyu desktop application");
}

fn should_exit_with_window(label: &str) -> bool {
    label == "main"
}

#[cfg(test)]
mod lifecycle_tests {
    use super::should_exit_with_window;

    #[test]
    fn closing_main_exits_all_windows_but_closing_companion_does_not() {
        assert!(should_exit_with_window("main"));
        assert!(!should_exit_with_window("companion"));
    }
}
