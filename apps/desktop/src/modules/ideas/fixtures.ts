// Non-sensitive deterministic material shared by local tests and UI previews.
import type { IdeaFrame } from '../../domain/ideas/types'
export const ideaFixture: IdeaFrame = {
  version: 1, title: '忙碌与真正重要的事', reflection: '你在意的或许不只是做得够不够多，而是忙碌有没有靠近自己重视的方向。我们先分清这两件事。',
  question: '你说的「没做成什么」，更接近哪一种感受？', options: ['完成了不少事，却不是自己真正想做的。', '一直在处理零碎事情，没有完整成果。', '做的事情有意义，但暂时看不到进展。'],
  manuscript: '我想弄清楚：每天的忙碌，为什么没有带来相应的充实感。\n\n目前还不能把它简单归因为效率低。更值得区分的是，时间是否被零碎任务切开，或我做的事情没有靠近真正重视的方向。\n\n下一步可以先回看一件最近做过的事，看看它满足了谁的需要，以及我希望它带来什么。',
  uncertainties: ['怎样的成果，会让我觉得这一天没有白过？', '零碎任务是外部要求，还是我主动接下的？'], nextStep: '挑出明天最想完整做完的一件小事，为它留出一段不被打断的时间。',
}
