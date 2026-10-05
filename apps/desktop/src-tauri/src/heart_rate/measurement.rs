/// Bluetooth SIG Heart Rate Measurement 0x2A37. 不采集 RR、能量或其他健康指标。
pub(super) fn parse(bytes: &[u8]) -> Option<u16> {
    let flags = *bytes.first()?;
    if flags & 0b100 != 0 && flags & 0b10 == 0 { return None; }
    let bpm = if flags & 1 != 0 {
        u16::from_le_bytes([*bytes.get(1)?, *bytes.get(2)?])
    } else { *bytes.get(1)? as u16 };
    let mut offset = if flags & 1 != 0 { 3 } else { 2 };
    if flags & 0b1000 != 0 {
        bytes.get(offset + 1)?;
        offset += 2;
    }
    if flags & 0b10000 != 0 {
        let remaining = bytes.len().checked_sub(offset)?;
        if remaining < 2 || remaining % 2 != 0 { return None; }
    }
    (bpm > 0).then_some(bpm)
}

#[cfg(test)]
mod tests {
    use super::parse;
    #[test]
    fn standard_eight_and_sixteen_bit_readings() {
        assert_eq!(parse(&[0, 72]), Some(72));
        assert_eq!(parse(&[1, 44, 1]), Some(300));
        assert_eq!(parse(&[6, 85]), Some(85));
    }
    #[test]
    fn reject_truncation_zero_and_no_contact() {
        for data in [&[][..], &[0], &[1, 72], &[0, 0], &[4, 72], &[8, 72], &[16, 72], &[16, 72, 0], &[16, 72, 0, 0, 0]] { assert_eq!(parse(data), None); }
        assert_eq!(parse(&[8, 72, 0, 0]), Some(72));
        assert_eq!(parse(&[16, 72, 0, 0]), Some(72));
        assert_eq!(parse(&[24, 72, 0, 0, 0, 0]), Some(72));
    }
}
