export const PET_VERSION_SHORTCUT = 'Control+Alt+A'
export const PET_VERSION_STATUS = 'yiyu:pet-version-shortcut-status'
export const PET_VERSION_REBIND = 'yiyu:pet-version-shortcut-rebind'

export function reservedPetShortcutLabel(value: string) {
  const keys = value.toLowerCase().split('+').map(key => key.trim().replace(/^(commandorcontrol|ctrl)$/, 'control')).sort().join('+')
  if (keys === 'alt+control+q') return 'Ctrl+Alt+Q 已保留给桌宠 / WebM 切换'
  if (keys === 'a+alt+control') return 'Ctrl+Alt+A 已保留给原版 / 2.0 切换'
}
