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
function nodes(value){if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=='object')return[];return[value,...[].concat(value.props?.children??[]).flatMap(nodes)];}
function strings(value){if(typeof value==='string'||typeof value==='number')return String(value);if(Array.isArray(value))return value.map(strings).join('');return value&&typeof value==='object'?strings(value.props?.children):'';}

test('empty topic notes show reasons below topics without changing selection or apply counts',()=>{
  const reasons={
    principles:'この会話の範囲では、Projectでの作業や応答の進め方についてあなたが明示した恒常的な指示が見つからなかったため、作成案はありません',
    other:'この会話の範囲では、根拠となる記述が見つからなかったため、作成案はありません',
  };
  const omitted='古いuser発言は使用していないため、そこに含まれている可能性があります';
  for(const empty of [[],['principles'],['overview','current-work','principles'],['references']]){
    for(const available of [2,5]){
      state=[];cursor=0;effects=[];let applied;
      const p=preview();p.empty_topic_keys=empty;p.topics=p.topics.filter(t=>!empty.includes(t.topic_key));p.stats.user_messages_available=available;
      const props={projectName:'Example',preview:p,isApplying:false,results:null,onApply:keys=>applied=keys,onCancel(){}};
      let tree=Modal(props),all=nodes(tree),text=strings(tree);
      assert.equal(text.includes('作成案がないtopic'),empty.length>0);
      assert.equal(text.includes(omitted),empty.length>0&&available>2);
      const note=all.find(n=>n.type==='section'&&strings(n).includes('作成案がないtopic'));
      if(empty.length){
        const lines=nodes(note).filter(n=>n.type==='p').map(strings);
        assert.deepEqual(lines,[...empty.map(key=>`${key}: ${key==='principles'?reasons.principles:reasons.other}`),...(available>2?[omitted]:[])]);
        assert.equal(nodes(note).filter(n=>n.type==='input').length,0);
        const sections=all.filter(n=>n.type==='section');assert.equal(sections.at(-1),note);
      }
      assert.equal(all.filter(n=>n.type==='input'&&n.props.checked).length,p.topics.length);
      let button=all.find(n=>n.type==='button'&&strings(n).includes('件を作成'));
      assert.equal(strings(button),`選択した${p.topics.length}件を作成`);
      button.props.onClick();assert.deepEqual(applied,p.topics.map(t=>t.topic_key));
      all.find(n=>n.type==='input').props.onChange();cursor=0;effects=[];tree=Modal(props);
      button=nodes(tree).find(n=>n.type==='button'&&strings(n).includes('件を作成'));
      assert.equal(strings(button),`選択した${p.topics.length-1}件を作成`);
      cursor=0;effects=[];tree=Modal({...props,results:p.topics.map(t=>({topic_key:t.topic_key,status:'applied'}))});
      assert.equal(strings(tree).includes('作成案がないtopic'),empty.length>0);
    }
  }
});

test('modal accepts prompt v7 and allows topic selection and apply',()=>{
  state=[];cursor=0;effects=[];let applied;
  const tree=Modal({projectName:'Example',preview:{...preview(),prompt_version:7},isApplying:false,results:null,
    onApply:keys=>applied=keys,onCancel(){}});
  const button=nodes(tree).find(n=>n.type==='button'&&strings(n).includes('件を作成'));
  assert.equal(button.props.disabled,false);button.props.onClick();
  assert.deepEqual(applied,['overview','principles','references']);
});
test('modal selects topics, uses empty old diff, displays stats/truncation/results and locks every close path while applying',()=>{
  const original=global.window;const listeners=new Map();global.window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  try {
    state=[];cursor=0;effects=[];let applied,cancelled=0;const p=preview();p.stats.threads_truncated=1;p.stats.user_messages_available=4;
    const props={projectName:'Example',preview:p,isApplying:false,results:null,onApply:keys=>applied=keys,onCancel:()=>cancelled++};
    let tree=Modal(props);effects.forEach(fn=>fn());
    assert.match(strings(tree),/2件のスレッドのうち1件を使用/);assert.match(strings(tree),/古いuser発言2件は使用していません/);
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

test('thread coverage wording stays fixed; user coverage and independent omission/cut warnings are precise',()=>{
  for (const [included, eligible, threadsCut, messagesCut, x, y] of [
    [1,3,0,0,2,2], [1,3,1,0,2,5], [1,3,1,1,2,2], [1,3,1,2,2,3000],
    [3,3,0,0,6,6], [3,3,1,0,6,9], [3,3,1,0,6,6],
  ]) {
    state=[];cursor=0;effects=[];
    const p=preview();Object.assign(p.stats,{threads_total:5,threads_included:included,threads_eligible:eligible,threads_truncated:threadsCut,messages_truncated:messagesCut,user_messages_included:x,user_messages_available:y});
    const tree=Modal({projectName:'Example',preview:p,isApplying:false,results:null,onApply(){},onCancel(){}});
    const text=strings(tree);
    assert.equal(text.includes(`対象${eligible}件中${included}件のみ使用しています。Project全体を網羅していません`),included<eligible);
    assert.ok(text.includes(`使用したスレッド内のuser発言: ${x} / ${y}件`));
    assert.equal(text.includes('古いuser発言'),x<y);
    assert.equal(text.includes('長文のuser発言'),messagesCut>0);
    if (x<y) assert.ok(text.includes(`古いuser発言${y-x}件は使用していません`));
    if (messagesCut>0) assert.ok(text.includes(`長文のuser発言${messagesCut}件は一部を中略しています`));
    for (const p of nodes(tree).filter(n=>n.type==='p' && /古いuser発言|長文のuser発言/.test(strings(n)))) assert.equal(p.props.style.color,'#b45309');
    assert.ok(!text.includes('使用したスレッド内にも省略があります'));
    assert.ok(text.includes(`5件のスレッドのうち${included}件を使用（対象条件を満たすスレッド: ${eligible}件）`));
    assert.ok(text.includes('作成したtopicは、デフォルトでは『チャットに含める』がOFFです。Project Memory一覧でONにすると、チャットに注入されます。'));
    assert.ok(!text.includes('一部省略されています'));
  }
});
