import { FORTUNE_GRADES, FORTUNE_GRADE_NOTES, FORTUNE_TRADITION } from '../../domain/fortuneTradition'

export function FortuneReference() {
  return <details className="fortune-reference">
    <summary>签运参考</summary>
    <p>参考{FORTUNE_TRADITION.name}{FORTUNE_TRADITION.scope}；中文签文为一隅原创，并非神社原签或现实预测。</p>
    <dl>{FORTUNE_GRADES.map((grade) => <div key={grade}><dt>{grade}</dt><dd>{FORTUNE_GRADE_NOTES[grade]}</dd></div>)}</dl>
    <p>“转祸为福”表示变化，不作为固定名次。每支签等机会抽取，不复刻神社未公开的比例。</p>
    <a href={FORTUNE_TRADITION.source} target="_blank" rel="noreferrer">查看神社官方说明 ↗</a>
  </details>
}
