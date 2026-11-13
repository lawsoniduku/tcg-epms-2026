import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleState} from '../public/workspace/sample.mjs';
import {execute,view,exportData,processDeadlines} from '../public/workspace/engine.mjs';
import {addWorkdays,addMonths,list} from '../public/workspace/model.mjs';
function journey(history=true){
 const s=sampleState({history});const user=id=>s.users.find(x=>x.id===id);
 function act(who,type,action,values={},record=null,at='2026-11-05T10:00:00Z'){
  const result=execute(s,user(who),{type,action,values,id:record?.id,version:record?.version},at);
  return s.records.find(r=>r.id===result.id);
 }
 const doIt=(u,r,a,v={},at)=>act(u,r.type,r.type+'.'+a,v,r,at);
 return {s,act,doIt,user};
}
function goalSet(j,r){
 const objective=list(j.s,'strategy').find(x=>x.level==='Individual').id;
 ['Financial','Customer','Process','Learning'].forEach((perspective,i)=>j.doIt('manager',r,'goal',{title:perspective+' test',objective,perspective,outcome:'Deliver outcome',weight:[20,20,50,10][i],baseline:60,target:100,unit:'units',direction:'Higher is better',thresholds:'',source:'Source ledger',evidence:'Period report',leadership:'No',gateCap:5,gate:''}));
 j.doIt('manager',r,'submitGoals');j.doIt('manager',r,'managerApprove',{discussion:'Discussed and agreed targets with employee'});j.doIt('pm',r,'qa',{qa:'Checked sources, weights and standards'});j.doIt('hod',r,'baseline',{reference:'AUTH'});
}
function new360(j){
 const policy=list(j.s,'policy')[0];
 const c=j.act('pm','cycle','cycle.new',{title:'Q1 2027 test',start:'2027-01-01',end:'2027-03-31',policyId:policy.id,behaviourMode:'Full 360',selfDue:'2027-03-31',managerDue:'2027-04-07',calibrationDue:'2027-04-14',closeDue:'2027-04-21'});
 j.doIt('pm',c,'open');return list(j.s,'review').find(r=>r.cycleId===c.id);
}
function feedback(j,r,who,category){
 j.doIt('employee',r,'nominate',{rater:who,category,exposure:'Observed employee throughout the period'});
 const response=list(j.s,'response').find(x=>x.reviewId===r.id&&x.rater===who);j.doIt('manager',response,'endorse',{decision:'Endorse',reason:'Verified exposure'});j.doIt('pm',response,'invite',{validation:'Checked relationship and conflicts'});
 j.doIt(who,response,'submit',{integrity:4,execution:4,teamwork:4,customerFocus:4,improvement:4,...(r.snapshot.peopleManager?{leadership:4}:{}),example:'Restricted example for moderation'});j.doIt('pm',response,'moderate',{decision:'Valid',reason:'Relevant observed behaviour'});return response;
}
test('Track A from authored KPIs and 360 observations through independent calibration, employee receipt and closure',()=>{
 const j=journey(false),r=new360(j);goalSet(j,r);
 j.doIt('manager',r,'checkin',{kind:'Mid-quarter checkpoint',risk:'On track',progress:'Measures reviewed',support:'Training agreed',due:'2027-03-01'});
 j.doIt('manager',r,'openSelf');const self={development:'Improve QA'},actual={summary:'Reconciled to period register'};
 for(const g of r.goals){self['score_'+g.id]=5;self['note_'+g.id]='Documented contribution';actual['actual_'+g.id]=110;actual['evidence_'+g.id]='Validated measurement';actual['stretch_'+g.id]='No';actual['rationale_'+g.id]='Verified output exceeded the agreed threshold';}
 j.doIt('employee',r,'self',self);feedback(j,r,'manager','Manager');const peer=feedback(j,r,'observer1','Peer');feedback(j,r,'observer2','Peer');feedback(j,r,'observer3','Peer');feedback(j,r,'observer4','Stakeholder');
 assert.throws(()=>view(j.s,j.user('employee'),{id:peer.id}),/scope/);
 j.doIt('manager',r,'assess',actual);assert.equal(r.supervisorScore,4);assert.equal(r.assessment.behaviour.method,'Equal individual raters');
 assert.throws(()=>j.doIt('hod',r,'calibrate',{score:5}),/allow/);
 j.doIt('pm',r,'panel',{chair:'hod',members:'Panel',mandate:'Mandate',conflicts:'No conflicts'});
 j.doIt('hod',r,'calibrate',{score:4.55,reason:'Additional verified evidence',evidence:'E1',members:'Panel',consequential:'Yes'});
 assert.throws(()=>j.doIt('pm',r,'lock',{}),/allow/);
 j.doIt('executive',r,'moderate',{reason:'Panel evidence confirmed',evidence:'E2'});j.doIt('pm',r,'lock',{reason:'',evidence:''});
 assert.equal(view(j.s,j.user('employee'),{id:r.id}).detail.data.finalScore,undefined);
 assert.throws(()=>j.doIt('pm',r,'release'),/feedback/);j.doIt('pm',r,'feedbackThemes',{strengths:'Supports cross-team delivery',check:'Reviewed and safe to release'});
 j.doIt('pm',r,'release');let employeeView=view(j.s,j.user('employee'),{id:r.id}).detail;assert.equal(employeeView.data.finalScore,4.55);assert.equal(employeeView.data.feedback.strengths,'Supports cross-team delivery');assert.equal(employeeView.data.calibrations,undefined);
 j.doIt('manager',r,'conversation',{discussion:'Reviewed contribution',owner:'Manager',due:'2027-05-01'});j.doIt('employee',r,'ack',{comment:'Received'});j.doIt('pm',r,'close',{development:'Coaching plan'});assert.equal(r.status,'Closed');
 assert.match(exportData(j.s,j.user('auditor'),'scores'),/4\.55/);
});
test('360 blocks an insufficient anonymous pool and accepts a sufficient pool without category quotas',async()=>{
 const {behaviourResult}=await import('../public/workspace/quarterly.mjs');const j=journey(false),r=new360(j);goalSet(j,r);feedback(j,r,'manager','Manager');feedback(j,r,'observer1','Peer');feedback(j,r,'observer2','Peer');
 const ctx={s:j.s,actor:j.user('manager')};assert.throws(()=>behaviourResult(ctx,r),/360_DATA_PENDING/);
 feedback(j,r,'observer3','Peer');assert.equal(behaviourResult(ctx,r).score,4);
});
test('deadline advancement, alternate reviewer and prospective amendments preserve historical baseline',()=>{
 const j=journey(false),r=list(j.s,'review')[0];goalSet(j,r);const old=r.goals[0].target;
 j.doIt('manager',r,'amend',{goalId:r.goals[0].id,target:105,effective:'2026-11-10',rationale:'Territory change',evidence:'AUTH'});j.doIt('pm',r,'amendQA',{decision:'Pass',assessment:'Prospective'});j.doIt('hod',r,'amendApprove',{decision:'Approve',reference:'HOD'});
 assert.equal(r.baseline.goals[0].target,old);assert.equal(r.amendments[0].target,105);
 j.doIt('manager',r,'openSelf');processDeadlines(j.s,'2027-02-01T00:00:00Z');const notifications=j.s.outbox.length;processDeadlines(j.s,'2027-02-01T00:00:00Z');assert.equal(j.s.outbox.length,notifications);assert.equal(r.status,'Manager assessment');assert.equal(r.selfReview,null);
});
test('commercial validated months progress through recovery without duplicating Track A',()=>{
 const j=journey(false),existing=list(j.s,'commercial')[0];
 for(const [i,month] of ['2027-01-01','2027-02-01','2027-03-01'].entries()){
  const r=j.act('sales','commercial','commercial.new',{employeeId:existing.employeeId,month,schedule:'S',target:100,unit:'units',minimum:85,criticalCap:3,qualityRule:'Q',executionRule:'X',ramp:'No'});
  j.doIt('hod',r,'approve',{approval:'HOD'});j.doIt('sales',r,'freeze',{actual:40,quality:3,execution:3,breach:'No',source:'Signed ledger',context:'Reconciled'});
  assert.throws(()=>j.doIt('manager',r,'review',{review:'x'}),/allow/);j.doIt('finance',r,'validate',{reference:'F'});j.doIt('manager',r,'review',{review:'Agreed support'});assert.equal(r.recovery,['First month alert','Structured recovery review','HR and ER decision review'][i]);j.doIt('commercial-employee',r,'ack');
 }
 assert.ok(list(j.s,'review').every(r=>r.employeeId!==existing.employeeId));
});
test('probation follows all checkpoints, ER review and a human decision with effective-date routing',async()=>{
 const j=journey(false),p=list(j.s,'probation')[0];j.doIt('hod',p,'approve',{reference:'Approved'});
 for(const [i,m] of [1,3,5].entries())j.doIt('manager',p,'m'+m,{progress:'On track',evidence:'Observed delivery',support:'Training delivered',discussed:['2026-08-01','2026-10-01','2026-12-01'][i],response:'Discussed'});
 j.doIt('manager',p,'assess',{delivery:4,capability:3,behaviour:4,critical:'No',recommendation:'Confirm',grounds:'Whole-period review',employeeResponse:'Discussed',evidence:'E'});assert.equal(p.assessment.score,3.8);
 j.doIt('er',p,'er',{fairness:'Contract and support verified',authority:'ER'});j.doIt('executive',p,'decide',{reason:'Confirmed',reference:'DOA',effective:'2027-01-01'});assert.equal(p.status,'Closed');
 const {trackAt}=await import('../public/workspace/governance.mjs');const e=j.s.records.find(e=>e.id===p.employeeId);assert.equal(trackAt(j.s,e,'2026-12-31'),'C');assert.equal(trackAt(j.s,e,'2027-01-01'),'A');
});
test('employee appeal requires independent reviewer and preserves the previously locked score on reassessment',()=>{
 const j=journey(),r=list(j.s,'review').find(r=>r.status==='Closed');
 const a=j.act('employee','appeal','appeal.new',{reviewId:r.id,grounds:'Evidence omitted',evidence:'ERR',lateReason:'Service delay'});
 assert.throws(()=>j.doIt('pm',a,'assign',{reviewer:'hod',intake:'Check'}),/Choose/);
 j.doIt('pm',a,'assign',{reviewer:'er',intake:'Independent and in scope'});j.doIt('er',a,'resolve',{outcome:'Return for reassessment',reason:'Evidence found',evidence:'AUTH'});j.doIt('pm',a,'communicate',{reference:'Written outcome'});assert.equal(r.status,'Calibration');assert.equal(r.revisions.length,1);assert.equal(r.releasedAt,null);
});
test('budgeted merit uses closed numeric results, dual governance, uniform scaling and a single reconciled export',()=>{
 const j=journey(),e=list(j.s,'employee')[0],r=j.act('finance','merit','merit.new',{title:'2025 annual',frequency:'Annual',start:'2025-01-01',authority:'Approved matrix',pool:50000,reference:6,cap:12,factor3:1,factor4:1.3,factor5:1.75,salesMap:'',cpiStart:100,cpiEnd:112,cpiSource:'Synthetic Jan–Dec indices'});
 j.act('finance','payBasis','payBasis.new',{employeeId:e.id,annual:1000000,grade:'Approved band',effective:'2025-12-31',source:'Certified payroll'});
 j.act('finance','payBasis','payBasis.new',{employeeId:e.id,annual:1500000,grade:'Next band',effective:'2026-01-01',source:'Next period'});
 j.doIt('finance',r,'line',{employeeId:e.id,salary:1000000,position:1,paySource:'Certified payroll',eligibility:'Eligible'});assert.equal(r.lines[0].proposedKobo,7800000);
 assert.throws(()=>j.doIt('finance',r,'submit',{normalise:'No',budget:'Over cap'}),/scaling/);
 j.doIt('finance',r,'submit',{normalise:'Yes',budget:'Approved proportional scaling'});assert.equal(r.costKobo,5000000);
 assert.throws(()=>exportData(j.s,j.user('finance'),'payroll',r.id),/approved/);j.doIt('pm',r,'equity',{findings:'Checked',decision:'Approve for executive review'});j.doIt('executive',r,'authorise',{authority:'E',effective:'2026-01-01',decision:'Approve'});assert.throws(()=>j.doIt('finance',r,'export',{reference:'Same maker'}),/allow/);j.user('finance-check').employeeId=e.id;
 assert.throws(()=>j.doIt('finance-check',r,'export',{reference:'Own award'}),/allow/);
 delete j.user('finance-check').employeeId;
 j.doIt('finance-check',r,'export',{reference:'Finance'});assert.match(exportData(j.s,j.user('finance'),'payroll',r.id),/50000/);
 j.doIt('finance',r,'ack',{reference:'Payroll acknowledgement',cost:50000});assert.equal(r.status,'Reconciled');assert.throws(()=>view(j.s,j.user('employee'),{id:r.id}),/scope/);
});
test('capability case requires support, ER and HOD approval, checkpoints and a hearing before an employment decision',()=>{
 const j=journey(false),e=list(j.s,'employee')[0],r=j.act('manager','capability','capability.new',{employeeId:e.id,kind:'Capability',gap:'Missed measured delivery',standard:'Agreed KPI',evidence:'E',context:'Support reviewed'});
 j.doIt('manager',r,'coach',{support:'Training',response:'Received',followup:'2026-11-20',next:'Request formal review'});j.doIt('hod',r,'escalate',{reason:'Gap persists',evidence:'E'});j.doIt('er',r,'warning',{reason:'Diagnostic completed',evidence:'E',response:'Employee heard',next:'Written warning and PIP proposal'});
 j.doIt('manager',r,'plan',{days:'30',start:'2026-11-06',targets:'Close 90% within SLA',support:'Training and 1:1',cadence:'Weekly on Friday',consequence:'Reviewed against evidence with right to respond'});
 j.doIt('er',r,'activate',{reference:'ER'});j.doIt('hod',r,'hodActivate',{reference:'HOD'});assert.throws(()=>j.doIt('er',r,'evaluate',{outcome:'Improved',reason:'OK',evidence:'E',response:'Employee heard'}),/checkpoint/);
 for(const day of r.checkpointDates)j.doIt('manager',r,'check',{scheduled:day,performance:'Improved',support:'Coaching delivered',response:'Discussed'},day+'T12:00:00Z');j.doIt('er',r,'evaluate',{outcome:'Formal capability hearing',reason:'Continued gap',evidence:'E',response:'Feedback'},r.end+'T13:00:00Z');assert.equal(r.status,'Hearing');assert.throws(()=>j.doIt('executive',r,'suspend',{}),/allow/);
});
test('calendar excludes weekends and approved holidays and handles month end',()=>{assert.equal(addWorkdays('2026-11-06',1,['2026-11-09']),'2026-11-10');assert.equal(addMonths('2027-01-31',1),'2027-02-28');});

