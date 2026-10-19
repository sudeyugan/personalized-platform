import { DatabaseSync, backup } from 'node:sqlite'
import {
  openSync,
  closeSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  constants,
} from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export function inspectHub(file) {
  const db = new DatabaseSync(resolve(file), { readOnly: true })
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw Error('数据库完整性检查失败。')
    const meta = db.prepare("SELECT key FROM meta WHERE key IN ('space','owner')").all()
    if (meta.length !== 2) throw Error('不是已初始化的一隅中枢。')
    return {
      devices: db.prepare('SELECT count(*) AS n FROM devices WHERE revoked=0').get().n,
      operations: db.prepare('SELECT count(*) AS n FROM operations').get().n,
    }
  } finally {
    db.close()
  }
}
export async function backupHub(data, destination) {
  const source = join(resolve(data), 'hub.sqlite'),
    target = resolve(destination)
  inspectHub(source)
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  // Reserve exactly this new file; never overwrite an older backup or live DB.
  closeSync(openSync(target, 'wx', 0o600))
  const db = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(db, target)
    return inspectHub(target)
  } finally {
    db.close()
  }
}
export function restoreHub(source, destination) {
  inspectHub(source)
  const directory = resolve(destination)
  if (existsSync(directory)) throw Error('恢复只允许新目录；不会覆盖已有中枢。')
  mkdirSync(directory, { mode: 0o700 })
  const target = join(directory, 'hub.sqlite')
  copyFileSync(resolve(source), target, constants.COPYFILE_EXCL)
  chmodSync(target, 0o600)
  return inspectHub(target)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      data: { type: 'string' },
      file: { type: 'string' },
      to: { type: 'string' },
    },
  })
  try {
    let result
    if (positionals[0] === 'backup' && values.data && values.to)
      result = await backupHub(values.data, values.to)
    else if (positionals[0] === 'restore' && values.file && values.to)
      result = restoreHub(values.file, values.to)
    else if (positionals[0] === 'inspect' && values.file) result = inspectHub(values.file)
    else
      throw Error(
        '用法：maintenance.mjs backup --data 原目录 --to 新备份文件；restore --file 备份 --to 新目录；inspect --file 文件',
      )
    console.log(
      `检查通过：${result.devices} 台有效设备，${result.operations} 条密文操作；未输出凭证或内容。`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : '维护未完成。')
    process.exitCode = 1
  }
}
