import { $, $$, api, escape, action, share, storage } from '/shared/ui.js';
import {validId,resolveQuestion,readPredictions,savePrediction,predictionFor,predictionKey} from '/shared/majority-state.js';

export async function mount() {
  let data=await load();
  let selected=resolveQuestion(new URLSearchParams(location.search).get('q'),data.questions,data.legacyIds);
  let forecasts=readPredictions(storage.get(predictionKey));
  const hasLegacyForecast=data.legacyIds.some((_,index)=>storage.get(`prediction:${index}`)!==null);
  const uncertain=new Set();
  let legacyNotice=hasLegacyForecast&&!storage.get('majority-legacy-notice-dismissed',false),busy=false;

  async function load(){
    const result=await api('/api/majority');
    if(!Array.isArray(result.legacyIds)||!result.questions?.length||!result.questions.every(q=>validId(q.id)&&Number.isSafeInteger(q.revision)))throw new Error('Сервер обновляется. Перезагрузите страницу через минуту.');
    return result;
  }
  function navigate(id){selected=id;history.replaceState(null,'',`?q=${encodeURIComponent(id)}`);render();}
  function render(){
    const index=data.questions.findIndex(q=>q.id===selected),q=data.questions[index];
    if(!q){
      $('#app').innerHTML='<div class="narrow panel stack"><h2>Этот вопрос больше недоступен</h2><p>Старая ссылка не перенаправлена на другой вопрос. Сохранённые ответы остаются в истории сервера.</p><button id="restart">Выбрать доступный вопрос</button></div>';
      action($('#restart'),()=>navigate(data.questions[0].id));return;
    }
    const answered=q.choice!==null,total=q.counts.reduce((a,b)=>a+b,0),shown=q.answerSnapshot??q,prediction=predictionFor(forecasts,q);
    const recovery=uncertain.has(q.id)?'<div class="note" role="alert"><p>Ответ не подтверждён. Сначала проверьте состояние, чтобы не сделать другой выбор вслепую.</p><button id="check-answer" class="secondary">Проверить ответ</button></div>':'';
    const notices=`${recovery}${legacyNotice?'<div class="note"><p>Старые прогнозы сохранены на устройстве, но не привязаны к новым ID: их версию нельзя подтвердить. Сделайте новый прогноз.</p><button id="dismiss-legacy" class="text-button">Понятно</button></div>':''}${data.unassignedLegacy?'<p class="note">Часть старых ответов не удалось однозначно сопоставить. Они сохранены без изменения и не добавлены к другим вопросам.</p>':''}${q.answerSnapshot?'<p class="note">Формулировка обновилась. Здесь показан вопрос, на который вы отвечали; ваш голос сохранён.</p>':''}`;
    $('#app').innerHTML=`<div class="narrow">${notices}<div class="panel question-box" aria-busy="${busy}"><div class="row between"><span class="question-number">ВОПРОС ${String(index+1).padStart(2,'0')} / ${data.questions.length}</span><span class="pill">${total} ответов</span></div><h2>${escape(shown.question)}</h2>${!answered?`<div class="stack"><p class="small muted">Сначала угадай, что выберет большинство. Затем ответь за себя.</p><div class="row tabs">${shown.options.map((option,i)=>`<button class="prediction secondary" data-index="${i}" aria-pressed="${prediction===i}">${escape(option)}</button>`).join('')}</div><div class="divider"></div><p class="small muted">А твой выбор?</p><div class="choice-grid">${shown.options.map((option,i)=>`<button class="choice" data-index="${i}">${escape(option)}</button>`).join('')}</div></div>`:`<div class="stack"><p class="note">${q.counts[0]===q.counts[1]?'Пока ничья.':Number(q.choice)===(q.counts[0]>q.counts[1]?0:1)?'Ты на стороне большинства.':'У тебя своя позиция.'}${prediction!==null?` ${q.counts[0]===q.counts[1]?'':prediction===(q.counts[0]>q.counts[1]?0:1)?'Прогноз совпал!':'Большинство удивило.'}`:''}</p><div>${shown.options.map((option,i)=>`<div class="result-line"><div class="row"><span>${escape(option)} ${Number(q.choice)===i?'✓':''}</span><strong>${total?Math.round(q.counts[i]/total*100):0}%</strong></div><progress max="${Math.max(1,total)}" value="${q.counts[i]}" aria-label="${escape(option)}"></progress></div>`).join('')}</div><button class="secondary" id="share">Спросить друзей ↗</button></div>`}<div class="row between question-footer"><button id="prev" class="text-button" ${index===0?'disabled':''}>← Предыдущий</button><button id="next" class="text-button">${index===data.questions.length-1?'К первому':'Следующий'} →</button></div></div><p class="small muted section-gap">Только реальные ответы посетителей. Голос сохраняется за этим браузером.</p></div>`;
    $$('.prediction').forEach(button=>action(button,()=>{
      forecasts=savePrediction(forecasts,q.id,q.revision,Number(button.dataset.index));storage.set(predictionKey,forecasts);render();
    }));
    $$('.choice').forEach(button=>action(button,async()=>{
      if(busy)return;
      const choice=Number(button.dataset.index);busy=true;render();
      try{
        await api('/api/majority',{id:q.id,revision:q.revision,choice});
        data=await load();uncertain.clear();
      }catch(error){
        // A missing response is not proof of failure. Read the committed state; never submit another vote automatically.
        try{data=await load();uncertain.clear();}catch{uncertain.add(q.id);throw new Error('Ответ не подтверждён. Проверьте соединение и повторите тот же выбор после обновления страницы.');}
        if(data.questions.find(row=>row.id===q.id)?.choice!==String(choice))throw error;
      }finally{busy=false;render();}
    }));
    action($('#prev'),()=>navigate(data.questions[index-1].id));
    action($('#next'),()=>navigate(data.questions[(index+1)%data.questions.length].id));
    if($('#share'))action($('#share'),()=>share(`${location.origin}/majority/?q=${q.id}`,'Как все',shown.question));
    if($('#dismiss-legacy'))action($('#dismiss-legacy'),()=>{legacyNotice=false;storage.set('majority-legacy-notice-dismissed',true);render();});
    if($('#check-answer'))action($('#check-answer'),async()=>{
      busy=true;render();
      try{data=await load();uncertain.clear();}finally{busy=false;render();}
    });
    if(uncertain.has(q.id))$$('.choice,.prediction').forEach(button=>button.disabled=true);
    if(busy)$$('button',$('#app')).forEach(button=>button.disabled=true);
  }
  render();
}