test('deduction CSV previews valid and invalid rows and applies a single immutable revision',()=>{
 const j=journey();const r=list(j.s,'review').find(r=>r.status==='Closed');const c=j.s.records.find(c=>c.id===r.cycleId);
 // An expressly authorised test policy snapshot permits this controlled adjustment.
 Object.assign(c.policy,{allowDeduction:'Yes',deductionCap:.5,deductionFloor:1,deductionBasis:'Acceptance-only event'});
 j.doIt('pm',r,'reopen',{reason:'Confirmed source correction',approval:'TEST-AUTH'});
 j.doIt('pm',r,'panel',{chair:'hod',members:'Panel',mandate:'AUTH',conflicts:'No conflict'});
 j.doIt('hod',r,'calibrate',{score:4,reason:'Retained',evidence:'AUTH',members:'Panel',consequential:'No'});
 const csv='employee_id,appraisal_cycle_id,deduction_points,reason_comment,evidence_reference\nT001,'+c.title+',0.20,Verified adjustment,REF\nUNKNOWN,'+c.title+',0.20,Test,REF';
 const b=j.act('pm','batch','batch.preview',{filename:'Adjustments',csv});assert.equal(b.accepted,1);assert.equal(b.rejected,1);assert.equal(r.revisions.length,1);
 j.doIt('pm',b,'apply');assert.equal(r.revisions.at(-1).finalScore,3.8);assert.equal(r.revisions.at(-1).batchId,b.id);assert.equal(r.revisions.length,2);
 assert.throws(()=>j.doIt('pm',b,'apply'),/allow/);
});
test('commercial CSV validates provenance, approved targets and duplicate source IDs',()=>{
 const j=journey(false),month=list(j.s,'commercial')[0];j.doIt('hod',month,'approve',{approval:'HOD reference'});
 const input={title:'Month-end',sourceId:'SYNTHETIC-SIGNED-001',signature:'Commercial owner verification',csv:'staff_id,month,actual,quality,execution,breach,source\nT002,2026-11-01,105,4,4,No,REF'};
 const b=j.act('sales','commercial','commercial.import',input);assert.equal(b.accepted,1);j.doIt('sales',b,'apply');assert.equal(month.status,'Source validation');assert.equal(month.inputs.actual,105);
 assert.throws(()=>j.act('sales','commercial','commercial.import',input),/already/);assert.throws(()=>j.doIt('sales',month,'validate',{reference:'self'}),/allow/);
});
test('historical migration keeps raw ERP labels, quarantines mismatches and gates rollout by separate roles',()=>{
 const j=journey(false),input={title:'Trial import',source:'ERP register',csv:'staff_id,cycle,supervisor_score,legacy_status\nT001,Q3,4.20,Awaiting supervisor\nUNKNOWN,Q3,200,Final'};
 const b=j.act('pm','migration','migration.new',input);assert.equal(b.unresolved,1);assert.equal(b.rows[0].canonical,'Supervisor score recorded');assert.equal(b.rows[0].rawStatus,'Awaiting supervisor');
 assert.throws(()=>j.doIt('pm',b,'sign',{reference:'x',findings:'x'}),/quarantined/);
 const good=j.act('pm','migration','migration.new',{...input,csv:input.csv.split('\n').slice(0,2).join('\n')});
 j.doIt('pm',good,'sign',{reference:'Signed crosswalk',findings:'1 eligible, 1 scored'});const p=list(j.s,'policy')[0];
 const launch=j.act('pm','cutover','cutover.new',{title:'Test environment',policyId:p.id,migrationId:good.id,uat:'UAT',rollback:'Restore drill',training:'Manager brief'});
 assert.throws(()=>j.doIt('executive',launch,'executive',{reference:'x',findings:'x'}),/allow/);
 for(const who of ['admin','finance','er','executive'])j.doIt(who,launch,who,{reference:'SIGN-'+who,findings:'Acceptance completed'});
 assert.equal(launch.status,'Approved');assert.equal(new Set(launch.signatures.map(x=>x.actor)).size,5);
});
test('four closed results support an independently evidenced talent nomination and separate recognition decision',()=>{
 const j=journey(),e=list(j.s,'employee')[0];const t=j.act('talent','talent','talent.new',{employeeId:e.id,potential:'Established',potentialEvidence:'Observed readiness evidence',aspirations:'Develop as a team lead',owner:'Manager',reviewDate:'2027-01-01',development:'Mentor a new team member',successorFor:'Operations lead'});
 assert.equal(t.index,4);assert.equal(t.status,'Draft');j.doIt('talent',t,'submit',{route:'Promotion consideration',roleNeed:'Approved vacancy and budget',readiness:'Readiness panel evidence'});
 j.doIt('executive',t,'decide',{decision:'Defer',reason:'Further experience',evidence:'Panel minute'});assert.equal(t.status,'Closed');
 assert.throws(()=>view(j.s,j.user('employee'),{id:t.id}),/scope/);
 const q=list(j.s,'review').find(x=>x.status==='Closed');const n=j.act('pm','recognition','recognition.new',{reviewId:q.id,title:'Service recognition',impact:'Verified sustained service',owner:'HOD'});
 j.doIt('executive',n,'authorise',{decision:'Approve',reason:'Separate recognition budget'});assert.equal(n.status,'Approved');
});
test('inflation scenarios require matching CPI periods and distinguish purchasing power from nominal awards',()=>{
 const j=journey(false),input={title:'Annual model',window:'Twelve months',start:'2025-01-01',end:'2026-01-01',initial:100,closing:112,source:'Synthetic index observations',payroll:1000000,merit:6,cola:4,market:0,promotion:0};
 const model=j.act('finance','scenario','scenario.new',input);assert.equal(model.realMovement,-1.79);assert.equal(model.annualCostNGN,100000);assert.throws(()=>j.act('finance','scenario','scenario.new',{...input,window:'Six months'}),/match/);
});

