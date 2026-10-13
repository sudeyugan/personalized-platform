//! Pure local utterance boundaries. Not a speaker identity decision or a VAD model.
const FRAME: usize = 160; // 10 ms at 16 kHz
pub(super) fn speaker_segment(samples: &[f32]) -> &[f32] {
    let levels: Vec<f32> = samples.chunks(FRAME).map(|frame| (frame.iter().map(|v| v*v).sum::<f32>()/frame.len() as f32).sqrt()).collect();
    let peak=levels.iter().copied().fold(0.0f32,f32::max);
    let threshold=(peak*0.08).clamp(0.0015,0.006);
    let Some(first)=levels.iter().position(|level| *level>=threshold) else{return &samples[..0]};
    let last=levels.iter().rposition(|level| *level>=threshold).unwrap();
    // Keep quiet consonants and natural onset/offset; never concatenate gaps.
    &samples[first.saturating_sub(10)*FRAME..((last+16)*FRAME).min(samples.len())]
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn removes_standby_silence_but_keeps_word_and_margins(){
        let mut audio=vec![0.0001;64_000];audio[32_000..41_600].fill(0.08);
        let segment=speaker_segment(&audio);assert_eq!(segment.len(),13_600);assert!(segment.len()<audio.len());assert!(segment.contains(&0.08));
    }
    #[test] fn silence_is_not_voice_and_boundary_words_are_not_clipped(){
        assert!(speaker_segment(&vec![0.0;32_000]).is_empty());assert!(speaker_segment(&[]).is_empty());
        let audio=vec![0.02;8000];assert_eq!(speaker_segment(&audio),audio.as_slice());
    }
    #[test] fn does_not_stitch_separate_speakers_or_remove_midword_gaps(){
        let mut audio=vec![0.0;32_000];audio[4000..8000].fill(0.03);audio[16_000..20_000].fill(0.04);
        let segment=speaker_segment(&audio);assert!(segment.len()>16_000);assert!(segment.windows(4000).any(|frame|frame.iter().all(|v|*v==0.0)));
    }
}
