const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs');
const React=require('react');
const {installAliasResolver,installTsLoader}=require('./testBootstrap.cjs');
const {preview}=require('./auto-summary-test-helpers.cjs');
let state,cursor,effects;
const load=Module._load;
Module._load=function(request,parent,main){
  if(request==='react')return {...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect(fn){effects.push(fn);}};
  if(request==='@/components/ProjectMemoryDiffView')return {__esModule:true,default:()=>null};
  return load.call(this,request,parent,main);
};
installAliasResolver();installTsLoader({jsx:true});
const Modal=require('../components/ProjectMemoryBootstrapModal.tsx').default;
function nodes(value){if(!value||typeof value!=='object')return[];return[value,...[].concat(value.props?.children??[]).flatMap(nodes)];}
function strings(value){if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(strings).join('');return value&&typeof value==='object'?strings(value.props?.children):'';}
test('modal selects topics, uses empty old diff, displays stats/truncation/results and locks every close path while applying',()=>{
  const original=global.window;const listeners=new Map();global.window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  try {
    state=[];cursor=0;effects=[];let applied,cancelled=0;const p=preview();p.stats.threads_truncated=1;
    const props={projectName:'Example',preview:p,isApplying:false,results:null,onApply:keys=>applied=keys,onCancel:()=>cancelled++};
    let tree=Modal(props);effects.forEach(fn=>fn());
    assert.match(strings(tree),/2件のスレッドのうち1件を使用/);assert.match(strings(tree),/一部省略されています/);
    let all=nodes(tree);assert.equal(all.filter(n=>n.type==='input'&&n.props.checked).length,3);
    assert.equal(all.filter(n=>n.props.oldText==='').length,3);
    all.find(n=>n.type==='input').props.onChange();cursor=0;effects=[];tree=Modal(props);
    nodes(tree).find(n=>n.type==='button'&&strings(n).includes('件を作成')).props.onClick();assert.deepEqual(applied,['principles','references']);
    listeners.get('keydown')({key:'Escape',stopPropagation(){}});assert.equal(cancelled,1);
    listeners.clear();cursor=0;effects=[];tree=Modal({...props,isApplying:true});effects.forEach(fn=>fn());
    assert.equal(listeners.has('keydown'),false);assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));
    nodes(tree).find(n=>n.props.style?.zIndex===1100).props.onClick();nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(cancelled,1);
    cursor=0;effects=[];tree=Modal({...props,results:[{topic_key:'overview',status:'applied'},{topic_key:'principles',status:'conflict'},{topic_key:'references',status:'failed',error:'表示用エラー'}]});
    assert.match(strings(tree),/作成済み/);assert.match(strings(tree),/別の操作/);assert.match(strings(tree),/表示用エラー/);assert.ok(nodes(tree).filter(n=>n.type==='input').every(n=>n.props.disabled));
    const sidebar=fs.readFileSync(require.resolve('../components/Sidebar.tsx'),'utf8');assert.match(sidebar,/useAutoSummary/);assert.match(sidebar,/disabled=\{!autoSummary.canGenerate/);assert.match(sidebar,/inert=\{autoSummary.preview !== null\}/);
  }finally{global.window=original;}
});