test('FBK-01/02/04 manager questionnaire, dual validation, expiry and confidential release boundaries',()=>{
 const j=journey(false),r=new360(j);goalSet(j,r);r.snapshot.peopleManager=true;r.campaign.questions.push(['leadership','People leadership']);
 const values={rater:'observer1',category:'Direct report',exposure:'Worked together all quarter'};
 assert.throws(()=>j.doIt('manager',r,'nominate',values),/allow/);
 j.doIt('employee',r,'nominate',values);
 assert.throws(()=>j.doIt('employee',r,'nominate',values),/already/);
 const a=list(j.s,'response').find(x=>x.reviewId===r.id);
 assert.throws(()=>j.doIt('pm',a,'invite',{validation:'checked'}),/allow/);
 j.doIt('manager',a,'endorse',{decision:'Endorse',reason:'Reporting line verified'});
 j.doIt('pm',a,'invite',{validation:'No conflicts'});
 j.doIt('observer1',a,'start');
 const form=view(j.s,j.user('observer1'),{id:a.id}).detail.actions.find(x=>x.id==='response.submit');
 assert.ok(form.fields.some(f=>f.key==='leadership'));
 for(const id of ['employee','manager','finance','executive','auditor'])assert.throws(()=>view(j.s,j.user(id),{id:a.id}),/scope/);
 j.s.liveCalendar=true;
 assert.throws(()=>j.doIt('observer1',a,'submit',{},'2027-04-08T08:00:00Z'),/allow/);
 processDeadlines(j.s,'2027-04-08T08:00:00Z');assert.equal(a.status,'Expired');
 const c=list(j.s,'cycle').find(c=>c.id===r.cycleId);
 assert.equal(view(j.s,j.user('pm'),{id:c.id}).detail.data.campaignProgress.Expired,1);
 assert.equal(view(j.s,j.user('employee'),{id:c.id}).detail.data.campaignProgress,undefined);
});

