use reqwest::{Url, Client, redirect::Policy};
use std::{net::{IpAddr, SocketAddr, ToSocketAddrs}, time::Duration};
use std::sync::{atomic::{AtomicBool, Ordering}, mpsc};

static DNS_BUSY: AtomicBool = AtomicBool::new(false);
struct DnsLease;
impl Drop for DnsLease { fn drop(&mut self) { DNS_BUSY.store(false, Ordering::Release); } }

pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(a == 0 || a == 10 || a == 127 || a >= 224 || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254) || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && (b == 168 || b == 0 || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(ip) => {
            // Only native global unicast; reject mapped/transition/tunnel/reserved ranges.
            let segments = ip.segments();
            (segments[0] & 0xe000) == 0x2000 && !(segments[0] == 0x2001 && (segments[1] < 0x0200 || segments[1] == 0x0db8))
                && segments[0] != 0x2002 && segments[0] != 0x3fff
        }
    }
}

pub fn public_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "PUBLIC_WEB_URL:链接格式无效")?;
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    if raw.len() > 2048 || raw.chars().any(char::is_control) || url.scheme() != "https"
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some()
        || url.fragment().is_some() || !host.contains('.') || host.ends_with('.')
        || host.ends_with(".local") || host.ends_with(".localhost") || host.ends_with(".internal")
        || host.ends_with(".test") || host.ends_with(".invalid")
        || host.parse::<IpAddr>().is_ok() || host.contains(':') {
        return Err("PUBLIC_WEB_URL:只读取公开域名HTTPS链接；账号、端口、片段、IP和本地地址不支持".into());
    }
    for (key, _) in url.query_pairs() {
        let key = key.to_ascii_lowercase();
        if ["token", "secret", "password", "passwd", "authorization", "api_key", "apikey", "access_key", "session", "cookie", "signature", "credential"].iter().any(|item| key.contains(item)) {
            return Err("PUBLIC_WEB_SECRET:不读取带认证或会话参数的链接".into());
        }
    }
    Ok(url)
}

pub fn checked_addresses(addresses: Vec<SocketAddr>) -> Result<Vec<SocketAddr>, String> {
    if addresses.is_empty() || addresses.len() > 64 || addresses.iter().any(|address| !public_ip(address.ip())) {
        return Err("PUBLIC_WEB_ADDRESS:来源没有可安全访问的公共地址".into());
    }
    Ok(addresses)
}

pub async fn client(url: &Url) -> Result<Client, String> {
    let host = url.host_str().ok_or("PUBLIC_WEB_URL:缺少域名")?.to_string();
    let lookup = host.clone();
    let addresses = tauri::async_runtime::spawn_blocking(move || {
        DNS_BUSY.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).map_err(|_| "PUBLIC_WEB_DNS:前次域名解析尚未结束")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let _lease = DnsLease;
            let result = (lookup.as_str(), 443).to_socket_addrs().map(|addresses| addresses.collect::<Vec<_>>());
            let _ = sender.send(result);
        });
        receiver.recv_timeout(Duration::from_secs(5)).map_err(|_| "PUBLIC_WEB_DNS:域名解析超时")?
            .map_err(|_| "PUBLIC_WEB_DNS:域名解析失败")
    }).await.map_err(|_| "PUBLIC_WEB_DNS:域名解析失败")?
        ?;
    let addresses = checked_addresses(addresses)?;
    // Proxy DNS cannot be pinned/validated here. Never forward through a local proxy.
    Client::builder().https_only(true).no_proxy().redirect(Policy::none())
        .resolve_to_addrs(&host, &addresses).referer(false)
        .connect_timeout(Duration::from_secs(5)).timeout(Duration::from_secs(12))
        .user_agent("Yiyu/2.0 public-read")
        .build().map_err(|_| "PUBLIC_WEB_CLIENT:连接初始化失败".into())
}
