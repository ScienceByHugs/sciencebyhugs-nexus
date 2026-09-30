const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/avatar.ts'), 'utf8').replace(/^import .*$/gm, '')
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function setup({removeError=null,urlDelay=null}={}) {
  let user={id:'owner-id',email:'anthony@example.com',user_metadata:{display_name:'Anthony Hugershoff'}}
  let authChanged
  const calls=[]
  const node=()=>({textContent:'',hidden:false,disabled:false,dataset:{},listeners:{},replaceChildren(){this.textContent=''},append(image){this.image=image},addEventListener(event,fn){this.listeners[event]=fn},dispatchEvent(){}})
  const avatar=node(),choose=node(),remove=node(),file=node(),status=node(),panel=node()
  const nodes={'[data-photo-file]':file,'[data-photo-status]':status,'[data-photo-choose]':choose,'[data-photo-remove]':remove}
  panel.querySelector=key=>nodes[key]
  const storage={async createSignedUrl(path){calls.push(['url',path]);if(urlDelay) await urlDelay;return {data:{signedUrl:'https://signed.example/avatar?token=private'},error:null}},async remove(paths){calls.push(['remove',...paths]);return {error:removeError}}}
  const context={exports:{},Date,Error,Event,AbortController,document:{querySelector:()=>panel,querySelectorAll:key=>key==='[data-profile-avatar]'?[avatar]:key==='[data-photo-remove]'?[remove]:[choose],createElement:()=>node()},supabase:{storage:{from(name){assert.equal(name,'avatars');return storage}},auth:{async getSession(){return {data:{session:user?{user}:null}}},onAuthStateChange(fn){authChanged=fn}}}}
  vm.runInNewContext(code,context)
  return {api:context.exports,avatar,choose,remove,status,calls,signout(){user=null;authChanged('SIGNED_OUT',null)}}
}
test('initials handle full name, whitespace, single name and empty value',()=>{
  const {api}=setup(); assert.equal(api.initials(' Anthony  Hugershoff '),'AH');assert.equal(api.initials('Anthony'),'AN');assert.equal(api.initials(''),'?')
})
test('crop stays inside portrait and landscape sources at maximum zoom and positions',()=>{
  const {api}=setup()
  for(const [w,h] of [[600,1000],[1000,600]]) for(const zoom of [1,2,3,100]) for(const position of [-1,0,0.5,1,2]){
    const c=api.cropRect(w,h,zoom,position,position)
    assert.ok(c.side>0 && c.side<=Math.min(w,h));assert.ok(c.x>=0 && c.y>=0);assert.ok(c.x+c.side<=w && c.y+c.side<=h)
  }
  assert.equal(api.cropRect(1000,600,1,0.5,0.5).x,200)
})
test('unsupported, empty and oversized files rejected before decoding or storage',()=>{
  const {api}=setup()
  for(const file of [{type:'image/svg+xml',size:100},{type:'image/jpeg',size:0},{type:'image/png',size:11*1024*1024}]) assert.throws(()=>api.validatePhoto(file))
  assert.doesNotThrow(()=>api.validatePhoto({type:'image/webp',size:1024}))
})
test('private photo uses authenticated owner path, removal restores initials',async()=>{
  const s=setup();await s.api.bindAvatars();assert.deepEqual(s.calls,[['url','owner-id/avatar.jpg']]);assert.equal(s.remove.hidden,false)
  await s.remove.listeners.click();assert.deepEqual(s.calls[1],['remove','owner-id/avatar.jpg']);assert.equal(s.avatar.textContent,'AH');assert.equal(s.remove.hidden,true);assert.equal(s.status.textContent,'Photo removed.')
})
test('failed removal keeps photo and allows retry',async()=>{
  const s=setup({removeError:new Error('offline')});await s.api.bindAvatars();await s.remove.listeners.click();assert.equal(s.remove.hidden,false);assert.equal(s.remove.disabled,false);assert.match(s.status.textContent,/try again/)
})
test('late signed URL result cannot restore photo after logout',async()=>{
  let release;const delay=new Promise(resolve=>{release=resolve});const s=setup({urlDelay:delay});const loading=s.api.bindAvatars();await new Promise(resolve=>setImmediate(resolve));s.signout();release();await loading;assert.equal(s.avatar.textContent,'?');assert.equal(s.remove.hidden,true)
})
