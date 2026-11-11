// Ephemeral acceptance fixture. The HTTP service uses the ordinary encrypted store and sandbox authentication.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openPlatform} from '../../server/platform-db.mjs';
import {platformHttp} from '../../server/platform-http.mjs';
import {execute} from '../../public/workspace/engine.mjs';
import {list} from '../../public/workspace/model.mjs';

const dir=mkdtempSync(join(tmpdir(),'pms-browser-'));
const store=openPlatform(join(dir,'acceptance.sqlite'),{demo:true,key:randomBytes(32).toString('base64')});
const fixtures=store.change(s=>{
  const staff=list(s,'employee').find(e=>e.staffId==='T001');
  const act=(who,type,verb,values,record)=>execute(s,s.users.find(u=>u.id===who),{
    type,action:type+'.'+verb,values,id:record?.id,version:record?.version
  },'2026-11-11T10:00:00Z');
  const cases=[];
  for(const [year,isLead] of [[2098,false],[2099,true]]){
    const result=act('pm','cycle','new',{title:'Browser acceptance '+year,start:year+'-01-01',end:year+'-03-31',policyId:list(s,'policy')[0].id,behaviourMode:'Full 360'});
    const cycle=s.records.find(c=>c.id===result.id);
    act('pm','cycle','open',{},cycle);
    const review=list(s,'review').find(r=>r.cycleId===cycle.id&&r.employeeId===staff.id);
    review.snapshot.peopleManager=isLead;
    const baseline=list(s,'review').find(r=>r.status==='Closed').baseline;
    for(const [i,g] of baseline.goals.entries()){
      const {id,anchors,...definition}=g;
      act('manager','review','goal',{...definition,leadership:isLead&&i===0?'Yes':'No'},review);
    }
    act('manager','review','submitGoals',{},review);
    act('manager','review','managerApprove',{discussion:'Employee reviewed and agreed targets'},review);
    act('pm','review','qa',{qa:'Checked measures and baseline'},review);
    act('hod','review','baseline',{reference:'Synthetic approval'},review);
    act('manager','review','checkin',{kind:'Mid-quarter checkpoint',risk:'On track',progress:'Measured progress',support:'Coaching',due:cycle.end},review);
    act('manager','review','openSelf',{},review);
    const self={development:'Improve customer service'};
    for(const goal of review.goals){self['score_'+goal.id]=4;self['note_'+goal.id]='Observed evidence';}
    act('employee','review','self',self,review);
    cases.push({id:review.id,year,isLead,goals:review.goals.map(g=>g.id)});
  }
  return cases;
});
const server=platformHttp(store,{demo:true});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({base:'http://127.0.0.1:'+server.address().port,cases:fixtures})));
process.on('SIGTERM',()=>{server.close();store.db.close();rmSync(dir,{force:true,recursive:true});process.exit();});
