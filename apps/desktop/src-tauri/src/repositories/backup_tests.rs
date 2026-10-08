use std::io::Cursor;
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;
    #[test]
    fn rejects_zip_path_traversal() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut bytes);
            writer
                .start_file("../escape", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"bad").unwrap();
            writer.finish().unwrap();
        }
        assert!(inspect(bytes.get_ref()).is_err());
    }

    #[test]
    fn rejects_unchecked_entries_and_unsafe_dates() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut writer = ZipWriter::new(&mut bytes);
            let options = SimpleFileOptions::default();
            writer.start_file("library.json", options).unwrap();
            writer.write_all(br#"{"works":[]}"#).unwrap();
            writer.start_file("manifest.json", options).unwrap();
            writer.write_all(br#"{"format":"yiyu-backup","formatVersion":1}"#).unwrap();
            writer.start_file("checksums.sha256", options).unwrap();
            writer.finish().unwrap();
        }
        assert!(!inspect(bytes.get_ref()).unwrap().1);
        assert!(!safe_timestamp("../../outside"));
        assert!(safe_timestamp("2026-08-09T12:00:00.000Z"));
        assert!(!safe_date("2026/08/09"));
    }

    #[test]
    fn creates_previews_and_restores_a_checked_backup() {
        let directory = tempdir().unwrap();
        let app_data = directory.path().join("app");
        let library = LibraryRepository::at(app_data.clone());
        let original = json!({
            "schemaVersion": 1,
            "works": [{"id":"work-1","title":"原始作品","chapterIds":["chapter-1"]}],
            "chapters": {"chapter-1":{"id":"chapter-1","workId":"work-1","title":"第一章","plainText":"备份正文","content":{"type":"doc","content":[]},"versions":[]}},
            "volumes": [], "people": [], "places": [], "events": [], "entityLinks": [],
            "assets": [], "aiGenerations": [], "settings": {}, "session": {}
        });
        library.save(&original, 0).unwrap();
        fs::create_dir_all(app_data.join("assets/asset-1")).unwrap();
        fs::write(app_data.join("assets/asset-1/original.png"), b"image").unwrap();
        fs::create_dir_all(app_data.join("audio")).unwrap();
        fs::write(app_data.join("audio/track-safe.mp3"), b"audio").unwrap();
        let repository = BackupRepository {
            root: directory.path().join("backups"),
            app_data,
        };
        let receipt = repository
            .create(&library, false, "2026-08-09T12:00:00+08:00")
            .unwrap();
        let bytes = fs::read(&receipt.path).unwrap();
        let preview = repository.preview(&bytes).unwrap();
        assert!(preview.checksums_valid);
        assert_eq!(preview.works, 1);
        assert_eq!(preview.chapters, 1);

        let changed = json!({"schemaVersion": 1, "works": [], "chapters": {}, "volumes": [], "people": [], "places": [], "events": [], "entityLinks": [], "assets": [], "aiGenerations": [], "settings": {}, "session": {}});
        library.save(&changed, 1).unwrap();
        repository.restore(&library, &bytes).unwrap();
        assert_eq!(
            library.load().unwrap().unwrap().data["works"][0]["title"],
            "原始作品"
        );
        assert_eq!(
            fs::read(repository.app_data.join("assets/asset-1/original.png")).unwrap(),
            b"image"
        );
        assert_eq!(
            fs::read(repository.app_data.join("audio/track-safe.mp3")).unwrap(),
            b"audio"
        );
    }

