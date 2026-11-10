// Real child process, instrumented only at the SQLite commit boundary.
import {createApp} from '../../server/index.mjs';
const app=await createApp({dataDir:process.env.TEST_DATA_DIR,disableRateLimit:true,appId:'majority'});
const original=app.db.exec.bind(app.db),mode=process.env.TEST_STOP_AT;
app.db.exec=sql=>{
  if(sql==='COMMIT'&&mode==='before')process.exit(92);
  const result=original(sql);
  if(sql==='COMMIT'&&mode==='after')process.exit(91);
  return result;
};
app.server.listen(0,'127.0.0.1',()=>process.send({port:app.server.address().port}));
