import {addWorkdays,notify} from './model.mjs';

function recipients(ctx,r,roles) {
  const company=r.snapshot?.company || r.company;
  return ctx.s.users.filter(u=>u.active!==false && (!company || !u.company || u.company===company) &&
    roles.includes(u.role) && (u.role!=='hod' || u.department===r.snapshot?.department)).map(u=>u.id);
}

function send(ctx,r,recipient,message,date,key) {
  if(!recipient || ctx.s.outbox.some(n=>n.key===key && n.recipient===recipient))return 0;
  notify(ctx,r,recipient,message,date);
  ctx.s.outbox.at(-1).key=key;
  return 1;
}

export function reviewNotices(ctx,r,cycle,today) {
  const manager=r.actingReviewer || r.snapshot.managerId;
  const employee=ctx.s.users.find(u=>u.active!==false && u.employeeId===r.employeeId)?.id;
  const schedule={
    'Goal setting':[cycle.goalDue,manager], 'Self-review':[cycle.selfDue,employee],
    'Manager assessment':[cycle.managerDue,manager], 'Calibration':[cycle.calibrationDue,r.panel?.chair || manager]
  };
  const stage=schedule[r.status];
  if(!stage?.[0])return 0;
  const [date,owner]=stage;
  let count=0;
  const holidays=cycle.policy.holidays;
  const prefix=[r.id,r.status,date].join(':');
  for(const offset of [-7,-3,-1]){
    if(today===addWorkdays(date,offset,holidays)){
      count+=send(ctx,r,owner,r.status+' due '+date,date,prefix+':reminder:'+offset);
    }
  }
  for(const delay of [1,2,3,5]){
    if(today<addWorkdays(date,delay,holidays))continue;
    const targets=delay===1?[manager]:recipients(ctx,r,delay===2?['hod']:delay===3?['executive']:['pm','executive']);
    for(const recipient of targets){
      const label=delay===5?'Unresolved executive exception':'Overdue '+r.status;
      count+=send(ctx,r,recipient,label+' · '+r.title,date,prefix+':overdue:'+delay);
    }
  }
  return count;
}

export function probationEscalation(ctx,r,today) {
  if(today<=r.finalDue)return 0;
  return recipients(ctx,r,['pm','hod','er']).reduce((n,u)=>
    n+send(ctx,r,u,'Confirmation decision overdue · '+r.title,r.finalDue,'confirmation-overdue:'+r.id+':'+r.finalDue),0);
}
