import { FolderKey, MonitorCog, ShieldAlert, Square, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComputerCapability, ComputerGrant } from '../../domain/models'
import { createComputerService } from '../../infrastructure/computerService'
import { useLibraryStore } from '../../state/useLibraryStore'

const capabilityOptions: { value: ComputerCapability; label: string }[] = [
  { value: 'applications', label: '打开应用与链接' },
  { value: 'windows', label: '查看与控制窗口' },
  { value: 'screen_capture', label: '截图' },
  { value: 'screen_record', label: '录屏' },
  { value: 'input', label: '鼠标与键盘输入' },
  { value: 'clipboard_read', label: '读取剪贴板' },
  { value: 'clipboard_write', label: '写入剪贴板' },
  { value: 'file_read', label: '读取文件' },
  { value: 'file_write', label: '写入文件' },
  { value: 'file_delete', label: '删除文件' },
  { value: 'process_run', label: '运行程序' },
  { value: 'process_stop', label: '停止受管程序' },
  { value: 'shell', label: 'PowerShell' },
  { value: 'notifications', label: '系统通知' },
]

const pathCapabilities = new Set<ComputerCapability>(['file_read', 'file_write', 'file_delete'])
const programCapabilities = new Set<ComputerCapability>(['process_run', 'process_stop', 'shell'])
const capabilityName = (value: ComputerCapability) => capabilityOptions.find((item) => item.value === value)?.label ?? value

