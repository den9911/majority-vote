import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server/index.mjs';
import {openStore} from '../server/store.mjs';
import {prepareMajority} from '../server/majority.mjs';
import {questions,legacyQuestions,legacyIds,validateCatalog} from '../server/majority-catalog.mjs';
import {resolveQuestion,readPredictions,savePrediction,predictionFor} from '../public/shared/majority-state.js';
import {localizeResponse as english} from '../public/locales/en/shared/editorial.js';
import {localizeResponse as russian} from '../public/locales/ru/shared/editorial.js';

async function setup(t){
  const dataDir=await mkdtemp(join(tmpdir(),'majority-stable-'));
  let app,base,cookie='';
  const stop=async()=>{if(app){const previous=app;app=null;if(previous.server.listening)await new Promise(resolve=>previous.server.close(resolve));else previous.db.close();}};
  t.after(async()=>{await stop();await rm(dataDir,{recursive:true,force:true});});
  return {dataDir,stop,get db(){return app.db;},async start(catalog=questions){await stop();app=await createApp({dataDir,appId:'majority',disableRateLimit:true,majorityQuestions:catalog});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;},async request(input,raw){
    const response=await fetch(base+'/api/majority',{method:input===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:raw??JSON.stringify(input)})});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,body:await response.json()};
  }};
}
const revised=q=>({...q,revision:q.revision+1,question:q.question+' Сегодня?',en:{...q.en,question:q.en.question+' Today?'}});
const added={...questions[1],id:'new-stable-question'};

test('reordering, insertion, retirement and revised wording never relabel an existing answer',async t=>{
  // The former positional contract demonstrably attached index 0 to another question after reorder.
  assert.notEqual(questions[0].question,[...questions].reverse()[0].question);
  const h=await setup(t);await h.start();const first=questions[0];
  assert.equal((await h.request({id:0,choice:1})).status,400);
  assert.equal((await h.request({id:first.id,revision:1,choice:1})).status,200);
  const changed=revised(first),catalog=[added,...questions.slice(1).reverse(),changed];
  await h.start(catalog);
  const data=(await h.request()).body,q=data.questions.find(q=>q.id===first.id);
  assert.equal(q.choice,'1');assert.deepEqual(q.counts,[0,1]);assert.equal(q.answerRevision,1);
  assert.equal(q.answerSnapshot.question,first.question);assert.equal(q.question,changed.question);
  assert.deepEqual(data.questions[0].counts,[0,0]);assert.equal(data.questions[0].choice,null);
  assert.equal(english('/api/majority',data).questions.at(-1).answerSnapshot.question,first.en.question);
  assert.equal(russian('/api/majority',data).questions.at(-1).answerSnapshot.question,first.question);
  assert.equal((await h.request({id:first.id,revision:1,choice:1})).body.code,'question_changed');
  assert.equal((await h.request({id:first.id,revision:2,choice:1})).body.duplicate,true);
  assert.equal((await h.request({id:first.id,revision:2,choice:0})).status,409);
  await h.start(catalog.filter(q=>q.id!==first.id));
  assert.equal((await h.request({id:first.id,revision:2,choice:1})).status,404);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM majority_answers WHERE question_id=?').get(first.id).n,1);
  assert.equal(resolveQuestion('0',(await h.request()).body.questions,legacyIds),null);
  await h.start(catalog);assert.deepEqual((await h.request()).body.questions.at(-1).counts,[0,1]);
});

test('lost acknowledgement can be retried after restart without a second answer; request size is bounded',async t=>{
  const h=await setup(t);await h.start();await h.request();
  const input={id:questions[2].id,revision:1,choice:0};
  await h.request(input); // Deliberately discard the acknowledgement.
  await h.start();assert.equal((await h.request(input)).body.duplicate,true);
  assert.deepEqual((await h.request()).body.questions[2].counts,[1,0]);
  assert.equal((await h.request({...input,choice:1})).status,409);
  assert.equal((await h.request({},' '.repeat(1025))).status,413);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,1);
});

