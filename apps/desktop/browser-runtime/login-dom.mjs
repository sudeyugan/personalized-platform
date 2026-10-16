// Fixed browser-side inspection: boolean native fill state only. Never read
// input values, credential-bearing HTML, cookies, storage or password managers.
export function inspectLogin() {
  const state = status => ({ status, button:null })
  const visible = node => Boolean(node?.isConnected && !node.closest('[hidden],[inert],[aria-hidden="true"]') && node.getClientRects().length && getComputedStyle(node).visibility!=='hidden')
  const challenges = document.querySelectorAll('input[autocomplete="one-time-code"],input[name*="captcha" i],input[name*="otp" i],input[name*="code" i],input[name*="verify" i],iframe[src*="captcha" i],img[src*="captcha" i],[id*="captcha" i],[class*="second-auth"]')
  if([...challenges].some(visible))return state('needs_user')
  const passwords=[...document.querySelectorAll('input[type="password"]')].filter(visible)
  if(!passwords.length)return state('none')
  if(passwords.length!==1)return state('needs_user')
  const password=passwords[0],form=password.form
  if(!form||password.disabled||password.readOnly||password.autocomplete==='new-password')return state('needs_user')
  const accounts=[...form.querySelectorAll('input')].filter(node=>visible(node)&&['text','email'].includes(node.type))
  if(accounts.length!==1||accounts[0].disabled||accounts[0].readOnly)return state('needs_user')
  if([...form.querySelectorAll('input,select,textarea')].some(node=>visible(node)&&![password,accounts[0]].includes(node)&&!['hidden','checkbox','submit','button'].includes(node.type)))return state('needs_user')
  const filled=node=>{
    try{if(node.matches(':autofill')||node.matches(':-webkit-autofill'))return true}catch{/* native fallback */}
    try{if(node.getAttribute('placeholder')?.trim())return !node.matches(':placeholder-shown')}catch{/* native fallback */}
    return node.required&&node.willValidate&&!node.validity.valueMissing
  }
  if(!filled(password)||!filled(accounts[0]))return state('unfilled')
  const buttons=[...form.querySelectorAll('button,input[type="submit"]')].filter(node=>visible(node)&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&/^(?:登\s*[录入]|sign\s*in|log\s*in)$/i.test((node.getAttribute('aria-label')??node.textContent??'').trim()))
  if(buttons.length!==1)return state('needs_user')
  const button=buttons[0]
  try{
    const target=new URL(button.getAttribute('formaction')??form.getAttribute('action')??location.href,document.baseURI)
    const method=(button.getAttribute('formmethod')??form.getAttribute('method')??'get').toLowerCase()
    const destination=button.getAttribute('formtarget')??form.getAttribute('target')??''
    if(method!=='post'||target.protocol!=='https:'||target.origin!==location.origin||target.username||target.password||target.port||!['','_self'].includes(destination))return state('needs_user')
  }catch{return state('needs_user')}
  const rect=button.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y)
  if(x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===button||button.contains(hit)))return state('needs_user')
  return {status:'ready',button}
}