export function ComputerCapabilitySettings() {
  const { data, setCompanionComputer } = useLibraryStore()
  const settings = data.companion.computer
  const [capability, setCapability] = useState<ComputerCapability>('file_read')
  const [target, setTarget] = useState('D:\\coding')
  const [mode, setMode] = useState<ComputerGrant['mode']>('allow')
  const [message, setMessage] = useState('电脑能力默认关闭；开启后仍由权限层逐项检查。')
  const targetKind = useMemo<ComputerGrant['targetKind']>(() => {
    if (pathCapabilities.has(capability)) return 'directory'
    if (programCapabilities.has(capability)) return 'program'
    return 'global'
  }, [capability])

  const updateCapability = (next: ComputerCapability) => {
    setCapability(next)
    if (pathCapabilities.has(next)) setTarget('D:\\coding')
    else if (programCapabilities.has(next)) setTarget('')
    else setTarget('*')
  }
  const addGrant = () => {
    const normalized = targetKind === 'global' ? '*' : target.trim()
    if (!normalized) { setMessage('请填写要授权的目录或程序。'); return }
    setCompanionComputer({
      grants: [...settings.grants, {
        id: crypto.randomUUID(),
        capability,
        targetKind,
        target: normalized,
        mode,
        createdAt: new Date().toISOString(),
      }],
    })
    setMessage('已添加：' + capabilityName(capability) + ' · ' + normalized)
  }
  const detectFfmpeg = async () => {
    try {
      const path = await createComputerService(settings).detectFfmpeg()
      if (!path) { setMessage('没有自动找到 FFmpeg，请手动填写 ffmpeg.exe 路径。'); return }
      setCompanionComputer({ ffmpegPath: path })
      setMessage('已找到 FFmpeg：' + path)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'FFmpeg 探测失败')
    }
  }
  const stopAll = async () => {
    try {
      const result = await createComputerService(settings).stopAll()
      setMessage('紧急停止已执行：' + JSON.stringify(result))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '紧急停止失败')
    }
  }

  return <details className="permission-scope-group computer-capability-settings">
    <summary><span>电脑能力</span><small>{settings.enabled ? `已开启 · ${settings.grants.length} 条规则` : '未开启'}</small></summary>
    <div className="computer-capability-body">
      <div className="permission-list computer-permission-list">
        <div>
          <MonitorCog />
          <span><strong>允许操作这台电脑</strong><small>所有操作仍经过能力、目标与风险检查</small></span>
          <button aria-label="允许小鱼操作电脑" aria-pressed={settings.enabled} className={settings.enabled ? 'switch on' : 'switch'} onClick={() => setCompanionComputer({ enabled: !settings.enabled })}><i /></button>
        </div>
        {settings.enabled && <>
          <label className="permission-policy-row">
            <MonitorCog />
            <span><strong>默认权限模式</strong><small>长期规则与高风险确认仍优先于默认模式</small></span>
            <select value={settings.profile} onChange={(event) => setCompanionComputer({ profile: event.target.value as typeof settings.profile })}><option value="trusted_workstation">受信任工作站</option><option value="standard">标准</option><option value="custom">仅按规则</option></select>
          </label>
          <div>
            <Video />
            <span><strong>后台事务提醒</strong><small>隐藏到托盘后继续提醒；提前 {settings.reminderLeadMinutes} 分钟</small></span>
            <button aria-label="后台事务提醒" aria-pressed={settings.backgroundReminders} className={settings.backgroundReminders ? 'switch on' : 'switch'} onClick={() => setCompanionComputer({ backgroundReminders: !settings.backgroundReminders })}><i /></button>
          </div>
          {settings.backgroundReminders && <label className="permission-policy-row computer-reminder-lead"><Video /><span><strong>提醒提前量</strong><small>可在事务开始前 0–1440 分钟提醒</small></span><input type="number" min={0} max={1440} value={settings.reminderLeadMinutes} onChange={(event) => setCompanionComputer({ reminderLeadMinutes: Math.max(0, Math.min(1440, Number(event.target.value) || 0)) })} /></label>}
        </>}
      </div>

      {settings.enabled && <>
        <details className="permission-scope-group computer-settings-group">
          <summary><span>录屏与安全</span><small>{settings.ffmpegPath ? 'FFmpeg 已配置' : '待配置'}</small></summary>
          <div className="computer-section-body">
            <label className="permission-policy-row computer-control-row"><Video /><span><strong>FFmpeg</strong><small>用于截图与录屏，可自动探测 D 盘</small></span><span className="computer-inline"><input value={settings.ffmpegPath} placeholder="D:\\ffmpeg\\bin\\ffmpeg.exe" onChange={(event) => setCompanionComputer({ ffmpegPath: event.target.value })} /><button type="button" onClick={() => void detectFfmpeg()}>自动查找</button></span></label>
            <label className="permission-policy-row computer-control-row"><FolderKey /><span><strong>录制目录</strong><small>留空时保存到“视频\一隅录制”</small></span><input value={settings.recordingDirectory} placeholder="使用默认目录" onChange={(event) => setCompanionComputer({ recordingDirectory: event.target.value })} /></label>
            <label className="permission-policy-row computer-control-row"><ShieldAlert /><span><strong>紧急停止快捷键</strong><small>中止小鱼启动的录屏和受管程序</small></span><select value={settings.emergencyShortcut} onChange={(event) => setCompanionComputer({ emergencyShortcut: event.target.value })}><option value="CommandOrControl+Alt+Escape">Ctrl + Alt + Esc</option><option value="CommandOrControl+Shift+Escape">Ctrl + Shift + Esc</option><option value="CommandOrControl+Alt+S">Ctrl + Alt + S</option></select></label>
            <button className="computer-stop-button" onClick={() => void stopAll()}><Square size={13} />立即停止电脑操作</button>
          </div>
        </details>

        <details className="permission-scope-group computer-settings-group">
          <summary><span>目录与程序授权</span><small>{settings.grants.length ? `${settings.grants.length} 条` : '按需询问'}</small></summary>
          <div className="computer-section-body computer-grant-panel">
            <div className="computer-grant-editor">
              <label><span>能力</span><select value={capability} onChange={(event) => updateCapability(event.target.value as ComputerCapability)}>{capabilityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label><span>规则</span><select value={mode} onChange={(event) => setMode(event.target.value as ComputerGrant['mode'])}><option value="allow">允许</option><option value="ask">每次询问</option><option value="deny">禁止</option></select></label>
              <label className="computer-grant-target"><span>{targetKind === 'directory' ? '目录' : targetKind === 'program' ? '程序' : '范围'}</span><input disabled={targetKind === 'global'} value={targetKind === 'global' ? '*' : target} onChange={(event) => setTarget(event.target.value)} placeholder={targetKind === 'directory' ? 'D:\\coding' : '程序完整路径或名称'} /></label>
              <button className="ghost-button" onClick={addGrant}>添加规则</button>
            </div>
            <div className="computer-grant-list">{settings.grants.map((grant) => <div key={grant.id}><span><strong>{capabilityName(grant.capability)}</strong><small>{grant.mode === 'allow' ? '允许' : grant.mode === 'deny' ? '禁止' : '询问'} · {grant.target}</small></span><button title="移除规则" onClick={() => setCompanionComputer({ grants: settings.grants.filter((item) => item.id !== grant.id) })}>移除</button></div>)}{!settings.grants.length && <p>还没有长期规则。文件、程序与 PowerShell 会在需要时逐次询问。</p>}</div>
          </div>
        </details>
      </>}
      <p className="computer-status"><ShieldAlert size={13} />{message}</p>
    </div>
  </details>
}