const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
// Run the production renderer with synthetic meetings; no API or notification transport exists.
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this._text='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  setAttribute(key,value){this.attrs[key]=value;}
  querySelectorAll(){const found=[];for(const child of this.children){if(child.tag==='details'&&child.open)found.push(child);found.push(...child.querySelectorAll());}return found;}
}
const container=new Element('section');
const stream={canAttend:false,meetings:[{id:'synthetic',date:'2026-10-18',topic:'Телесная практика',description:'11:00–14:00 МСК'}]};
const ctx={document:{getElementById:()=>container,createElement:tag=>new Element(tag)},currentProgram:()=>stream,
  accessDate:d=>d,Storage:{isAttended:()=>false}};
vm.createContext(ctx);
const source=fs.readFileSync(path.join(__dirname,'../app/js/app.js'),'utf8');
vm.runInContext(source.slice(source.indexOf('function renderSchedule(){'),source.indexOf('function toggleAttend(')),ctx);
for(const empty of [undefined,null,'','   ','\n\t']){
  stream.meetings[0].prepare=empty;ctx.renderSchedule();
  assert(!container.textContent.includes('Подготовка'));
  assert(!container.textContent.includes('ещё не добавлена'));
  assert(container.textContent.includes('11:00–14:00 МСК'));
}
container.children[1].children[0].open=true;
stream.meetings[0].prepare='  Возьмите плед <без HTML>.  ';ctx.renderSchedule();
assert(container.textContent.includes('ПодготовкаВозьмите плед <без HTML>.'));
assert(container.children[1].children[0].open,'Expanded meeting stays open after redraw');
assert.equal(container.children[1].children[0].children[1].children.at(-1).tag,'p');
console.log('PASS: absent/null/blank preparation omitted; real text retained literally; expanded meeting preserved; no network');