test('FBK-03 people managers use equal votes across four participating categories; raw comments stay in moderation',async()=>{
 const {behaviourResult}=await import('../public/workspace/quarterly.mjs');
 const j=journey(false),r=new360(j);goalSet(j,r);r.snapshot.peopleManager=true;r.campaign.questions.push(['leadership','People leadership']);
 for(let i=5;i<=7;i++)j.s.users.push({id:'observer'+i,name:'Additional '+i,role:'employee',active:true});
 const groups=[['manager','Manager',5],['observer1','Peer',4],['observer2','Peer',4],['observer3','Peer',4],
 ['observer4','Direct report',3],['observer5','Direct report',3],['observer6','Direct report',3],['observer7','Stakeholder',2]];
 for(const [id,category,rating] of groups){
   j.doIt('employee',r,'nominate',{rater:id,category,exposure:'Quarterly working exposure'});
   const a=list(j.s,'response').find(x=>x.rater===id);
   j.doIt('manager',a,'endorse',{decision:'Endorse',reason:'Confirmed relationship'});
   j.doIt('pm',a,'invite',{validation:'Checked conflicts'});
   j.doIt(id,a,'submit',{improvement:rating,execution:rating,customerFocus:rating,integrity:rating,teamwork:rating,leadership:rating,example:'RESTRICTED COMMENT'});
   j.doIt('pm',a,'moderate',{decision:'Valid',reason:'Quality verified'});
 }
 const b=behaviourResult({s:j.s},r);assert.equal(b.score,3.5);assert.equal(b.groups,undefined);
 assert.throws(()=>view(j.s,j.user('finance'),{id:r.id}),/scope/);
 for(const who of ['employee','manager','executive','auditor'])assert.doesNotMatch(JSON.stringify(view(j.s,j.user(who),{id:r.id}).detail),/RESTRICTED COMMENT/);
});

