import {emptyState,roles} from './model.mjs';
import {execute} from './engine.mjs';
const yearBeforeTransition=start=>start<'2026-01-01';
export function sampleState({history=true}={}) {
  const s=emptyState();
  s.users=Object.entries(roles).map(([role,name])=>({id:role,name,role,department:'Operations',active:true}));
  s.users.push({id:'finance-check',name:'Finance export checker',role:'finance',department:'Operations',active:true});
  for(let n=1;n<=4;n++)s.users.push({id:'observer'+n,name:'Observer '+n,role:'employee',department:'Operations',active:true});
  const act=(who,type,action,values={},r=null,at='2026-11-05T10:00:00Z')=>{
    const user=s.users.find(u=>u.id===who);
    const result=execute(s,user,{type,id:r?.id,version:r?.version,action,values},at);
    return s.records.find(x=>x.id===result.id);
  };
  const employee=(staffId,name,confirmed,commercial)=>act('pm','employee','employee.new',{staffId,name,email:staffId+'@example.invalid',company:'TCG',department:'Operations',jobTitle:commercial==='Yes'?'Relationship officer':'Operations specialist',managerId:'manager',confirmed,commercial,peopleManager:'No',joinedAt:confirmed==='Yes'?'2024-01-02':'2026-07-01'});
  const ada=employee('T001','Ada Okeke','Yes','No');s.users.find(u=>u.id==='employee').employeeId=ada.id;
  const sales=employee('T002','Tunde Adeyemi','Yes','Yes');const probation=employee('T003','Zainab Bello','No','No');
  s.users.push({id:'commercial-employee',employeeId:sales.id,role:'employee',name:'Tunde · employee',department:'Operations',active:true},{id:'probation-employee',employeeId:probation.id,role:'employee',name:'Zainab · employee',department:'Operations',active:true});
  const p=act('pm','policy','policy.new',{title:'Illustrative policy for acceptance testing',effective:'2025-01-01',authority:'SYNTHETIC-UAT',weight0:20,weight1:20,weight2:50,weight3:10,freshness:100,holidays:'',allowDeduction:'No',appealDays:5});
  act('executive','policy','policy.publish',{reference:'SYNTHETIC-EXEC'},p);
  let parent='ROOT';
  for(const [i,level] of ['Group','Business unit','Department','Team','Individual'].entries()){
    const o=act('pm','strategy','strategy.new',{title:['Improve service quality','Group shared services','Reliable operations','Faster case resolution','Deliver service commitments'][i],level,parent,unit:'Operations',outcome:'Meet approved service standards with documented evidence.'});
    act('executive','strategy','strategy.approve',{reference:'UAT-STRATEGY'},o);parent=o.id;
  }
  const periods=history?[['2025 Q1','2025-01-01','2025-03-31'],['2025 Q2','2025-04-01','2025-06-30'],['2025 Q3','2025-07-01','2025-09-30'],['2025 Q4','2025-10-01','2025-12-31']]:[];
  periods.push(['2026 Q4','2026-10-01','2026-12-31']);
  for(const year of new Set(periods.map(([,start])=>Number(start.slice(0,4))))){
    act('pm','setupCheck','setupCheck.review',{year,authority:'Fixture roster',findings:'Reviewed'});
    const schedule=act('pm','cadence','cadence.new',{year,frequency:'Quarterly',policyId:p.id,reason:'Fictional schedule',targetBasis:'Period targets',authority:'Fixture approval'});
    act('pm','cadence','cadence.activate',{approval:'Fixture sign-off'},schedule);
  }
  for(const [,start] of periods){
    const c=s.records.find(r=>r.type==='cycle'&&r.start===start);
    act('pm','cycle','cycle.open',{},c);
  }
  for(const [title,start,end] of periods){
    const after=days=>{const d=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
    const c=s.records.find(r=>r.type==='cycle'&&r.start===start);
    // Historical acceptance data represents the previously approved observations policy.
    if(yearBeforeTransition(start)){c.scoringVersion='legacy';c.behaviourMode='Documented observations';}
    const r=s.records.find(x=>x.type==='review'&&x.cycleId===c.id);
    if(title==='2026 Q4')continue;
    for(const [i,perspective] of ['Financial','Customer','Process','Learning'].entries())act('manager','review','review.goal',{title:['Cost stewardship','Customer service','Timely delivery','Learning application'][i],objective:parent,perspective,outcome:'Meet agreed target',weight:[20,20,50,10][i],baseline:80,target:100,unit:'points',direction:'Higher is better',thresholds:'',source:'Synthetic verified register',evidence:'Source reference',leadership:'No',gateCap:5,gate:''},r);
    act('manager','review','review.submitGoals',{},r);act('manager','review','review.managerApprove',{discussion:'Employee and manager agreed the targets'},r);act('pm','review','review.qa',{qa:'Measures verified'},r);act('hod','review','review.baseline',{reference:'UAT-BASE'},r);
    act('manager','review','review.checkin',{kind:'Mid-quarter checkpoint',risk:'On track',progress:'Reviewed outcomes',support:'Coaching session',due:end},r);
    act('manager','review','review.openSelf',{},r);
    const self={development:'Strengthen process analysis'},results={summary:'All submissions independently verified against the source.'};
    for(const g of r.goals){self['score_'+g.id]=4;self['note_'+g.id]='Evidence attached to source register';results['actual_'+g.id]=110;results['evidence_'+g.id]='UAT-VERIFIED';results['rationale_'+g.id]='Verified output exceeded the agreed threshold';results['stretch_'+g.id]='No';}
    act('employee','review','review.self',self,r);act('manager','review','review.observation',{score:4,observed:end,example:'Observed collaboration and accountability.',evidence:'UAT-OBS'},r);
    act('manager','review','review.assess',results,r);act('pm','review','review.panel',{chair:'hod',members:'Functional panel',mandate:'UAT-PANEL',conflicts:'Independent chair confirmed'},r);act('hod','review','review.calibrate',{score:4,reason:'Panel retained evidence-based result',evidence:'UAT-PANEL',members:'Functional panel',consequential:'No'},r);
    act('pm','review','review.lock',{reason:'',evidence:''},r);act('pm','review','review.release',{},r);act('manager','review','review.conversation',{discussion:'Agreed development priorities',owner:'Line manager',due:after(30)},r);act('employee','review','review.ack',{comment:'Received'},r);act('pm','review','review.close',{development:'Monthly development check-ins agreed'},r);
  }
  act('sales','commercial','commercial.new',{employeeId:sales.id,month:'2026-11-01',schedule:'UAT-COM-01',target:100,unit:'production units',minimum:85,criticalCap:3,qualityRule:'Verified portfolio quality rubric',executionRule:'Documentation and compliance rubric',ramp:'No'});
  act('manager','probation','probation.new',{employeeId:probation.id,deliverables:'Deliver agreed service standards',support:'Weekly manager coaching and training',evidence:'Operations register',contract:'UAT-CONTRACT'});
  return s;
}