fn fixture() -> (tempfile::TempDir, BackupRepository, LibraryRepository) {
    let directory = tempdir().unwrap();
    let app_data = directory.path().join("app");
    let library = LibraryRepository::at(app_data.clone());
    let data = json!({"schemaVersion":1,"works":[],"chapters":{},"volumes":[],"people":[],"places":[],"events":[],"entityLinks":[],"assets":[],"aiGenerations":[],"settings":{},"session":{}});
    library.save(&data, 0).unwrap();
    fs::create_dir_all(app_data.join("assets/videos")).unwrap();
    fs::write(app_data.join("assets/videos/avatar.webm"), b"video-one").unwrap();
    fs::create_dir_all(app_data.join("audio")).unwrap();
    fs::write(app_data.join("audio/music.mp3"), b"music").unwrap();
    fs::create_dir_all(app_data.join("vaults")).unwrap();
    fs::write(app_data.join("vaults/private.vault"), b"encrypted-vault").unwrap();
    let repository = BackupRepository { root: directory.path().join("backups"), app_data };
    (directory, repository, library)
}
fn blob_count(repository: &BackupRepository) -> usize {
    fs::read_dir(repository.root.join("共享素材")).unwrap().count()
}
#[test]
fn saved_lyrics_and_per_recording_calibration_round_trip_in_both_formats() {
    for automatic in [false, true] {
        let (_dir, repository, library) = fixture();
        let mut data = library.load().unwrap().unwrap().data;
        data["lyricLibrary"] = json!({"version":1,"entries":[{"key":"[\"Song\",\"Singer\",\"Album\",180]","title":"Song","artist":"Singer","album":"Album","durationMs":180000,"lrc":"[00:01]Line","source":"manual","offsetMs":350,"updatedAt":1}]});
        data["lyricLibrary"]["entries"].as_array_mut().unwrap().push(json!({"key":"[\"Live\",\"Singer\",\"Concert\",320]","title":"Live","artist":"Singer","album":"Concert","durationMs":320000,"lrc":"[00:01.25]QQ line","source":"qqmusic","lookupScope":"qqmusic+lrclib","offsetMs":420,"updatedAt":2}));
        data["lyricLibrary"]["entries"].as_array_mut().unwrap().push(json!({"key":"[\"Failure\",\"Singer\",\"Album\",190]","title":"Failure","artist":"Singer","album":"Album","durationMs":190000,"lrc":"","source":"qqmusic","lookupScope":"qqmusic+lrclib","lookupVersion":2,"failureReason":"timeout","retryAfter":123,"offsetMs":0,"updatedAt":3}));
        library.save(&data, 1).unwrap();
        let receipt = if automatic {
            repository.ensure_automatic(&library, 3, 3, "2026-10-06", "2026-10-06T12:00:00.000Z").unwrap().unwrap()
        } else { repository.create(&library, false, "2026-10-06T12:00:00.000Z").unwrap() };
        let mut changed = data.clone(); changed["lyricLibrary"] = json!({"version":1,"entries":[]});
        library.save(&changed, 2).unwrap();
        repository.restore_saved(&library, &receipt.path).unwrap();
        assert_eq!(library.load().unwrap().unwrap().data["lyricLibrary"], data["lyricLibrary"]);
    }
}
#[test]
fn personal_experiences_and_local_covers_round_trip_in_both_backup_formats() {
    for automatic in [false, true] {
        let (_dir, repository, library) = fixture();
        let mut data = library.load().unwrap().unwrap().data;
        data["experiences"] = json!({"entries":[{"id":"experience-1","title":"看过的作品","category":"novel","note":"私人感想","dateText":"去年夏天","tier":"top","coverAssetId":"asset-cover"}],"tierLabels":{"top":"心头好"}});
        data["assets"] = json!([{"id":"asset-cover","mimeType":"image/webp","purpose":"experience"}]);
        library.save(&data, 1).unwrap();
        fs::create_dir_all(repository.app_data.join("assets/asset-cover")).unwrap();
        fs::write(repository.app_data.join("assets/asset-cover/original.webp"), b"cover-bytes").unwrap();
        let receipt = if automatic {
            repository.ensure_automatic(&library, 3, 3, "2026-10-05", "2026-10-05T12:00:00.000Z").unwrap().unwrap()
        } else { repository.create(&library, false, "2026-10-05T12:00:00.000Z").unwrap() };
        let mut changed = data.clone(); changed["experiences"] = json!({});
        library.save(&changed, 2).unwrap();
        fs::write(repository.app_data.join("assets/asset-cover/original.webp"), b"changed").unwrap();
        repository.restore_saved(&library, &receipt.path).unwrap();
        assert_eq!(library.load().unwrap().unwrap().data["experiences"], data["experiences"]);
        assert_eq!(fs::read(repository.app_data.join("assets/asset-cover/original.webp")).unwrap(), b"cover-bytes");
    }
}
#[test]
fn shared_snapshots_deduplicate_and_restore_every_media_directory() {
    let (_dir, repository, library) = fixture();
    let first = repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-02T17:00:00.000Z").unwrap().unwrap();
    let second = repository.ensure_automatic(&library, 3, 3, "2026-10-06", "2026-10-06T04:00:00.000Z").unwrap().unwrap();
    assert_eq!(blob_count(&repository), 3);
    assert!(first.shared && second.shared);
    assert!(repository.preview_saved(&first.path).unwrap().checksums_valid);
    assert!(repository.preview(&fs::read(&first.path).unwrap()).is_err());
    let archive = ZipArchive::new(fs::File::open(&first.path).unwrap()).unwrap();
    assert_eq!(archive.len(), 3);
    fs::write(repository.app_data.join("assets/videos/avatar.webm"), b"changed").unwrap();
    fs::write(repository.app_data.join("audio/music.mp3"), b"changed").unwrap();
    fs::write(repository.app_data.join("vaults/private.vault"), b"changed").unwrap();
    repository.restore_saved(&library, &first.path).unwrap();
    assert_eq!(fs::read(repository.app_data.join("assets/videos/avatar.webm")).unwrap(), b"video-one");
    assert_eq!(fs::read(repository.app_data.join("audio/music.mp3")).unwrap(), b"music");
    assert_eq!(fs::read(repository.app_data.join("vaults/private.vault")).unwrap(), b"encrypted-vault");
    assert_eq!(repository.list().unwrap().iter().filter(|item| !item.automatic).count(), 1);
}