test('ORG-04 future transfers preserve a historic cycle roster and manager',async()=>{
 const {rosterAt}=await import('../public/workspace/roster.mjs');
 const j=journey(false),e=list(j.s,'employee')[0];
 j.doIt('pm',e,'update',{name:e.title,email:e.email,company:e.company,department:'New unit',jobTitle:e.jobTitle,managerId:'manager',confirmed:'Yes',commercial:'No',peopleManager:'No',joinedAt:e.joinedAt,effective:'2027-01-01',grade:'G8'});
 assert.equal(rosterAt(e,'2026-12-31').department,'Operations');
 assert.equal(rosterAt(e,'2027-01-01').grade,'G8');
 processDeadlines(j.s,'2027-01-02T10:00:00Z');assert.equal(e.department,'New unit');
 assert.equal(list(j.s,'review')[0].snapshot.department,'Operations');
});

test('REW-03 commercial conversion requires an effective approved schedule',async()=>{
 const {mappedRating}=await import('../public/workspace/commercial-mapping.mjs');const j=journey(false);
 const m=j.act('finance','mapping','mapping.new',{title:'Field sales',effective:'2026-01-01',authority:'Synthetic authority',lower2:2,lower3:3,lower4:4,lower5:4.8});
 const monthly={month:'2026-01-01',result:{score:3.9}};
 assert.throws(()=>mappedRating(j.s,m.id,monthly),/published/);j.doIt('executive',m,'publish',{reference:'Approved'});
 assert.equal(mappedRating(j.s,m.id,monthly),3);assert.throws(()=>mappedRating(j.s,m.id,{...monthly,month:'2025-12-01'}),/effective/);
});

