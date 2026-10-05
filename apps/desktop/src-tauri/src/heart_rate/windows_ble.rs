use super::HeartRateRuntime;
use std::{sync::atomic::{AtomicBool, Ordering}, thread, time::{Duration, Instant}};
use windows::{
    core::{Error, HRESULT, Result},
    Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothLEDevice,
        Advertisement::{BluetoothLEAdvertisementReceivedEventArgs, BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementWatcherStatus, BluetoothLEScanningMode},
        GenericAttributeProfile::{GattCharacteristic, GattCharacteristicProperties, GattCharacteristicUuids, GattClientCharacteristicConfigurationDescriptorValue, GattCommunicationStatus, GattDeviceService, GattServiceUuids, GattValueChangedEventArgs}},
    Foundation::TypedEventHandler,
    Storage::Streams::DataReader,
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
};

struct Apartment;
impl Apartment {
    fn new() -> Result<Self> { unsafe { RoInitialize(RO_INIT_MULTITHREADED)?; } Ok(Self) }
}
impl Drop for Apartment { fn drop(&mut self) { unsafe { RoUninitialize(); } } }

fn unavailable() -> Error { Error::from_hresult(HRESULT(0x80004005u32 as i32)) }

// 每个 Windows 异步调用有期限，取消与旧会话隔离；不阻塞 Tauri IPC/UI。
macro_rules! wait {
    ($operation:expr, $cancel:expr) => {{
        let operation = $operation?;
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            if $cancel.load(Ordering::SeqCst) || Instant::now() > deadline {
                let _ = operation.Cancel();
                return Err(unavailable());
            }
            if operation.Status()?.0 != 0 { break; }
            thread::sleep(Duration::from_millis(50));
        }
        operation.GetResults()?
    }};
}

struct ScanGuard { watcher: BluetoothLEAdvertisementWatcher, token: i64 }
impl Drop for ScanGuard {
    fn drop(&mut self) { let _ = self.watcher.Stop(); let _ = self.watcher.RemoveReceived(self.token); }
}

pub(super) fn scan(runtime: &HeartRateRuntime, generation: u64, cancel: &AtomicBool) -> Result<()> {
    let _apartment = Apartment::new()?;
    let watcher = BluetoothLEAdvertisementWatcher::new()?;
    watcher.SetScanningMode(BluetoothLEScanningMode::Active)?;
    let current = runtime.clone();
    let heart_uuid = GattServiceUuids::HeartRate()?;
    let handler = TypedEventHandler::<BluetoothLEAdvertisementWatcher, BluetoothLEAdvertisementReceivedEventArgs>::new(move |_, args| {
        let Some(args) = args.as_ref() else { return Ok(()); };
        let advertisement = args.Advertisement()?;
        let name = advertisement.LocalName()?.to_string();
        let services = advertisement.ServiceUuids()?;
        let has_heart_rate = (0..services.Size()?).any(|index| services.GetAt(index).ok() == Some(heart_uuid));
        let lower = name.to_lowercase();
        if has_heart_rate || lower.contains("garmin") || lower.contains("forerunner") || lower.contains("265") {
            current.discover(generation, args.BluetoothAddress()?, if name.is_empty() { "心率设备".into() } else { name.chars().take(80).collect() });
        }
        Ok(())
    });
    let token = watcher.Received(&handler)?;
    let _guard = ScanGuard { watcher: watcher.clone(), token };
    watcher.Start()?;
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline && !cancel.load(Ordering::SeqCst) {
        if watcher.Status()? == BluetoothLEAdvertisementWatcherStatus::Aborted { return Err(unavailable()); }
        thread::sleep(Duration::from_millis(100));
    }
    runtime.update(generation, |inner| {
        inner.status.phase = "idle".into();
        inner.status.message = if inner.devices.is_empty() { "未找到设备，请开启手表心率广播后重新扫描" } else { "请选择你的心率设备" }.into();
    });
    Ok(())
}

struct Connection {
    device: BluetoothLEDevice,
    service: Option<GattDeviceService>,
    measurement: Option<(GattCharacteristic, i64)>,
}
impl Drop for Connection {
    fn drop(&mut self) {
        if let Some((characteristic, token)) = &self.measurement {
            let _ = characteristic.RemoveValueChanged(*token);
            let _ = characteristic.WriteClientCharacteristicConfigurationDescriptorAsync(GattClientCharacteristicConfigurationDescriptorValue::None);
        }
        if let Some(service) = &self.service { let _ = service.Close(); }
        let _ = self.device.Close();
    }
}

pub(super) fn connect(runtime: &HeartRateRuntime, generation: u64, cancel: &AtomicBool, address: u64) -> Result<()> {
    let _apartment = Apartment::new()?;
    let device = wait!(BluetoothLEDevice::FromBluetoothAddressAsync(address), cancel);
    let mut connection = Connection { device, service: None, measurement: None };
    let services = wait!(connection.device.GetGattServicesForUuidAsync(GattServiceUuids::HeartRate()?), cancel);
    if services.Status()? != GattCommunicationStatus::Success || services.Services()?.Size()? == 0 { return Err(unavailable()); }
    let service = services.Services()?.GetAt(0)?;
    connection.service = Some(service.clone());
    let characteristics = wait!(service.GetCharacteristicsForUuidAsync(GattCharacteristicUuids::HeartRateMeasurement()?), cancel);
    if characteristics.Status()? != GattCommunicationStatus::Success || characteristics.Characteristics()?.Size()? == 0 { return Err(unavailable()); }
    let characteristic = characteristics.Characteristics()?.GetAt(0)?;
    if !characteristic.CharacteristicProperties()?.contains(GattCharacteristicProperties::Notify) { return Err(unavailable()); }
    let current = runtime.clone();
    let handler = TypedEventHandler::<GattCharacteristic, GattValueChangedEventArgs>::new(move |_, args| {
        let Some(args) = args.as_ref() else { return Ok(()); };
        let buffer = args.CharacteristicValue()?;
        let length = buffer.Length()? as usize;
        if length == 0 || length > 128 { return Ok(()); }
        let mut bytes = vec![0; length];
        DataReader::FromBuffer(&buffer)?.ReadBytes(&mut bytes)?;
        current.receive(generation, &bytes);
        Ok(())
    });
    let token = characteristic.ValueChanged(&handler)?;
    connection.measurement = Some((characteristic.clone(), token));
    if wait!(characteristic.WriteClientCharacteristicConfigurationDescriptorAsync(GattClientCharacteristicConfigurationDescriptorValue::Notify), cancel) != GattCommunicationStatus::Success { return Err(unavailable()); }
    runtime.update(generation, |inner| { inner.status.phase = "connected".into(); inner.status.message = "已连接，等待心率读数".into(); });
    let started = Instant::now();
    while !cancel.load(Ordering::SeqCst) {
        if connection.device.ConnectionStatus()? == BluetoothConnectionStatus::Disconnected && started.elapsed() > Duration::from_secs(3) { return Err(unavailable()); }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}
