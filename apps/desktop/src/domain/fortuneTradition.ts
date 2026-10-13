// 参考长崎诹访神社官方「英文みくじ」的十种吉凶，不复刻原签或未公开的概率。
export const FORTUNE_TRADITION = {
  name: '长崎诹访神社',
  source: 'https://www.osuwasan.jp/omamori/',
  scope: '英文御神签的十种签运',
} as const

export const FORTUNE_GRADES = ['大吉', '吉', '中吉', '小吉', '半吉', '末吉', '转祸为福', '半凶', '凶', '大凶'] as const
export type FortuneGrade = typeof FORTUNE_GRADES[number]

// 一隅原创中文解读；转祸为福描述变化，不作为固定名次或现实预言。
export const FORTUNE_GRADE_NOTES: Record<FortuneGrade, string> = {
  大吉: '顺势而行，也为变化留余地。',
  吉: '平稳向前，珍惜已有的支持。',
  中吉: '已有进展，踏实补上下一步。',
  小吉: '小处见好，不必急求圆满。',
  半吉: '有利与不足并存，先照顾能做的部分。',
  末吉: '暂未明朗，给准备与等待一点时间。',
  转祸为福: '遇阻后调整，变化也可能打开新路。',
  半凶: '局部受阻，先辨清问题与边界。',
  凶: '宜谨慎放缓，减少仓促与勉强。',
  大凶: '宜停步重整，不作灾祸或失败预告。',
}