test('v4.2 CAD-01 to CAD-07: future rerun replaces only drafts; launched reviews keep their own campaign',()=>{
 const j=journey(false);
 const config={year:2028,frequency:'Quarterly',policyId:list(j.s,'policy')[0].id,authority:'Approved policy change',reason:'Formal review schedule',targetBasis:'Whole period'};
 const first=j.act('pm','cadence','cadence.new',config);
 j.doIt('pm',first,'activate',{approval:'PM lead'});assert.equal(first.preview.formalPeriods,4);
 const change=j.act('pm','cadence','cadence.new',{...config,frequency:'Biannual'});
 assert.equal(change.preview.replacedDrafts,4);
 j.doIt('pm',change,'activate',{approval:'PM lead'});
 const periods=list(j.s,'cycle').filter(c=>c.cadenceId===change.id);
 assert.deepEqual(periods.map(c=>[c.start,c.end]),[['2028-01-01','2028-06-30'],['2028-07-01','2028-12-31']]);
 for(const c of periods)j.doIt('pm',c,'open');
 const campaigns=list(j.s,'review').filter(r=>periods.some(c=>c.id===r.cycleId)).map(r=>r.campaign);
 assert.equal(new Set(campaigns.map(c=>c.id)).size,2);
 assert.ok(campaigns.every(c=>c.cadence==='Biannual'&&c.questions.length===5));
 assert.throws(()=>j.act('pm','cadence','cadence.new',config),/LOCKED/);
});
test('v4.2 UAT-360-05/08: four independent observers with 5,4,3,4 contribute exactly one vote each',async()=>{
 const {behaviourResult}=await import('../public/workspace/quarterly.mjs');
 const j=journey(false),r=new360(j);goalSet(j,r);
 for(const [id,category,score] of [['manager','Manager',5],['observer1','Peer',4],['observer2','Peer',3],['observer3','Peer',4]]){
   j.doIt('employee',r,'nominate',{rater:id,category,exposure:'Direct observation during this period'});
   const assignment=list(j.s,'response').find(x=>x.rater===id);
   j.doIt('manager',assignment,'endorse',{decision:'Endorse',reason:'Worked together'});j.doIt('pm',assignment,'invite',{validation:'Checked'});
   j.doIt(id,assignment,'submit',{improvement:score,execution:'NOT_OBSERVED',customerFocus:score,integrity:score,teamwork:score});
   j.doIt('pm',assignment,'moderate',{decision:'Valid',reason:'Direct observations'});
 }
 const result=behaviourResult({s:j.s},r);assert.equal(result.score,4);assert.equal(result.groups,undefined);
 assert.ok(!result.competencies.find(c=>c.competency==='Efficiency and execution'));
});
test('v4.2 UAT-FIN-04/05: unchanged supervisor base locks after cohort signoff; manual deduction floors at one',()=>{
 const j=journey(false),r=new360(j),cycle=list(j.s,'cycle').find(c=>c.id===r.cycleId);
 // Exercise finalisation at its input boundary using independently submitted numeric scores.
 r.status='Calibration';r.supervisorScore=4.2;r.assessment={behaviour:{source:'360 feedback'}};
 j.doIt('pm',cycle,'completeCalibration',{reference:'Signed panel minute'});
 j.doIt('pm',r,'lock',{reason:'',evidence:''});assert.equal(r.revisions.at(-1).finalScore,4.2);
 const {id}=r;Object.assign(r,{status:'Finalisation',supervisorScore:1.1,calibratedScore:1.1});
 cycle.policy.allowDeduction='Yes';
 assert.throws(()=>j.doIt('pm',r,'lock',{deduction:.5,reason:'  '}),/reason/);
 j.doIt('pm',r,'lock',{deduction:.5,reason:'Authorised case adjustment'});
 assert.equal(r.revisions.at(-1).finalScore,1);assert.equal(r.revisions.at(-1).deductionPoints,.5);
});

