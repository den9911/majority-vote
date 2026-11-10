import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server/index.mjs';
import {questions} from '../server/majority-catalog.mjs';

const deadline=5000;
async function listen(app){app.server.listen(0,'127.0.0.1');await once(app.server,'listening');return `http://127.0.0.1:${app.server.address().port}`;}
async function close(app){if(app.server.listening)await new Promise(resolve=>app.server.close(resolve));}
async function fixture(t){
  const dataDir=await mkdtemp(join(tmpdir(),'majority-recovery-'));let app,base,cookie='';
  t.after(async()=>{if(app)await close(app);await rm(dataDir,{recursive:true,force:true});});
  return {dataDir,get app(){return app;},async start(){if(app)await close(app);app=await createApp({dataDir,appId:'majority',disableRateLimit:true});base=await listen(app);},async request(input){
    const res=await fetch(base+'/api/majority',{signal:AbortSignal.timeout(deadline),method:input===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})});
    if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,body:await res.json()};
  },get port(){return app.server.address().port;}};
}
const answer={id:questions[0].id,revision:1,choice:1};

for(const [mode,expectedCode,expectedCount] of [['before',92,0],['after',91,1]])test(`real process exit ${mode} COMMIT preserves the correct stable answer`,{timeout:20000},async t=>{
  const h=await fixture(t);
  const child=fork(new URL('./fixtures/majority-process.mjs',import.meta.url),[],{env:{...process.env,TEST_DATA_DIR:h.dataDir,TEST_STOP_AT:mode},stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout.on('data',part=>output+=part);child.stderr.on('data',part=>output+=part);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const exit=once(child,'exit');const [ready]=await once(child,'message',{signal:AbortSignal.timeout(deadline)});
  const url=`http://127.0.0.1:${ready.port}/api/majority`;
  const get=await fetch(url,{signal:AbortSignal.timeout(deadline)}),cookie=get.headers.get('set-cookie').split(';')[0];await get.arrayBuffer();
  await assert.rejects(fetch(url,{method:'POST',signal:AbortSignal.timeout(deadline),headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(answer)}));
  assert.equal((await exit)[0],expectedCode,output);
  await h.start();
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,expectedCount);
  const restarted=`http://127.0.0.1:${h.port}/api/majority`;
  const state=await (await fetch(restarted,{headers:{Cookie:cookie}})).json();
  assert.equal(state.questions[0].choice,expectedCount?'1':null);assert.deepEqual(state.questions[0].counts,[0,expectedCount]);
  const replay=await fetch(restarted,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(answer)});
  assert.equal(replay.status,200);assert.equal((await replay.json()).duplicate,Boolean(expectedCount));
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,1);
  assert.equal(h.app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

async function abortPartial(port,body){
  const socket=createConnection({port,host:'127.0.0.1'});socket.on('error',()=>{});
  await once(socket,'connect');const ended=once(socket,'close');
  // Advertise a larger body, then disconnect: JSON was never complete and must never execute.
  await new Promise((resolve,reject)=>socket.write(`POST /api/majority HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n${body}`,error=>error?reject(error):resolve()));
  socket.destroy();await ended;
}

test('forty incomplete TCP requests release sockets and the next valid request still commits once',{timeout:15000},async t=>{
  const h=await fixture(t);await h.start();
  for(let i=0;i<40;i++)await abortPartial(h.port,'{"id":"music-or-sweets","choice":1');
  // Round-trip barrier ensures the server has processed preceding disconnects.
  const res=await fetch(`http://127.0.0.1:${h.port}/healthz`,{headers:{Connection:'close'}});await res.arrayBuffer();
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,0);
  const connections=await new Promise((resolve,reject)=>h.app.server.getConnections((error,n)=>error?reject(error):resolve(n)));
  assert.ok(connections<=1,`leftover server sockets: ${connections}`);
  assert.equal((await h.request(answer)).status,200);assert.equal((await h.request(answer)).body.duplicate,true);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,1);
});

test('write rejection rolls back, warnings are bounded and private SQL never reaches HTTP',{timeout:15000},async t=>{
  const h=await fixture(t);await h.start();const warnings=[],original=console.error;
  console.error=(...args)=>warnings.push(args.join(' '));t.after(()=>console.error=original);
  h.app.db.exec("CREATE TRIGGER fail_vote BEFORE INSERT ON majority_answers BEGIN SELECT RAISE(ABORT,'secret-sql-private-text'); END");
  for(let i=0;i<12;i++){const failed=await h.request(answer);assert.equal(failed.status,500);assert.doesNotMatch(JSON.stringify(failed.body),/secret-sql|TRIGGER|INSERT/);}
  assert.equal(warnings.length,1);assert.doesNotMatch(warnings[0],/secret-sql|music-or-sweets/);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM majority_answers').get().n,0);
  assert.deepEqual((await h.request()).body.questions[0].counts,[0,0]);
  h.app.db.exec('DROP TRIGGER fail_vote');assert.equal((await h.request(answer)).status,200);
  await h.start();const persisted=(await h.request()).body.questions[0];assert.equal(persisted.choice,'1');assert.deepEqual(persisted.counts,[0,1]);
  assert.equal((await h.request(answer)).body.duplicate,true);
  assert.equal(h.app.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});
