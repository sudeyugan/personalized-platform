import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {observeControls,actOnControl} from './controls.js'
beforeEach(()=>{
  vi.stubGlobal('location',{origin:'https://example.com',href:'https://example.com/home'})
  vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden]')?[]:[{}]})
  document.body.innerHTML='<a href="https://example.com/notices">学校通知</a><button>未读</button><button>删除</button><a href="https://other.example.com/">其他账号</a><a href="https://example.com/?token=secret">资料</a><form method="post"><button>全部</button><input type="password" value="SECRET"></form>'
})
afterEach(()=>{document.body.innerHTML='';delete globalThis.__yiyuBrowserObservation;vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('program-owned isolated observation references',()=>{
  it('offers only same-site read navigation, no credentials/writes/arbitrary selectors',()=>{
    const result=observeControls();expect(result.controls.map(item=>item.name)).toEqual(['学校通知','未读'])
    expect(JSON.stringify(result)).not.toMatch(/SECRET|token|https|selector|href/)
    expect(result.controls.every(item=>item.id!==item.name)).toBe(true)
  })
  it('consumes each reference and rejects changed labels or detached elements',()=>{
    let observed=observeControls(),button=observed.controls.find(item=>item.name==='未读');const click=vi.fn();document.querySelectorAll('button')[0].addEventListener('click',click)
    const args={observationId:observed.observationId,elementId:button.id,operation:'invoke'}
    expect(actOnControl(args).actionStatus).toBe('dispatched');expect(click).toHaveBeenCalledOnce();expect(actOnControl(args).actionStatus).toBe('stale')
    observed=observeControls();button=observed.controls.find(item=>item.name==='未读');document.querySelectorAll('button')[0].textContent='删除'
    expect(actOnControl({observationId:observed.observationId,elementId:button.id,operation:'invoke'}).actionStatus).toBe('stale');expect(click).toHaveBeenCalledOnce()
  })
  it('does not use old observations across navigation/base/target changes',()=>{
    const observed=observeControls(),link=observed.controls[0];document.querySelector('a').target='_blank'
    expect(actOnControl({observationId:observed.observationId,elementId:link.id,operation:'invoke'}).actionStatus).toBe('stale')
    const next=observeControls();location.href='https://example.com/other'
    expect(actOnControl({observationId:next.observationId,elementId:next.controls[0].id,operation:'invoke'}).actionStatus).toBe('stale')
  })
  it('fills only a GET same-site search without reading input values',()=>{
    document.body.innerHTML='<form method="get" action="https://example.com/search"><input type="search" aria-label="站内搜索"></form>'
    const submit=vi.fn();document.querySelector('form').requestSubmit=submit
    const observed=observeControls();expect(observed.controls).toHaveLength(1)
    expect(actOnControl({observationId:observed.observationId,elementId:observed.controls[0].id,operation:'search',query:'申请截止'}).actionStatus).toBe('dispatched');expect(submit).toHaveBeenCalledOnce()
    document.querySelector('form').method='post';expect(observeControls().controls).toHaveLength(0)
    document.querySelector('form').method='get';document.querySelector('form').insertAdjacentHTML('beforeend','<textarea>PRIVATE-DRAFT</textarea>')
    expect(observeControls().controls).toHaveLength(0)
  })
})