test('reopened cohort retains supervisor basis and requires fresh feedback clearance',()=>{
 const j=journey(),r=list(j.s,'review').find(r=>r.status==='Closed'),c=j.s.records.find(c=>c.id===r.cycleId);
 r.calibratedScore=3.85;r.supervisorScore=3.2;r.feedbackReviewed={by:'pm'};r.feedbackThemes={strengths:'Old'};
 j.doIt('pm',r,'reopen',{reason:'Reassessment',approval:'approved'});
 assert.equal(r.feedbackReviewed,null);
 j.doIt('pm',c,'completeCalibration',{reference:'New cohort'});
 j.doIt('pm',r,'lock');assert.equal(r.revisions.at(-1).finalScore,3.2);
 const projected=view(j.s,j.user('pm')).operations.find(o=>o.cycle===c.title&&o.staff_id===r.snapshot.staffId);
 assert.equal(projected.calibrated,true);
 const csv=exportData(j.s,j.user('pm'),'scores',null,{cycle:c.title});
 assert.ok(csv.includes(c.title));assert.equal(csv.includes('2025 Q4'),false);
 assert.throws(()=>exportData(j.s,j.user('pm'),'typo'),/Unknown report/);
});

test('KPI import preview validates manual fields and policy totals without changing the draft',async()=>{
 const {sampleState}=await import('../public/workspace/sample.mjs');
 const {previewGoals,goalHeaders}=await import('../public/workspace/goal-import.mjs');
 const s=sampleState(),draft=s.records.find(r=>r.type==='review'&&r.status==='Goal setting');
 const manager=s.users.find(u=>u.id===draft.snapshot.managerId);
 const goals=s.records.find(r=>r.type==='review'&&r.baseline?.goals.length).baseline.goals;
 const csv=[goalHeaders,...goals.map(g=>goalHeaders.map(k=>g[k]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
 draft.goals=[];
 const preview=previewGoals(s,manager,draft.id,csv);
 assert.equal(preview.valid,true);assert.equal(draft.goals.length,0);
 assert.equal(previewGoals(s,manager,draft.id,csv.replace(goals[0].objective,'missing')).valid,false);
 const command={type:'review',id:draft.id,version:draft.version,action:'review.importGoals',values:{csv,versions:JSON.stringify(preview.versions)}};
 execute(s,manager,command);assert.equal(draft.status,'Goal setting');assert.equal(draft.goals.length,goals.length);
 assert.equal(s.records.filter(r=>r.type==='goalBatch').length,1);
});

test('PM configures a draft cycle, freezes custom questions and weights at launch, and exports only its cohort',async()=>{
 const j=journey(false),p=list(j.s,'policy')[0],c=j.act('pm','cycle','cycle.new',{title:'Example Q1',start:'2097-01-01',end:'2097-03-31',policyId:p.id});
 assert.throws(()=>j.doIt('manager',c,'weights',{bsc:60,feedback:40}),/role/);
 assert.throws(()=>j.doIt('pm',c,'weights',{bsc:60,feedback:50}),/100/);
 j.doIt('pm',c,'weights',{bsc:60,feedback:40});
 j.doIt('pm',c,'addQuestion',{prompt:'How consistently does this colleague share progress?',audience:'Everyone'});
 j.doIt('pm',c,'open');const r=list(j.s,'review').find(x=>x.cycleId===c.id);
 assert.deepEqual(r.componentWeights,{bsc:60,feedback:40});assert.ok(r.campaign.questions.some(q=>q[1].includes('share progress')));
 assert.throws(()=>j.doIt('pm',c,'weights',{bsc:50,feedback:50}),/stage/);
 const {cycleReport}=await import('../public/workspace/cycle-report.mjs');
 const sheets=cycleReport(j.s,j.user('pm'),c.id);
 assert.equal(sheets[1][1].length,c.membership.filter(e=>e.track==='A').length+1);
 assert.throws(()=>cycleReport(j.s,j.user('employee'),c.id),/authority/);
 const {compositeScore}=await import('../public/workspace/quarterly.mjs');
 assert.equal(compositeScore([{rating:5,weight:100}],{units:2,divisor:1},r.componentWeights),3.8);
});
