import {HttpError,integer} from './validation.mjs';
import {transaction} from './store.mjs';
import {legacyHash,legacyQuestions,legacyIds,validQuestionId} from './majority-catalog.mjs';

function fail(status,message,code){const error=new HttpError(status,message);error.publicCode=code;throw error;}

/** Stable identities and immutable wording snapshots; old numeric votes remain untouched. */
export function prepareMajority(db,catalog){
  transaction(db,()=>{
    db.exec(`
      CREATE TABLE IF NOT EXISTS majority_questions(id TEXT PRIMARY KEY,options TEXT NOT NULL,en_options TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS majority_revisions(
        question_id TEXT NOT NULL REFERENCES majority_questions(id),revision INTEGER NOT NULL,
        question TEXT NOT NULL,en_question TEXT NOT NULL,PRIMARY KEY(question_id,revision));
      CREATE TABLE IF NOT EXISTS majority_answers(
        question_id TEXT NOT NULL,voter TEXT NOT NULL,choice INTEGER NOT NULL CHECK(choice IN (0,1)),
        revision INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(question_id,voter),
        FOREIGN KEY(question_id,revision) REFERENCES majority_revisions(question_id,revision));
      CREATE INDEX IF NOT EXISTS majority_answers_voter ON majority_answers(voter,question_id);
      CREATE INDEX IF NOT EXISTS votes_voter ON votes(scope,voter,target);
      CREATE TABLE IF NOT EXISTS majority_legacy_map(legacy_index TEXT PRIMARY KEY,question_id TEXT NOT NULL UNIQUE REFERENCES majority_questions(id));
      CREATE TABLE IF NOT EXISTS majority_migrations(name TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);
    `);
    function pin(q,isActive){
      const options=JSON.stringify(q.options),english=JSON.stringify(q.en.options);
      const old=db.prepare('SELECT options,en_options FROM majority_questions WHERE id=?').get(q.id);
      if(old&&(old.options!==options||old.en_options!==english))throw new Error('Changed question options require a new ID');
      db.prepare('INSERT OR IGNORE INTO majority_questions VALUES(?,?,?)').run(q.id,options,english);
      const max=db.prepare('SELECT MAX(revision) AS n FROM majority_revisions WHERE question_id=?').get(q.id).n;
      if(isActive&&max!==null&&q.revision<max)throw new Error('Question revision cannot move backwards');
      const wording=db.prepare('SELECT question,en_question FROM majority_revisions WHERE question_id=? AND revision=?').get(q.id,q.revision);
      if(wording&&(wording.question!==q.question||wording.en_question!==q.en.question))throw new Error('Edited wording requires a new revision');
      db.prepare('INSERT OR IGNORE INTO majority_revisions VALUES(?,?,?,?)').run(q.id,q.revision,q.question,q.en.question);
    }
    for(const [index,q] of legacyQuestions.entries()){
      pin(q,false);
      const old=db.prepare('SELECT question_id FROM majority_legacy_map WHERE legacy_index=?').get(String(index));
      if(old&&old.question_id!==q.id)throw new Error('The saved legacy identity map changed');
      db.prepare('INSERT OR IGNORE INTO majority_legacy_map VALUES(?,?)').run(String(index),q.id);
    }
    for(const q of catalog)pin(q,true);
    const migration=db.prepare('SELECT fingerprint FROM majority_migrations WHERE name=?').get('legacy-v1');
    if(migration&&migration.fingerprint!==legacyHash)throw new Error('Unknown legacy migration fingerprint');
    if(!migration){
      const copy=db.prepare(`INSERT OR IGNORE INTO majority_answers(question_id,voter,choice,revision,created)
        SELECT ?,voter,CAST(choice AS INTEGER),1,created FROM votes
        WHERE scope='majority' AND target=? AND choice IN ('0','1')`);
      for(const [index,q] of legacyQuestions.entries())copy.run(q.id,String(index));
      db.prepare('INSERT INTO majority_migrations VALUES(?,?)').run('legacy-v1',legacyHash);
    }
  });
  const byId=new Map(catalog.map(q=>[q.id,q]));
  const ids=catalog.map(q=>q.id),placeholders=ids.map(()=>'?').join(',');
  const totals=db.prepare(`SELECT question_id,choice,COUNT(*) AS n FROM majority_answers WHERE question_id IN (${placeholders}) GROUP BY question_id,choice`);
  const own=db.prepare(`SELECT a.question_id,a.choice,a.revision,r.question,r.en_question
    FROM majority_answers a LEFT JOIN majority_revisions r ON r.question_id=a.question_id AND r.revision=a.revision
    WHERE a.voter=? AND a.question_id IN (${placeholders})`);
  const unassigned=db.prepare(`SELECT COUNT(*) AS n FROM votes v
    LEFT JOIN majority_legacy_map m ON m.legacy_index=v.target
    LEFT JOIN majority_answers a ON a.question_id=m.question_id AND a.voter=v.voter
    WHERE v.scope='majority' AND v.voter=? AND
      (m.question_id IS NULL OR v.choice NOT IN ('0','1') OR a.choice IS NULL OR a.choice<>CAST(v.choice AS INTEGER))`);
  return {
    read(voter){
      const counts=new Map(ids.map(id=>[id,[0,0]]));
      for(const row of totals.all(...ids))if(row.choice===0||row.choice===1)counts.get(row.question_id)[row.choice]=row.n;
      const answers=new Map(own.all(voter,...ids).map(row=>[row.question_id,row]));
      return {legacyIds,unassignedLegacy:unassigned.get(voter).n,questions:catalog.map(q=>{
        const answer=answers.get(q.id);
        if(answer&&(!answer.question||!answer.en_question))throw new Error('Saved answer wording is unavailable');
        return {...q,counts:counts.get(q.id),choice:answer?String(answer.choice):null,answerRevision:answer?.revision??null,
          ...(answer&&answer.revision!==q.revision?{answerSnapshot:{id:q.id,revision:answer.revision,question:answer.question,options:q.options,en:{question:answer.en_question,options:q.en.options}}}:{})};
      })};
    },
    answer(voter,input){
      if(!validQuestionId(input.id))fail(400,'Нужен постоянный ID вопроса. Обновите страницу.','invalid_question_id');
      const q=byId.get(input.id);
      if(!q)fail(404,'Вопрос больше недоступен. Выберите другой.','question_unavailable');
      if(input.revision!==q.revision)fail(409,'Формулировка вопроса обновилась. Проверьте её перед ответом.','question_changed');
      integer(input.choice,0,1);
      return transaction(db,()=>{
        const old=db.prepare('SELECT choice,revision FROM majority_answers WHERE question_id=? AND voter=?').get(q.id,voter);
        if(old){
          if(old.choice!==input.choice)fail(409,'Ваш голос уже учтён.','already_answered');
          return {ok:true,id:q.id,duplicate:true,answerRevision:old.revision};
        }
        db.prepare('INSERT INTO majority_answers VALUES(?,?,?,?,?)').run(q.id,voter,input.choice,q.revision,Date.now());
        return {ok:true,id:q.id,duplicate:false,answerRevision:q.revision};
      });
    }
  };
}
