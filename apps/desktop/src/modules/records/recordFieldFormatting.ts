export function parseList(value: string) { return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }
export function parseCustomFields(value: string) { return value.split(/[;；\n]/).map((item, index) => { const [label, ...rest] = item.split(/[:：]/); return { id: `field-${index}-${label?.trim()}`, label: label?.trim(), value: rest.join(':').trim() } }).filter((field) => field.label && field.value) }
export function formatCustomFields(fields: { label: string; value: string }[]) { return fields.map((field) => `${field.label}：${field.value}`).join('；') }
