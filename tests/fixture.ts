/** Visible-DOM fixture only. All replies are local canned text; no model or private API. */
import {marked} from 'marked';
import formatSample from './native-format.json';
import officialControls from './native-controls.json';
export const cid='fixture-study';
type Turn={u:string;a:string;q:string;aText:string};
type Session={title:string;versions:Turn[][];branch:number};
export function installFixture(doc:Document,persistent=false,stress=0){
  const css=doc.createElement('style');css.textContent='.fixture-composer .fixture-footer,.fixture-composer .fixture-toggles,.fixture-composer .fixture-actions{display:flex;align-items:center;gap:12px}.fixture-composer .fixture-actions{margin-left:auto}.fixture-composer .ds-toggle-button{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:34px;padding:0 10px;border:1px solid #ffffff20;border-radius:18px;font-size:13px;color:#f9fafb;cursor:pointer}.fixture-composer .ds-toggle-button[aria-pressed=true]{color:#679efe;background:#283142;border-color:#4868b2}.fixture-composer svg{width:16px;height:16px}.fixture-composer .ds-button--primary{background:#5686fe;color:white;border:0;border-radius:50%;width:34px;height:34px;padding:8px}.fixture-composer .f02f0e25{border:0;background:transparent;color:#f9fafb;padding:8px;height:34px;width:34px}';css.textContent+='.fixture-history{position:fixed;left:0;top:0;bottom:0;width:260px;overflow:auto;background:#1b1b1b;padding:18px 12px;color:#ddd}.fixture-history ._5a8ac7a{display:flex;justify-content:center;align-items:center;background:#444654;border-radius:24px;min-height:44px;cursor:pointer}.fixture-session-list{margin-top:0}.fixture-session-list a{display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;color:#ddd;text-decoration:none}.fixture-session-list a:hover{background:#2a2a2a}.ds-dropdown-menu{position:fixed;left:24px;top:150px;z-index:100;background:#292929;border:1px solid #555;border-radius:10px;padding:6px;color:#ddd}.ds-dropdown-menu-option{padding:9px 12px;cursor:pointer}.ds-dropdown-menu-option:hover{background:#ffffff10}';css.textContent+='.fixture-composer{left:calc(284px + (100vw - 284px)*.1);width:calc((100vw - 284px)*.8)}.fixture-native details>summary{background:#161616}.fixture-native ._245c867{position:sticky;top:0;isolation:isolate}.fixture-native ._245c867::before,.fixture-native ._245c867::after{content:"";position:absolute;inset:-1px 0 0;background:rgb(21,21,23);z-index:-1}.fixture-native ._245c867::after{left:-10px}.fixture-session-list a[role=button]{justify-content:flex-start;gap:10px;cursor:pointer}.fixture-history .ds-checkbox{width:18px;height:18px;border:1px solid #aaa;border-radius:50%;display:grid;place-items:center}.fixture-history .ds-checkbox--checked{background:#4d6bfe;color:white}.fixture-native{margin-left:284px;padding-left:30px}.fixture-history{display:flex;flex-direction:column;box-sizing:border-box;width:284px;padding-bottom:64px;overflow:hidden}.fixture-history ._3586175{flex:1;min-height:0;display:flex;flex-direction:column;margin-top:8px}.fixture-history ._6d215eb{flex:1;min-height:0;overflow:auto}';doc.body.append(css);doc.addEventListener('keydown',e=>{if(e.key==='Escape')doc.querySelector('.ds-dropdown-menu')?.remove();});
  const first={u:'1',a:'2',q:'什么是贝叶斯更新？请给一个直观例子。',aText:'## 用证据调整判断\n\n贝叶斯更新是：观察到新证据后，重新分配不同解释的可信程度。\n\n例如，先估计下雨概率，再结合天气预报调整它。\n\n```text\n先验 × 似然 → 后验\n\n证据会改变判断，而不是抹去原有信息。\n```'};
  const original:Turn[]=[first,{u:'3',a:'4',q:'用医学检测举例，假阳性会带来什么误判？',aText:'不要把“检测为阳性时患病的概率”与“患病时检测为阳性的概率”混为一谈。\n\n先看基准发生率，再看检测的准确度。'},{u:'5',a:'6',q:'再与机器学习中的更新联系起来。',aText:'训练时，参数不断根据数据修正。贝叶斯方法则显式维护参数的不确定性。\n\n可以从概率、优化和决策三个方向继续学习。'}];
  const alternative:Turn[]=[first,{u:'7',a:'8',q:'如果先验不可靠，如何判断结论是否稳健？',aText:'可以比较不同先验下的后验。\n\n- 尝试较弱先验\n- 做敏感性分析\n- 检查新证据是否足够有区分力\n\n结论如果对合理先验的变化不敏感，通常更值得信任。'}];
  const saved=persistent?sessionStorage.getItem('suedama.fixture.native.v5'):null;
  const restored=saved?JSON.parse(saved) as {sessions:Record<string,Session>;current:string;nextKey:number;serial:number}:undefined;
  const sessions:Record<string,Session>=restored?.sessions??{[cid]:{title:'发散学习与内容整理',versions:[original,alternative],branch:1}};
  let current=restored?.current??cid,nextKey=restored?.nextKey??20,serial=restored?.serial??1;
  if(!restored&&stress>0){
    const count=Math.min(500,Math.floor(stress));current='fixture-stress';
    sessions[current]={title:`压力回归 · ${count} 轮`,branch:1,versions:[Array.from({length:count},(_,i)=>({u:String(1000+i*2),a:String(1001+i*2),q:`第 ${i+1} 轮：解释证据如何改变判断。`,aText:`## 第 ${i+1} 轮的本地回答\n\n先比较原有假设，再检查证据。这个页面使用固定文本，不会连接真实模型。\n\n- 保留先前历史\n- 比较不同解释\n- 根据新信息调整判断\n\n**结论：** 把计算和交互分开验证。`}))]};nextKey=1000+count*2;
  }
  const fresh:Session={title:'新对话',versions:[[]],branch:1};
  const session=()=>current?sessions[current]!:fresh;
  const nav=doc.createElement('nav');nav.className='fixture-history b8812f16';
  const owner=doc.createElement('aside');owner.className='dc04ec1d';const rail=doc.createElement('div');rail.className='ca6d4be1';rail.innerHTML='<span class="_6acebc2">◆</span><div class="e5bf614e"><button aria-label="展开侧栏" role="button">☰</button><button aria-label="搜索会话" role="button">⌕</button><button aria-label="New chat" role="button">＋</button></div>';rail.querySelector('button')!.onclick=()=>owner.classList.remove('a02af2e6');rail.querySelectorAll('button')[2]!.onclick=()=>nav.querySelector<HTMLElement>('._5a8ac7a')?.click();owner.append(rail,nav);
  const header=doc.createElement('div');header.className='_2be88ba';header.innerHTML='<div class="the-header"><div class="_9fcbeda">官网会话</div></div><button class="_57370c5" aria-label="官网分享">↗</button>';
  css.textContent+='.dc04ec1d{position:fixed;left:0;top:0;z-index:15;width:284px;height:100vh}.dc04ec1d.a02af2e6{width:0}.dc04ec1d.a02af2e6 .b8812f16{display:none}.ca6d4be1{display:none;position:fixed;left:16px;top:12px;transform:translate(0);z-index:10000;gap:16px}.a02af2e6 .ca6d4be1{display:flex}.e5bf614e{display:flex;gap:4px}.a02af2e6~._2be88ba{left:0}._2be88ba{position:fixed;left:284px;top:0;right:0;height:60px;display:flex;justify-content:space-between}._57370c5{position:relative;z-index:100;width:34px;height:34px}';
  const shell=doc.createElement('main');shell.className='fixture-native';
  const composer=doc.createElement('section');composer.className='fixture-composer';
  const inner=doc.createElement('div');
  inner.innerHTML='<div><textarea placeholder="给 DeepSeek 发送消息"></textarea></div><div class="fixture-footer"><div class="fixture-toggles"></div><div class="fixture-actions"></div></div>';
  const controls=inner.querySelector<HTMLElement>('.fixture-toggles')!,actions=inner.querySelector<HTMLElement>('.fixture-actions')!,input=inner.querySelector('textarea')!;
  for(const control of officialControls.slice(0,2)){
    const toggle=doc.createElement('div');toggle.className='ds-toggle-button';toggle.tabIndex=0;toggle.setAttribute('aria-pressed',String(control.active));toggle.innerHTML=control.svg??'';
    const label=doc.createElement('span');label.textContent=control.label;toggle.append(label);toggle.onclick=()=>{toggle.setAttribute('aria-pressed',String(toggle.getAttribute('aria-pressed')!=='true'));toggle.classList.toggle('ds-toggle-button--selected',toggle.getAttribute('aria-pressed')==='true');};controls.append(toggle);
  }
  const attach=doc.createElement('div');attach.setAttribute('role','button');attach.className='f02f0e25';attach.setAttribute('aria-label','添加附件');attach.innerHTML=officialControls[2]?.svg??'';
  const file=doc.createElement('input');file.type='file';file.multiple=true;file.hidden=true;attach.onclick=()=>file.click();actions.append(attach,file);
  const send=doc.createElement('div');send.setAttribute('role','button');send.setAttribute('aria-label','发送');send.className='ds-button ds-button--primary ds-button--circle ds-button--disabled';send.innerHTML=officialControls[3]?.svg??'';actions.append(send);
  const refreshSend=()=>send.classList.toggle('ds-button--disabled',!input.value.trim());input.addEventListener('input',refreshSend);
  composer.append(inner);doc.body.append(owner,header,shell,composer);
  function url(){doc.defaultView?.history.replaceState(null,'',current?`/a/chat/s/${current}`:'/');doc.defaultView?.dispatchEvent(new (doc.defaultView as unknown as {PopStateEvent:typeof PopStateEvent}).PopStateEvent('popstate'));}
  function response(text:string){return text.includes('引用')||text.includes('注释')?'我会结合你提供的引用材料回答。\n\n这里是一条本地回归回复，用来验证注释绑定、换行和分支定位，不会连接真实模型。':'这是本地回归回复。\n\n原生页面已经接收提问；此 fixture 仅验证扩展交互。';}
  function render(){
    const active=session();doc.title=active.title+' - DeepSeek';
    if(persistent)sessionStorage.setItem('suedama.fixture.native.v5',JSON.stringify({sessions,current,nextKey,serial}));
    nav.replaceChildren();const newChat=doc.createElement('div');newChat.tabIndex=0;newChat.className='_5a8ac7a a084f19e';newChat.textContent='新对话';newChat.onclick=()=>{current='';fresh.versions=[[]];fresh.branch=1;input.value='';refreshSend();url();render();};nav.append(newChat);const collapse=doc.createElement('button');collapse.setAttribute('aria-label','收起侧栏');collapse.textContent='☰';collapse.onclick=()=>owner.classList.add('a02af2e6');nav.prepend(collapse);
    const multi=doc.createElement('button');multi.className='_8023265';multi.setAttribute('aria-label','官方多选');multi.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="3" cy="4" r="2"/><circle cx="3" cy="12" r="2"/><path d="M7 4h8M7 12h8"/></svg>';multi.style.cssText='position:absolute;right:12px';const history=doc.createElement('div');history.className='_3586175 ds-scroll-area';history.append(multi);const scroll=doc.createElement('div');scroll.className='_6d215eb ds-scroll-area';history.append(scroll);nav.append(history);
    const list=doc.createElement('div');list.className='fixture-session-list _77cdc67';
    let selecting=false;const selected=new Set<string>(),selectionRows=new Map<HTMLAnchorElement,{id:string;more:HTMLButtonElement}>();
    for(const [id,s]of Object.entries(sessions)){
      const row=doc.createElement('div'),link=doc.createElement('a');link.className='_546d736';link.href=`/a/chat/s/${id}`;link.textContent=s.title;link.onclick=e=>{e.preventDefault();if(selecting){if(selected.has(id))selected.delete(id);else selected.add(id);syncSelection();return;}current=id;url();render();};const title=doc.createElement('span');title.className='c08e6e93';title.textContent=s.title;link.replaceChildren(title);const more=doc.createElement('button');more.setAttribute('aria-label','会话菜单');more.setAttribute('role','button');more.textContent='⋯';more.onclick=e=>{e.preventDefault();e.stopPropagation();doc.querySelector('.ds-dropdown-menu')?.remove();const popup=doc.createElement('div');popup.className='ds-dropdown-menu';popup.setAttribute('role','menu');for(const name of ['重命名','置顶','分享','多选','删除']){const option=doc.createElement('div');option.className='ds-dropdown-menu-option'+(name==='删除'?' ds-dropdown-menu-option--error':'');option.textContent=name;popup.append(option);}doc.body.append(popup);};link.append(more);selectionRows.set(link,{id,more});row.append(link);list.append(row);
    }scroll.append(list);
    const selectionTools=doc.createElement('div');selectionTools.hidden=true;const selectionCount=doc.createElement('span'),closeSelection=doc.createElement('button');closeSelection.textContent='关闭多选';closeSelection.onclick=()=>{selecting=false;selected.clear();syncSelection();};selectionTools.append(selectionCount,closeSelection);const bulk=doc.createElement('button');bulk.textContent='批量操作';selectionTools.append(bulk);history.append(selectionTools);
    function syncSelection(){
      selectionTools.hidden=!selecting;selectionCount.textContent=`已选择 ${selected.size} 个对话`;bulk.disabled=!selected.size;
      for(const [link,{id,more}]of selectionRows){
        link.querySelector('.ds-checkbox')?.remove();more.hidden=selecting;
        if(selecting){link.removeAttribute('href');link.setAttribute('role','button');link.setAttribute('aria-pressed',String(selected.has(id)));const check=doc.createElement('span');check.className='ds-checkbox '+(selected.has(id)?'ds-checkbox--checked':'ds-checkbox--none');check.textContent=selected.has(id)?'✓':'';link.prepend(check);}
        else{link.href=`/a/chat/s/${id}`;link.removeAttribute('role');link.removeAttribute('aria-pressed');}
      }
    }
    multi.onclick=()=>{selecting=true;syncSelection();};
    const account=doc.createElement('button');account.className='_2afd28d';account.textContent='测试用户';account.style.cssText='position:absolute;bottom:20px;left:12px';account.onclick=()=>{doc.querySelector('.ds-dropdown-menu')?.remove();const popup=doc.createElement('div');popup.className='ds-dropdown-menu';popup.setAttribute('role','menu');popup.setAttribute('aria-label','官方用户菜单');popup.style.top='auto';popup.style.bottom='65px';popup.innerHTML='<div class="ds-dropdown-menu-option">设置</div><div class="ds-dropdown-menu-option">退出登录</div>';doc.body.append(popup);};nav.append(account);
    shell.replaceChildren();
    for(const [index,t]of active.versions[active.branch-1]!.entries()){
      const user=doc.createElement('div');user.setAttribute('data-virtual-list-item-key',t.u);
      const msg=doc.createElement('div');msg.className='ds-message';const body=doc.createElement('div');body.className='ds-collapsible-text';body.textContent=t.q;msg.append(body);user.append(msg);
      const tools=doc.createElement('div');tools.className='ds-flex';const copy=doc.createElement('button');copy.setAttribute('role','button');copy.textContent='复制';const edit=doc.createElement('button');edit.setAttribute('role','button');edit.className='d4910adc';edit.setAttribute('aria-disabled','false');edit.textContent='编辑';tools.append(copy,edit);user.append(tools);
      edit.onclick=()=>{
        msg.style.display='none';tools.style.display='none';const field=doc.createElement('textarea');field.value=t.q;
        const cancel=doc.createElement('button');cancel.textContent='取消';cancel.onclick=render;
        const save=doc.createElement('button');save.textContent='发送';save.setAttribute('role','button');save.onclick=()=>{const item={u:String(nextKey++),a:String(nextKey++),q:field.value,aText:response(field.value)};active.versions.push([...active.versions[active.branch-1]!.slice(0,index),item]);active.branch=active.versions.length;render();};user.append(field,cancel,save);
      };
      if(index===1){
        const counter=doc.createElement('div');counter.className='version-control';const prev=doc.createElement('button');prev.setAttribute('role','button');prev.textContent='‹';if(active.branch===1)prev.className='ds-button--disabled';prev.onclick=()=>{if(active.branch>1){active.branch--;render();}};
        const label=doc.createElement('span');label.textContent=`${active.branch} / ${active.versions.length}`;const next=doc.createElement('button');next.setAttribute('role','button');next.textContent='›';if(active.branch===active.versions.length)next.className='ds-button--disabled';next.onclick=()=>{if(active.branch<active.versions.length){active.branch++;render();}};counter.append(prev,label,next);user.append(counter);
      }
      shell.append(user);const answer=doc.createElement('div');answer.setAttribute('data-virtual-list-item-key',t.a);const answerMsg=doc.createElement('div');answerMsg.className='ds-message';const content=doc.createElement('div');content.className='ds-markdown ds-assistant-message-main-content';content.innerHTML=marked.parse(t.aText,{async:false}) as string;if(index===0){const thought=doc.createElement('div');thought.className='ds-think-content';thought.innerHTML='<div class="ds-markdown">'+formatSample.reasoningHtml+'</div>';const label=doc.createElement('span');label.className='_5255ff8';label.textContent=formatSample.reasoningLabel;const details=doc.createElement('details'),summary=doc.createElement('summary');summary.className='_245c867 _34a54ec';summary.append(label);details.append(summary,thought);answerMsg.append(details);content.innerHTML=formatSample.answerHtml;}answerMsg.append(content);answer.append(answerMsg);shell.append(answer);
    }
  }
  send.onclick=()=>{
    if(!input.value.trim())return;
    if(!current){current=`fixture-root-${serial++}`;sessions[current]={title:input.value.slice(0,28),versions:[[]],branch:1};url();}
    const active=session();active.versions[active.branch-1]!.push({u:String(nextKey++),a:String(nextKey++),q:input.value,aText:response(input.value)});input.value='';file.value='';refreshSend();render();
    if(persistent){const canonical=shell.querySelector<HTMLElement>(`[data-virtual-list-item-key="${nextKey-2}"]`);if(canonical){const optimistic=canonical.cloneNode(true) as HTMLElement;optimistic.dataset.virtualListItemKey=String(-(nextKey-2));optimistic.dataset.fixtureOptimistic='true';canonical.before(optimistic);setTimeout(()=>optimistic.remove(),2000);}}

  };
  url();render();
  return {setBranch:(value:number)=>{session().branch=value;render();},getBranch:()=>session().branch,get versions(){return session().versions;},get current(){return current;},sessions,render};
}
