import { requireThat, visibleTo, canFinalise, canCalibrate, finalisationPreview, scoreValue, ratingFor } from './domain.mjs';
export function accessibleAppraisal(store,actor,id) {
  const a=store.getAppraisal(id);
  requireThat(a,'Appraisal not found.',404);
  const e=store.all('employees').find(e=>e.id===a.employeeId);
  requireThat(visibleTo(actor,e),'You do not have access to this employee.',403);
  return a;
}
export function bootstrap(store,actor) {
  const employees=store.all('employees').filter(e=>visibleTo(actor,e));
  const ids=new Set(employees.map(e=>e.id));
  const appraisals=store.all('appraisals').filter(a=>ids.has(a.employeeId)).map(a=>{
    if(actor.role!=='employee'&&actor.employeeId!==a.employeeId)return a;
    return {id:a.id,employeeId:a.employeeId,cycleId:a.cycleId,track:a.track,status:a.status,version:a.version,selfView:true,goals:a.goals,checkIns:a.checkIns,selfReview:a.selfReview,released:a.released,revisions:a.released?[{finalScore:a.revisions.at(-1).finalScore,finalRating:a.revisions.at(-1).finalRating}]:[]};
  });
  const events=['pm','auditor','executive'].includes(actor.role)?store.events():[];
  return {actor,synthetic:true,cycle:store.meta('cycle'),deductionPolicy:store.meta('deductionPolicy'),decisions:store.meta('decisions'),employees,appraisals,audit:events,capabilities:{finalise:canFinalise(actor),calibrate:canCalibrate(actor),audit:events.length>0||['pm','auditor','executive'].includes(actor.role)}};
}
export function mutateAppraisal(store,actor,id,action,input) {
  return store.transaction(()=>{
    const current=accessibleAppraisal(store,actor,id);
    requireThat(current.version===input.expectedVersion,'The record changed. Reload before trying again.',409);
    const a=structuredClone(current);
    const employee=store.all('employees').find(e=>e.id===a.employeeId);
    const at=new Date().toISOString();
    const before=structuredClone(a);
    if(action==='finalise') {
      requireThat(canFinalise(actor),'FINALISE_SCORE permission is required.',403);
      requireThat(actor.employeeId!==a.employeeId,'You cannot finalise your own score.',403);
      const computed=finalisationPreview(a,input,store.meta('deductionPolicy'));
      const r={id:crypto.randomUUID(),version:a.revisions.length+1,supervisorSnapshot:a.supervisorScore,calibratedSnapshot:a.calibratedScore,...computed,reason:String(input.reason??'').trim(),evidence:String(input.evidence??'').trim(),basis:String(input.basis??'').trim(),finalisedBy:actor.name,finalisedById:actor.id,finalisedAt:at,reopenedFromId:a.revisions.at(-1)?.id??null,policySnapshot:structuredClone(store.meta('deductionPolicy'))};
      a.revisions.push(r);a.status='locked';a.released=false;
      store.addRevision(a,r);
    } else if(action==='calibrate') {
      requireThat(canCalibrate(actor),'CALIBRATE_SCORE permission is required.',403);
      requireThat(actor.employeeId!==a.employeeId,'You cannot calibrate your own score.',403);
      requireThat(a.status!=='locked','Reopen before calibrating a locked score.',409);
      requireThat(a.supervisorScore!=null,'Supervisor submission is required.');
      requireThat(String(input.reason??'').trim()&&String(input.evidence??'').trim(),'Calibration requires an evidence reference and reason.');
      const score=scoreValue(input.score)/100;
      a.calibrations.push({score,previousScore:a.calibratedScore??a.supervisorScore,reason:input.reason.trim(),evidence:input.evidence.trim(),approvedBy:actor.name,approvedById:actor.id,at});
      a.calibratedScore=score;a.calibrationComplete=true;a.status='awaiting_finalisation';
    } else if(action==='reopen') {
      requireThat(canFinalise(actor),'REOPEN_SCORE permission is required.',403);
      requireThat(actor.employeeId!==a.employeeId,'You cannot reopen your own score.',403);
      requireThat(a.status==='locked','Only a locked score can be reopened.',409);
      requireThat(String(input.reason??'').trim()&&String(input.approvalReference??'').trim(),'Reopening requires a reason and authorisation reference.');
      a.status='reopened';a.released=false;a.reopening={reason:input.reason.trim(),approvalReference:input.approvalReference.trim(),actorId:actor.id,at};
    } else if(action==='release') {
      requireThat(canFinalise(actor),'RELEASE_RESULT permission is required.',403);
      requireThat(a.status==='locked','Lock the final score before releasing it.');
      requireThat(!a.released,'This result is already released.',409);
      a.released=true;a.releasedAt=at;
    } else if(action==='check-in') {
      requireThat(['manager','pm','hod'].includes(actor.role),'A manager or PM officer must record the check-in.',403);
      requireThat(a.status!=='locked','Locked appraisals cannot be edited.',409);
      requireThat(String(input.note??'').trim(),'Record the discussion and agreed next action.');
      a.checkIns.push({id:crypto.randomUUID(),note:input.note.trim(),at,recordedBy:actor.name});
    } else if(action==='self-review') {
      requireThat(actor.employeeId===employee.id,'Only the employee can submit their self-review.',403);
      requireThat(a.status!=='locked','The appraisal is locked.',409);
      requireThat(String(input.note??'').trim(),'A self-review is required.');
      a.selfReview={note:input.note.trim(),submittedAt:at};
      // Do not regress supervisor-submitted/calibrated/reopened workflows.
      if(a.supervisorScore==null) a.status='manager_review';
    } else {
      requireThat(false,'Unknown appraisal action.',404);
    }
    a.version++;
    store.saveAppraisal(a,current.version);
    store.audit(actor,a.id,action,before,a);
    return {id:a.id,version:a.version,status:a.status};
  });
}
export function reconciliationRows(store,actor) {
  requireThat(['pm','executive','auditor'].includes(actor.role),'Reporting permission is required.',403);
  return store.all('appraisals').flatMap(a=>{
    const e=store.all('employees').find(e=>e.id===a.employeeId);
    return a.revisions.map(r=>({employee_id:e.id,employee_name:e.name,department:e.department,cycle:a.cycleId,revision:r.version,current:a.status==='locked'&&a.revisions.at(-1).id===r.id,supervisor:r.supervisorSnapshot,calibrated:r.calibratedSnapshot??'',deduction:r.deductionPoints,final:r.finalScore,rating:r.finalRating,reason:r.reason,actor:r.finalisedBy,at:r.finalisedAt}));
  });
}
export function csvFromRows(rows) {
  const columns=['employee_id','employee_name','department','cycle','revision','current','supervisor','calibrated','deduction','final','rating','reason','actor','at'];
  const escape=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
  return [columns.join(','),...rows.map(r=>columns.map(c=>escape(r[c])).join(','))].join('\r\n');
}