#[test]
fn background_references_and_record_usage_round_trip_in_both_formats() {
    for automatic in [false, true] {
        let (_dir, repository, library) = fixture();
        let mut data = library.load().unwrap().unwrap().data;
        data["settings"]["backgrounds"] = json!({"images":{"default":"asset:asset-background","creation":"asset:asset-background"},"sidebarMode":"soft","mode":"illustration","artSize":45});
        data["people"] = json!([{"id":"person-scope","name":"人物","usage":"fiction","workId":"work-1","aliases":[],"summary":"","importantExperiences":"","tags":[],"customFields":[],"chapterIds":[]}]);
        data["assets"] = json!([{"id":"asset-background","mimeType":"image/webp","purpose":"background"}]);
        library.save(&data, 1).unwrap();
        fs::create_dir_all(repository.app_data.join("assets/asset-background")).unwrap();
        fs::write(repository.app_data.join("assets/asset-background/original.webp"), b"background").unwrap();
        let receipt = if automatic {
            repository.ensure_automatic(&library, 3, 3, "2026-10-06", "2026-10-06T12:00:00.000Z").unwrap().unwrap()
        } else { repository.create(&library, false, "2026-10-06T12:00:00.000Z").unwrap() };
        let mut changed = data.clone(); changed["people"] = json!([]); changed["settings"]["backgrounds"] = json!({});
        library.save(&changed, 2).unwrap();
        fs::write(repository.app_data.join("assets/asset-background/original.webp"), b"changed").unwrap();
        repository.restore_saved(&library, &receipt.path).unwrap();
        let restored = library.load().unwrap().unwrap().data;
        assert_eq!(restored["people"], data["people"]);
        assert_eq!(restored["settings"]["backgrounds"], data["settings"]["backgrounds"]);
        assert_eq!(fs::read(repository.app_data.join("assets/asset-background/original.webp")).unwrap(), b"background");
    }
}
#[test]
fn automatic_interval_uses_local_dates_and_ignores_unfinished_files() {
    let (_dir, repository, library) = fixture();
    fs::create_dir_all(&repository.root).unwrap();
    fs::write(repository.root.join("一隅-自动-2026-10-03.partial"), b"unfinished").unwrap();
    assert!(repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-02T17:00:00.000Z").unwrap().is_some());
    assert!(repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-03T04:00:00.000Z").unwrap().is_none());
    assert!(repository.ensure_automatic(&library, 3, 3, "2026-10-05", "2026-10-04T17:00:00.000Z").unwrap().is_none());
    assert!(repository.ensure_automatic(&library, 3, 3, "2026-10-06", "2026-10-05T17:00:00.000Z").unwrap().is_some());
    assert!(safe_date("2024-02-29"));
    assert!(!safe_date("2026-02-29"));
    assert!(!safe_date("2026-13-01"));
    assert_eq!(date_day("2024-03-01").unwrap() - date_day("2024-02-28").unwrap(), 2);
}
#[test]
fn pruning_preserves_live_versions_and_manual_backups() {
    let (_dir, repository, library) = fixture();
    let manual = repository.create(&library, false, "2026-10-01T01:00:00.000Z").unwrap();
    let mut receipts = Vec::new();
    for day in 1..=5 {
        fs::write(repository.app_data.join("assets/videos/avatar.webm"), format!("video-{day}")).unwrap();
        receipts.push(repository.ensure_automatic(&library, 3, 1, &format!("2026-10-{day:02}"), &format!("2026-10-{day:02}T12:00:00.000Z")).unwrap().unwrap());
    }
    assert!(Path::new(&manual.path).exists());
    assert!(!Path::new(&receipts[0].path).exists());
    assert!(!Path::new(&receipts[1].path).exists());
    assert_eq!(blob_count(&repository), 5); // Three retained WebMs + shared music + vault.
    for receipt in &receipts[2..] { assert!(repository.preview_saved(&receipt.path).unwrap().checksums_valid); }
    repository.restore_saved(&library, &receipts[2].path).unwrap();
    assert_eq!(fs::read(repository.app_data.join("assets/videos/avatar.webm")).unwrap(), b"video-3");
}
#[test]
fn missing_or_corrupt_blobs_never_replace_current_data() {
    for missing in [false, true] {
        let (_dir, repository, library) = fixture();
        let receipt = repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-03T01:00:00.000Z").unwrap().unwrap();
        let hash = format!("{:X}", Sha256::digest(b"video-one"));
        let blob = repository.root.join("共享素材").join(hash);
        if missing { fs::remove_file(blob).unwrap(); } else { fs::write(blob, b"corruption").unwrap(); }
        let original_revision = library.load().unwrap().unwrap().revision;
        assert!(repository.preview_saved(&receipt.path).is_err());
        assert!(repository.restore_saved(&library, &receipt.path).is_err());
        assert_eq!(library.load().unwrap().unwrap().revision, original_revision);
        assert_eq!(fs::read(repository.app_data.join("assets/videos/avatar.webm")).unwrap(), b"video-one");
        assert_eq!(repository.list().unwrap().len(), 1);
    }
}
#[test]
fn corrupt_reference_manifest_stops_retention_and_collection() {
    let (_dir, repository, library) = fixture();
    let first = repository.ensure_automatic(&library, 1, 1, "2026-10-01", "2026-10-01T01:00:00.000Z").unwrap().unwrap();
    fs::write(repository.root.join("corrupt.yiyu-snapshot"), b"not-an-archive").unwrap();
    assert!(repository.ensure_automatic(&library, 1, 1, "2026-10-02", "2026-10-02T01:00:00.000Z").is_err());
    assert!(Path::new(&first.path).exists());
    assert_eq!(blob_count(&repository), 3);
}
#[test]
fn references_reject_traversal_duplicates_and_windows_aliases() {
    let hash = "A".repeat(64);
    for path in ["assets/../outside", "assets/C:/outside", "vaults/CON", "audio/file. ", "assets\\evil", "assets//empty"] {
        assert!(shared::references(&json!({"files":[{"path":path,"sha256":hash,"size":1}]})).is_err());
    }
    assert!(shared::references(&json!({"files":[
        {"path":"assets/one","sha256":hash,"size":1},{"path":"assets/ONE","sha256":hash,"size":1}
    ]})).is_err());
    assert!(shared::references(&json!({"files":[
        {"path":"assets/one","sha256":hash,"size":1},{"path":"assets/one/child","sha256":hash,"size":1}
    ]})).is_err());
}
#[test]
fn saved_backup_access_is_scoped_and_directory_cannot_include_itself() {
    let (dir, repository, library) = fixture();
    let receipt = repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-03T01:00:00.000Z").unwrap().unwrap();
    let outside = dir.path().join("outside.yiyu-snapshot");
    fs::copy(&receipt.path, &outside).unwrap();
    assert!(repository.preview_saved(outside.to_str().unwrap()).is_err());
    let nested = BackupRepository { root: repository.app_data.join("assets/backups"), app_data: repository.app_data.clone() };
    assert!(nested.create(&library, false, "2026-10-03T02:00:00.000Z").is_err());
}
#[test]
fn moved_whole_backup_directory_still_restores() {
    let (dir, repository, library) = fixture();
    let receipt = repository.ensure_automatic(&library, 3, 3, "2026-10-03", "2026-10-03T01:00:00.000Z").unwrap().unwrap();
    let moved = dir.path().join("moved-backups");
    fs::rename(&repository.root, &moved).unwrap();
    let path = moved.join(Path::new(&receipt.path).file_name().unwrap());
    let moved_repository = BackupRepository { root: moved, app_data: repository.app_data.clone() };
    assert!(moved_repository.preview_saved(path.to_str().unwrap()).unwrap().checksums_valid);
    moved_repository.restore_saved(&library, path.to_str().unwrap()).unwrap();
}
#[test]
fn directory_publish_rolls_back_database_and_later_swap_failures() {
    for database_failure in [false, true] {
        let (_dir, repository, _library) = fixture();
        let staging = repository.app_data.join("staging");
        fs::create_dir_all(staging.join("assets")).unwrap();
        fs::write(staging.join("assets/replacement"), b"new").unwrap();
        if !database_failure { fs::create_dir(repository.app_data.join("vaults.restore-old")).unwrap(); }
        let result = restore::publish_directories(&repository.app_data, &staging, || Err("DB_CONFLICT".into()));
        assert!(result.is_err());
        assert_eq!(fs::read(repository.app_data.join("assets/videos/avatar.webm")).unwrap(), b"video-one");
        assert_eq!(fs::read(repository.app_data.join("audio/music.mp3")).unwrap(), b"music");
        assert_eq!(fs::read(repository.app_data.join("vaults/private.vault")).unwrap(), b"encrypted-vault");
    }
}

#[test]
fn copied_nonautomatic_snapshots_keep_their_referenced_media() {
    let (_dir, repository, library) = fixture();
    let first = repository.ensure_automatic(&library, 1, 1, "2026-10-01", "2026-10-01T01:00:00.000Z").unwrap().unwrap();
    let pinned = repository.root.join("保留.yiyu-snapshot");
    fs::copy(&first.path, &pinned).unwrap();
    fs::write(repository.app_data.join("assets/videos/avatar.webm"), b"video-two").unwrap();
    repository.ensure_automatic(&library, 1, 1, "2026-10-02", "2026-10-02T01:00:00.000Z").unwrap();
    assert!(pinned.exists());
    assert_eq!(blob_count(&repository), 4);
    assert!(repository.preview_saved(pinned.to_str().unwrap()).unwrap().checksums_valid);
}
#[test]
fn malformed_checked_library_is_rejected_before_safety_backup_or_file_changes() {
    let (_dir, repository, library) = fixture();
    repository.prepare_root().unwrap();
    let path = repository.root.join("invalid.yiyu-backup");
    let file = fs::File::create(&path).unwrap();
    let mut zip = ZipWriter::new(file);
    let mut checksums = Vec::new();
    let options = SimpleFileOptions::default();
    add_entry(&mut zip, "library.json", b"{}", options, &mut checksums).unwrap();
    add_entry(&mut zip, "manifest.json", br#"{"format":"yiyu-backup","formatVersion":1}"#, options, &mut checksums).unwrap();
    zip.start_file("checksums.sha256", options).unwrap();
    zip.write_all(checksums.join("\n").as_bytes()).unwrap();
    zip.finish().unwrap();
    let revision = library.load().unwrap().unwrap().revision;
    assert!(repository.restore_saved(&library, path.to_str().unwrap()).is_err());
    assert_eq!(library.load().unwrap().unwrap().revision, revision);
    assert_eq!(fs::read_dir(&repository.root).unwrap().count(), 1);
    assert_eq!(fs::read(repository.app_data.join("assets/videos/avatar.webm")).unwrap(), b"video-one");
}
