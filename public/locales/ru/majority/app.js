import { $, $$, api, escape, action, share, storage } from '/locales/ru/shared/ui.js';
export async function mount() {
  let {questions}=await api('/api/majority');
  const requested=Number(new URLSearchParams(location.search).get('q'));
  let index=location.search && Number.isInteger(requested)&&requested>=0&&requested<questions.length?requested:Math.max(0,questions.findIndex(q=>q.choice===null));
  let prediction=storage.get(`prediction:${index}`);
  function render(){
    const q=questions[index],answered=q.choice!==null,total=q.counts.reduce((a,b)=>a+b,0);
    $('#app').innerHTML=`<div class="narrow"><div class="panel question-box"><div class="row between"><span class="question-number">ВОПРОС ${String(index+1).padStart(2,'0')} / ${questions.length}</span><span class="pill">${total} ответов</span></div><h2>${escape(q.question)}</h2>${!answered?`<div class="stack"><p class="small muted">Сначала угадай, что выберет большинство. Затем ответь за себя.</p><div class="row tabs">${q.options.map((option,i)=>`<button class="prediction secondary" data-index="${i}" aria-pressed="${prediction===i}">${escape(option)}</button>`).join('')}</div><div class="divider"></div><p class="small muted">А твой выбор?</p><div class="choice-grid">${q.options.map((option,i)=>`<button class="choice" data-index="${i}">${escape(option)}</button>`).join('')}</div></div>`:`<div class="stack"><p class="note">${q.counts[0]===q.counts[1]?'Пока ничья.':Number(q.choice)===(q.counts[0]>q.counts[1]?0:1)?'Ты на стороне большинства.':'У тебя своя позиция.'}${prediction!==null?` ${q.counts[0]===q.counts[1]?'':prediction===(q.counts[0]>q.counts[1]?0:1)?'Прогноз совпал!':'Большинство удивило.'}`:''}</p><div>${q.options.map((option,i)=>`<div class="result-line"><div class="row"><span>${escape(option)} ${Number(q.choice)===i?'✓':''}</span><strong>${total?Math.round(q.counts[i]/total*100):0}%</strong></div><progress max="${Math.max(1,total)}" value="${q.counts[i]}" aria-label="${escape(option)}"></progress></div>`).join('')}</div><button class="secondary" id="share">Спросить друзей ↗</button></div>`}<div class="row between question-footer"><button id="prev" class="text-button" ${index===0?'disabled':''}>← Предыдущий</button><button id="next" class="text-button">${index===questions.length-1?'К первому':'Следующий'} →</button></div></div><p class="small muted section-gap">Только реальные ответы посетителей. Голос сохраняется за этим браузером.</p></div>`;
    $$('.prediction').forEach(button=>action(button,()=>{prediction=Number(button.dataset.index);storage.set(`prediction:${index}`,prediction);render();}));
    $$('.choice').forEach(button=>action(button,async()=>{await api('/api/majority',{id:index,choice:Number(button.dataset.index)});({questions}=await api('/api/majority'));render();}));
    action($('#prev'),()=>navigate(index-1));action($('#next'),()=>navigate((index+1)%questions.length));
    if($('#share'))action($('#share'),()=>share(`${location.origin}/majority/?q=${index}`,'Как все',q.question));
  }
  function navigate(next){index=next;prediction=storage.get(`prediction:${index}`);history.replaceState(null,'',`?q=${index}`);render();}
  render();
}
