// Read-only local compatibility probe; never part of the default test gate.
// Run manually with a playing QQ Music session. No track titles or artwork are printed.
use super::{MusicRuntime, system};
use std::sync::atomic::Ordering;

#[test]
#[ignore]
fn qq_music_read_only_probe() {
    let runtime = MusicRuntime::default();
    runtime.enabled.store(true, Ordering::SeqCst);
    let mut cache = None;
    let first = system::snapshot(&mut cache, &runtime, 0, None).expect("Windows媒体接口读取失败");
    let Some(first) = first else { panic!("没有正在提供媒体信息的QQ音乐会话"); };
    assert!(!first.title.trim().is_empty());
    assert!(first.duration_ms > 0 && first.position_ms <= first.duration_ms);
    if let Some(cover) = &first.cover { assert!(cover.starts_with("data:image/") && cover.len() <= 720000); }
    std::thread::sleep(std::time::Duration::from_millis(500));
    let second = system::snapshot(&mut cache, &runtime, 0, None).expect("复读失败").expect("会话已结束");
    assert!(second.position_ms <= second.duration_ms);
    println!("QQ Music: metadata=true, timeline=true, cover={}, playing={}, controls=advertised; no playback commands sent", first.cover.is_some(), first.playing);
    runtime.enabled.store(false, Ordering::SeqCst);
}
