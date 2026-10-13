/** Fixed diagnostics only; never export browser errors, URL parameters or account text. */
export function browserFailureCode(error){
  if(error?.name==='TimeoutError')return 'timeout'
  const reason=error instanceof Error?error.message:''
  return ['login','permission','tab_changed','page_pending','page_open','page_access'].includes(reason)?reason:'failed'
}