test('legacy index map is frozen, unknown rows preserved, stable conflicts authoritative, migration once only',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'majority-legacy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'test.sqlite');let db=openStore(path);t.after(()=>db.close());
  const insert=db.prepare('INSERT INTO votes VALUES(?,?,?,?,?)');
  for(const [target,choice] of [['0','1'],['29','0'],['999','1'],['01','0'],['2','bad']])insert.run('majority',target,'alice',choice,123);
  const before=db.prepare('SELECT * FROM votes ORDER BY target').all();
  let service=prepareMajority(db,validateCatalog([added,...questions].reverse()));
  let data=service.read('alice');assert.deepEqual(data.questions.find(q=>q.id===legacyIds[0]).counts,[0,1]);
  assert.equal(data.questions.find(q=>q.id===legacyIds[29]).choice,'0');assert.equal(data.unassignedLegacy,3);
  assert.deepEqual(db.prepare('SELECT * FROM votes ORDER BY target').all(),before);
  db.close();db=openStore(path);service=prepareMajority(db,questions);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,2);
  // Existing stable data wins if an interrupted/older rollout left both stores present.
  db.prepare('UPDATE majority_answers SET choice=0 WHERE voter=? AND question_id=?').run('alice',legacyIds[0]);
  db.exec('DELETE FROM majority_migrations');service=prepareMajority(db,questions);
  assert.equal(service.read('alice').questions[0].choice,'0');assert.equal(service.read('alice').unassignedLegacy,4);
  assert.deepEqual(db.prepare('SELECT * FROM votes ORDER BY target').all(),before);
});

test('a write failure rolls back the whole legacy copy and can recover without deleting original rows',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'majority-rollback-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const db=openStore(join(dir,'test.sqlite'));t.after(()=>db.close());prepareMajority(db,questions);
  db.exec('DELETE FROM majority_migrations');
  const insert=db.prepare('INSERT INTO votes VALUES(?,?,?,?,?)');insert.run('majority','0','a','1',1);insert.run('majority','1','a','0',1);
  db.exec(`CREATE TRIGGER fail_migration BEFORE INSERT ON majority_answers WHEN NEW.question_id='${legacyIds[1]}' BEGIN SELECT RAISE(ABORT,'private migration failure'); END;`);
  assert.throws(()=>prepareMajority(db,questions),/private migration failure/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM majority_migrations').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM votes').get().n,2);
  db.exec('DROP TRIGGER fail_migration');prepareMajority(db,questions);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,2);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('catalog contracts reject ambiguity before serving; startup failure leaves the saved database usable',async t=>{
  assert.equal(legacyQuestions.length,30);assert.equal(new Set(legacyIds).size,30);
  const h=await setup(t);await h.start();await h.stop();
  const changedOptions={...questions[0],options:[...questions[0].options].reverse()};
  await assert.rejects(h.start([changedOptions,...questions.slice(1)]),/new ID/);
  await assert.rejects(h.start([{...questions[0],question:'Different wording'},...questions.slice(1)]),/new revision/);
  await h.start([revised(questions[0]),...questions.slice(1)]);await h.stop();
  await assert.rejects(h.start(),/backwards/);
  await h.start([revised(questions[0]),...questions.slice(1)]);assert.equal((await h.request()).status,200);
  for(const input of [[questions[0],questions[0]],Array.from({length:201},(_,i)=>({...questions[0],id:`q-${i}`})),[{...questions[0],en:null}]]){
    const absent=join(h.dataDir,'must-not-exist');await assert.rejects(createApp({dataDir:absent,majorityQuestions:input}));await assert.rejects(access(absent));
  }
});

test('stable links and bounded versioned forecasts never depend on display indices',()=>{
  const q=questions[0],reordered=[added,...questions].reverse();
  assert.equal(resolveQuestion('0',reordered,legacyIds),q.id);
  assert.equal(resolveQuestion(q.id,reordered,legacyIds),q.id);
  for(const value of ['01','999','-1','unknown','__proto__'])assert.equal(resolveQuestion(value,reordered,legacyIds),null);
  assert.equal(resolveQuestion(null,[{...q,choice:null}],legacyIds),q.id);
  assert.deepEqual(readPredictions({0:1,1:0}),{});
  const saved=savePrediction({},q.id,1,0,123);assert.equal(predictionFor(saved,q),0);
  assert.equal(predictionFor(saved,revised(q)),null);
  assert.equal(predictionFor(saved,{...revised(q),answerRevision:1}),0);
  const many=Object.fromEntries(Array.from({length:205},(_,i)=>[`q-${i}`,{revision:1,choice:0,updated:i}]));
  const clean=readPredictions({...many,bad:{revision:NaN,choice:3,updated:-1}});
  assert.equal(Object.keys(clean).length,200);assert.equal(clean['q-0'],undefined);assert.ok(clean['q-204']);
  assert.equal(Object.keys(savePrediction(clean,'new-id',1,1,1000)).length,200);
});
