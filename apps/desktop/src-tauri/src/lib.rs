mod commands;
mod repositories;
mod services;
#[cfg(test)]
mod spikes;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::CompanionAssetScope::default())
        .setup(|app| {
            repositories::install_panic_marker(app.handle())?;
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
