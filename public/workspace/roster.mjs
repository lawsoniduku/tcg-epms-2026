const keys=['title','name','email','company','businessUnit','team','grade','department','jobTitle','managerId','active','confirmed','commercial','peopleManager','joinedAt'];

export function rosterSnapshot(employee) {
  return Object.fromEntries(keys.map(key=>[key,employee[key]]));
}

export function rosterAt(employee,day) {
  const history=employee.assignments || [];
  const applicable=history.filter(change=>change.effective<=day).sort((a,b)=>b.effective.localeCompare(a.effective) || b.sequence-a.sequence)[0];
  if(applicable)return {...employee,...applicable.values};
  if(history.length)return {...employee,active:false};
  return employee;
}

export function recordAssignment(employee,values,effective,today) {
  employee.assignments??=[];
  employee.assignments.push({effective,sequence:employee.assignments.length,values:{...values}});
  Object.assign(employee,rosterAt(employee,today));
  employee.status=employee.active?'Active':'Inactive';
}
