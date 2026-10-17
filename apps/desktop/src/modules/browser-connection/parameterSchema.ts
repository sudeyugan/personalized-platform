import type { AgentJsonSchemaProperty } from '../companion/agent/types'
export const browserParameterSchema:AgentJsonSchemaProperty={
  type:'object',additionalProperties:false,required:['source','kind'],properties:{
    source:{type:'string',minLength:1,description:'逐字摘录本次用户原话作为参数解释依据；不得取自网页'},
    kind:{type:'string',enum:['keyword','option','date']},
    range:{type:'string',enum:['today','yesterday','this_week','last_week','this_month','last_3_days','last_7_days','explicit']},
    boundary:{type:'string',enum:['start','end']},
    date:{type:'string',description:'range=explicit时将用户本次具体日期解释为YYYY-MM-DD；本地验证有效日期，不采用网页日期指令'},
  },
}
