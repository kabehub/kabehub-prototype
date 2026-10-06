const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const React = require('react');
const { installAliasResolver, installTsLoader } = require('./testBootstrap.cjs');
let slots=[],cursor=0,deps=[],cleanups=[],effects=[];
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,n)=>v!==deps[i][n]))effects.push(()=>{cleanups[i]?.();deps[i]=next;cleanups[i]=fn();});},
};
const load=Module._load;
Module._load=function(request,parent,main){return request==='react'?hooks:load.call(this,request,parent,main);};
installAliasResolver();installTsLoader({jsx:true});
const Modal=require('../components/ProjectMemoryDeleteConfirmModal.tsx').default;
Module._load=load;
const nodes=root=>!root||typeof root!=='object'?[]:[root,...React.Children.toArray(root.props?.children).flatMap(nodes)];
const text=root=>typeof root==='string'||typeof root==='number'?String(root):Array.isArray(root)?root.map(text).join(''):root&&typeof root==='object'?text(root.props?.children):'';
const checks=tree=>nodes(tree).filter(n=>n.type==='input');
const buttons=tree=>nodes(tree).filter(n=>n.type==='button');
const row=(status='not_promoted')=>({id:'topic',topic_key:'overview',revision:3,chars:2,include_in_chat:false,promotion:{status}});
const flush=()=>{const todo=effects;effects=[];todo.forEach(fn=>fn());};
test('delete acknowledgement, snapshot reset, Lore notice, focus and submission locks',()=>{
  const originals={window:global.window,document:global.document,HTMLElement:global.HTMLElement};
  let cancelled=0,submitted=0;const listeners=new Map();
  class Element {isConnected=true;focus(){global.document.activeElement=this;}}
  global.HTMLElement=Element;const previous=new Element();
  global.document={activeElement:previous,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  global.window={addEventListener:(name,fn,capture)=>{assert.equal(capture,true);listeners.set(name,fn);},removeEventListener:name=>listeners.delete(name)};
  const render=(confirm,submitting=false,error=null)=>{cursor=0;return Modal({confirm,submitting,error,onCancel:()=>cancelled++,onConfirm:()=>submitted++});};
  const event=(key,extra={})=>({key,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
  try {
    let tree=render([row()]);
    const dialog=nodes(tree).find(n=>n.props.role==='alertdialog'), dialogElement=new Element(),cancel=new Element(),last=new Element();
    dialogElement.contains=target=>[cancel,last,dialogElement].includes(target);dialogElement.querySelectorAll=()=>[cancel,last];
    dialog.props.ref.current=dialogElement;buttons(tree)[0].props.ref.current=cancel;flush();
    assert.equal(global.document.activeElement,cancel);
    assert.ok(text(tree).includes('この操作ではProject Memoryだけを削除し、Loreは削除しません'));
    assert.ok(text(tree).includes('必要なら事前にDLでバックアップできます'));
    assert.ok(text(tree).includes('rev.3 · 2字'));assert.equal(checks(tree).length,1);assert.equal(buttons(tree)[1].props.disabled,true);
    buttons(tree)[1].props.onClick();assert.equal(submitted,0);
    checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=render([row()]);flush();
    assert.equal(buttons(tree)[1].props.disabled,false);buttons(tree)[1].props.onClick();assert.equal(submitted,1);
    tree=render([{...row(),revision:4}]);assert.equal(checks(tree)[0].props.checked,false,'selection changes reset before effect');flush();
    for(const status of ['current','stale']) {
      const confirm=[{...row(status),include_in_chat:true}];tree=render(confirm);flush();tree=render(confirm);
      assert.equal(checks(tree).length,2);assert.ok(text(tree).includes('Loreは削除しません'));
      assert.ok(text(tree).includes(status==='current'?'昇格済み':'更新あり（過去revisionはLore昇格済み）'));
      assert.ok(text(tree).includes('チャット注入中'));assert.ok(text(tree).includes('次の送信からチャットに注入されなくなります'));
      assert.ok(text(tree).includes('旧Loreは /memory で確認・アーカイブできます。'));
      checks(tree)[0].props.onChange({currentTarget:{checked:true}});tree=render(confirm);assert.equal(buttons(tree)[1].props.disabled,true);
      checks(tree)[1].props.onChange({currentTarget:{checked:true}});tree=render(confirm);assert.equal(buttons(tree)[1].props.disabled,false);
      tree=render(confirm,true,'retry error');flush();assert.ok(text(tree).includes('retry error'));
      assert.ok([...checks(tree),...buttons(tree)].every(n=>n.props.disabled));
      const before=cancelled, submitBefore=submitted;
      buttons(tree)[0].props.onClick();buttons(tree)[1].props.onClick();nodes(tree).find(n=>n.props.style?.zIndex===1200).props.onClick();
      const escape=event('Escape');listeners.get('keydown')(escape);assert.equal(escape.stopped,true);assert.equal(cancelled,before);assert.equal(submitted,submitBefore);
      dialogElement.querySelectorAll=()=>[];listeners.get('keydown')(event('Tab'));assert.equal(global.document.activeElement,dialogElement);
      listeners.get('focusin')({target:previous});assert.equal(global.document.activeElement,dialogElement);
      render(null);flush();tree=render(confirm);flush();tree=render(confirm);assert.ok(checks(tree).every(n=>!n.props.checked),'reopen resets');
    }
    dialogElement.querySelectorAll=()=>[cancel,last];global.document.activeElement=last;
    listeners.get('keydown')(event('Tab'));assert.equal(global.document.activeElement,cancel);
    listeners.get('keydown')(event('Tab',{shiftKey:true}));assert.equal(global.document.activeElement,last);
    listeners.get('focusin')({target:previous});assert.equal(global.document.activeElement,cancel);
    const before=cancelled;listeners.get('keydown')(event('Escape',{isComposing:true}));assert.equal(cancelled,before);
    listeners.get('keydown')(event('Escape'));assert.equal(cancelled,before+1);
    render(null);flush();assert.equal(listeners.size,0);
    assert.equal(global.document.activeElement,previous,'restores focus');
  } finally {Object.assign(global,originals);}
});
