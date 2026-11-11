const app=document.querySelector('#app'),dialog=document.querySelector('#dialog'),toast=document.querySelector('#toast');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const extra={home:'Home',inbox:'My tasks',reports:'Reports',audit:'Audit trail',accounts:'User accounts'};
const reviewPages=['review','response','commercial','probation'];
const outcomePages=['appeal','capability','recognition','talent','exception'];
const rewardPages=['merit','payBasis','meritException','scenario'];
const setupPages=['cycle','cadence','strategy','template','track','policy','mapping','batch','migration','cutover','accounts'];
const icons={
 home:'M3 10l9-7 9 7v11h-6v-7H9v7H3z', inbox:'M3 5h18v14H3z M3 12h5l2 3h4l2-3h5',
 reviews:'M5 4h14v17H5z M8 9h8 M8 13h8 M8 17h5', team:'M3 21v-2a6 6 0 0 1 12 0v2 M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M16 6a3 3 0 0 1 0 6 M18 15a5 5 0 0 1 3 5',
 outcomes:'M4 20v-6l6-5 4 2 6-8 M15 3h5v5', rewards:'M3 8h18v5H3z M5 13v8h14v-8 M12 8v13 M12 8C5 8 6 2 9 3l3 5c7 0 6-6 3-5z',
 reports:'M4 3v17h17 M8 16v-4 M13 16V6 M18 16v-7', setup:'M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M9 15v6',
 audit:'M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z M8 12l3 3 5-6'
};
function navigation(){
 const role=state.actor.role;
 const group=(title,icon,keys)=>({title,icon,keys:keys.filter(permitted)});
 const reviews=group(({employee:'My performance',manager:'Team performance',hod:'Function performance',pm:'Review management',executive:'Performance oversight',sales:'Commercial performance'})[role]??'Performance','reviews',
   role==='sales'?['sourceBatch','commercial','mapping',...reviewPages.filter(k=>k!=='commercial')]:
   [...reviewPages,...(role==='pm'?['cycle','cadence','batch']:[])]);
 const people=group(({employee:'My profile',manager:'My team',hod:'My function'})[role]??'People','team',['employee']);
 const outcomes=group(role==='er'?'Employee relations':role==='talent'?'Talent management':'Performance outcomes','outcomes',
   role==='talent'?['talent','recognition','capability','appeal','exception']:role==='er'?['capability','appeal','exception','recognition','talent']:outcomePages);
 const rewards=group(role==='finance'?'Compensation approvals':'Compensation','rewards',rewardPages);
 const insights=group('Analytics','reports',['reports']);
 const auditGroup=group('Audit & assurance','audit',['audit']);
 const groups=({finance:[rewards,insights,reviews,people,outcomes],auditor:[auditGroup,insights,reviews,people,outcomes,rewards],
   er:[outcomes,people,reviews,rewards,insights],talent:[outcomes,people,reviews,insights,rewards],
   executive:[insights,reviews,rewards,outcomes,people],manager:[people,reviews,outcomes,insights,rewards],hod:[people,reviews,insights,outcomes,rewards]
 })[role]??[reviews,people,outcomes,rewards,insights];
 if(!groups.includes(auditGroup))groups.push(auditGroup);
 const assigned=new Set(groups.flatMap(g=>g.keys));
 const setup=group(['admin','pm'].includes(role)?'Administration':'Resources','setup',
   ['sourceBatch',...setupPages].filter(k=>!assigned.has(k)));
 if(role==='admin')groups.unshift(setup);else groups.push(setup);
 return groups.filter(g=>g.keys.length);
}
function navIcon(key){return '<svg aria-hidden="true" viewBox="0 0 24 24" class="nav-icon"><path d="'+icons[key]+'"/></svg>';}
const friendly={employeeId:'Employee',cycleId:'Cycle',policyId:'Policy version',reviewId:'Appraisal',source:'Source',qa:'Quality review',cpiStart:'Starting CPI index',cpiEnd:'Closing CPI index',poolKobo:'Budget (kobo)',proposedKobo:'Proposed annual increase (kobo)',awardKobo:'Approved annual increase (kobo)',supervisorScore:'Submitted supervisor score',calibratedScore:'Approved calibration score',by:'Recorded by',at:'Recorded at',reference:'Reference',kind:'Type',id:'Reference',status:'Status'};
const label=k=>friendly[k]??(k.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));
let info,state,csrf,section='home',selected='',query='',filter='All',department='All',cycle='All',manager='All',currentForm=null,working=false,menuOpen=false;
let accounts=null,files=[];
const navLabel=k=>({review:'Performance reviews',response:'360 feedback',employee:({employee:'My profile',manager:'Direct reports',hod:'Function directory'})[state?.actor.role]??'Employee directory'})[k]??state?.sections[k]??extra[k]??label(k);
const fmtDate=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(value));
function say(message,error=false){toast.textContent=message;toast.className='show '+(error?'error':'');clearTimeout(say.timer);say.timer=setTimeout(()=>toast.className='',5500);}
async function api(path,values){
 const response=await fetch('/api/platform/'+path,{method:values?'POST':'GET',headers:values?{'Content-Type':'application/json','X-CSRF-Token':csrf??''}:{},body:values?JSON.stringify(values):undefined});
 const data=await response.json();if(!response.ok){const error=new Error(data.error??'Request failed');error.status=response.status;throw error;}return data;
}
function button(title,attributes,secondary=false){return '<button class="button '+(secondary?'secondary':'')+'" '+attributes+'>'+escape(title)+'</button>';}
function permitted(k){
 if(['home','inbox'].includes(k))return true;
 if(k==='reports')return ['manager','hod','executive','finance','pm','auditor','er','talent'].includes(state.actor.role);
 if(['employee','manager','hod','pm'].includes(state.actor.role)&&['review','response','employee'].includes(k))return true;
 if(k==='accounts')return state.actor.role==='admin'&&info.mode==='live';
 if(k==='audit')return !!state.audit;
 return (state.rows[k]?.length??0)>0||(state.available[k]?.length??0)>0;
}
function references(value){
 if(typeof value!=='string')return value;
 if(/^\d{4}-\d{2}-\d{2}T/.test(value))return fmtDate(value);
 for(const rows of Object.values(state.rows)){const row=rows.find(r=>r.id===value);if(row)return row.title;}
 return value;
}
function valueView(value,depth=0){
 if(value==null||value==='')return '<span class="muted">—</span>';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(Array.isArray(value)){
   if(!value.length)return '<span class="muted">None recorded</span>';
   if(value.every(v=>typeof v!=='object'))return escape(value.map(references).join(', '));
   return '<div class="entries">'+value.map((v,i)=>'<details><summary>'+escape(v.title??v.name??v.decision??v.category??v.kind??(v.revision?'Revision '+v.revision:'Entry '+(i+1)))+'</summary>'+valueView(v,depth+1)+'</details>').join('')+'</div>';
 }
 if(typeof value==='object')return '<dl class="kv">'+Object.entries(value).filter(([k,v])=>v!==null&&v!==undefined&&(!Array.isArray(v)||v.length>0)&&!['id','policySnapshot'].includes(k)).map(([k,v])=>'<div><dt>'+escape(label(k))+'</dt><dd>'+valueView(v,depth+1)+'</dd></div>').join('')+'</dl>';
 return escape(references(value));
}
const tag=s=>'<span class="pill '+(/Closed|Published|Approved|Released|Acknowledged|Reconciled/.test(s)?'teal':/Pending|review|approval|Approval|Nomination/.test(s)?'amber':'blue')+'">'+escape(s)+'</span>';
function logo(){return '<div class="brand"><span class="brand-symbol">TCG</span><span class="brand-name">THE CONCEPT<br>GROUP</span></div>';}
let requestVersion=0;
async function reload(){
 const version=++requestVersion;
 let view;
 try{view=await api('view'+(selected?'?id='+encodeURIComponent(selected):''));}
 catch(e){if(version!==requestVersion)return;if(selected&&[403,404].includes(e.status)){selected='';history.replaceState(null,'','#'+section);return reload();}throw e;}
 if(version!==requestVersion)return;
 state=view;csrf=view.csrf??csrf;
 if(!permitted(section)||(selected&&view.detail?.type!==section)){
   section='home';selected='';history.replaceState(null,'','#home');
 }
 const attachments=selected&&info.evidence?(await api('files?entity='+encodeURIComponent(selected))).files:[];
 const users=section==='accounts'?await api('accounts'):null;
 if(version!==requestVersion)return;
 files=attachments;accounts=users;render();
}
function go(type,id=''){
 section=type;selected=id;query='';filter=department=cycle=manager='All';menuOpen=false;
 location.hash=type+(id?'/'+id:'');reload().then(()=>document.querySelector('#main')?.focus({preventScroll:true})).catch(e=>say(e.message,true));
}
function login(){state=null;selected='';section='home';
 app.innerHTML='<div class="login-page"><section class="login-intro">'+logo()+'<div><div class="login-line"></div><h1>Performance<br>Management</h1><p>The Concept Group · People & Culture</p></div><footer>Employee, manager and HR workspace</footer></section><main class="login-form" id="main"><div class="login-inner"><h2>'+ (info.mode==='live'?'Sign in':'Open your workspace')+'</h2><p>'+(info.mode==='live'?'Use your organisation account.':'Choose a role to work through the appraisal cycle using fictional records.')+'</p><form id="signin">'+(info.mode==='live'?'<div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>':'<div class="field"><label for="user">Acceptance role</label><select id="user" name="userId">'+info.users.map(u=>'<option value="'+escape(u.id)+'" '+(u.role==='pm'?'selected':'')+'>'+escape(u.name)+'</option>').join('')+'</select></div>')+'<p class="form-error" role="alert"></p><button class="button" type="submit">Open workspace</button></form>'+(info.ssoUrl?'<a class="button secondary" href="'+escape(info.ssoUrl)+'">Company sign-in</a>':'')+'</div></main></div>';
}
function heading(title,desc,actions=''){return '<div class="page-head"><div><h1>'+escape(title)+'</h1>'+(desc?'<p>'+escape(desc)+'</p>':'')+'</div><div class="actions">'+actions+'</div></div>';}
const actionsFor=(type,r)=>r?state.detail.actions:state.available[type]??[];
const commands=(type,r)=>actionsFor(type,r).map((a,i)=>button(a.label,'data-command="'+escape(a.id)+'"',i>0)).join('');
function grid(items){return '<div class="metric-grid">'+items.map(([name,n])=>'<article class="metric"><div class="metric-top">'+escape(name)+'</div><div class="metric-number">'+escape(n)+'</div></article>').join('')+'</div>';}
function rowTable(rows,type){
 if(!rows.length)return '<div class="empty">No matching records.</div>';
 return '<div class="table-scroll"><table><thead><tr><th>Record</th><th>Stage</th><th>Department</th><th>Updated</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+escape(r.title)+'</strong>'+(r.cycle?'<small class="subline">'+escape(r.cycle)+'</small>':'')+'</td><td>'+tag(r.status)+'</td><td>'+escape(r.department||'—')+'</td><td>'+escape(fmtDate(r.updatedAt))+'</td><td>'+button('Open','data-record="'+escape(r.id)+'" data-type="'+escape(type??r.type)+'"',true)+'</td></tr>').join('')+'</tbody></table></div>';
}
const flat=()=>Object.entries(state.rows).flatMap(([type,rs])=>rs.map(r=>({...r,type})));
function home(){
 const reviews=state.rows.review??[],open=reviews.filter(r=>!['Closed','Approved exception'].includes(r.status)),todo=flat().filter(r=>r.actionCount&& !['Closed','Published','Approved','Active','Applied','Reconciled'].includes(r.status)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 return heading(({employee:'My performance',manager:'Team overview',hod:'Function overview',finance:'Compensation overview',auditor:'Audit overview',er:'Employee relations overview',talent:'Talent overview'})[state.actor.role]??'Performance overview',state.actor.name+' · '+state.roles[state.actor.role])+grid([['Performance reviews',reviews.length],['In progress',open.length],['Closed',reviews.filter(r=>r.status==='Closed').length],['Approved exceptions',reviews.filter(r=>r.status==='Approved exception').length]])+'<div class="two-col"><section class="panel"><div class="panel-head"><h2>Work awaiting action</h2><button class="text-btn" data-nav="inbox">View my work →</button></div>'+rowTable(todo.slice(0,7))+'</section><aside class="panel"><div class="panel-head"><h2>Employee pathways</h2></div><div class="panel-body">'+[['review','Quarterly appraisal'],['commercial','Monthly commercial review'],['probation','Six-month confirmation']].map(([k,t])=>'<div class="track-row"><div class="track-top"><span class="track-title">'+t+'</span><strong>'+state.rows[k].length+'</strong></div></div>').join('')+'</div></aside></div>';
}
function filterSelect(id,title,values,selected){return '<select aria-label="'+escape(title)+'" id="'+id+'"><option value="All">'+escape(title)+'</option>'+[...new Set(values.filter(Boolean))].sort().map(x=>'<option '+(selected===x?'selected':'')+'>'+escape(x)+'</option>').join('')+'</select>';}
function filtered(){let rs=section==='inbox'?flat().filter(r=>r.actionCount):state.rows[section]??[];return rs.filter(r=>(filter==='All'||r.status===filter)&&(department==='All'||r.department===department)&&(cycle==='All'||r.cycle===cycle)&&(manager==='All'||r.manager===manager)&&(r.title+' '+r.employee+' '+r.department).toLowerCase().includes(query.toLowerCase()));}
function talentGrid(){
 const levels=['Developing','Effective','High'],potential=['High','Established','Developing'];
 return '<section class="panel"><div class="panel-head"><h2>Performance and potential</h2></div><div class="table-scroll"><table><thead><tr><th>Potential / performance</th>'+levels.map(l=>'<th>'+l+'</th>').join('')+'</tr></thead><tbody>'+potential.map(p=>'<tr><th>'+p+'</th>'+levels.map(l=>'<td>'+(state.rows.talent.filter(r=>r.performance===l&&r.potential===p).map(r=>button(r.employee,'data-type="talent" data-record="'+escape(r.id)+'"',true)).join(' ')||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
}
function listing(){const rows=section==='inbox'?flat().filter(r=>r.actionCount):state.rows[section];return heading(navLabel(section),'',commands(section))+(section==='talent'?talentGrid():'')+(section==='inbox'&&state.notices.length?'<div class="panel"><div class="panel-head"><h2>Notifications</h2></div><div class="panel-body">'+state.notices.slice(0,8).map(n=>'<p>'+escape(n.message)+(n.due?' · Due '+escape(n.due):'')+'</p>').join('')+'</div></div>':'')+'<section class="panel"><div class="filterbar"><input id="query" type="search" aria-label="Search records" placeholder="Search records" value="'+escape(query)+'">'+filterSelect('stage','All stages',rows.map(r=>r.status),filter)+filterSelect('dept','All departments',rows.map(r=>r.department),department)+(section==='review'?filterSelect('cycle','All cycles',rows.map(r=>r.cycle),cycle)+filterSelect('manager','All managers',rows.map(r=>r.manager),manager):'')+'</div><div id="results">'+rowTable(filtered(),section==='inbox'?null:section)+'</div></section>';}
function scorePanel(r){
 if(r.type!=='review')return '';
 const d=r.data, final=d.finalScore??d.revisions?.at(-1)?.finalScore;
 const data=state.actor.role==='employee'?[['Released score',final]]:[['Supervisor',d.supervisorScore],['Calibrated',d.calibratedScore],['Final',final]];
 return '<div class="score-comparison">'+data.map(([k,v])=>'<div class="score-box"><label>'+k+'</label><strong>'+(typeof v==='number'?v.toFixed(2):'—')+'</strong></div>').join('')+'</div>';
}
function evidencePanel(r){if(!info.evidence)return '';const writable=state.actor.role!=='auditor'&&!['Closed','Locked','Reconciled','Exported','Approved exception'].includes(r.status);return '<section class="panel"><div class="panel-head"><h2>Evidence files</h2></div><div class="panel-body">'+files.map(f=>'<p>'+escape(f.name)+' · '+escape(f.scan)+(f.scan==='Clean'?' · <a href="/api/platform/files?download='+encodeURIComponent(f.id)+'">Download</a>':'')+'</p>').join('')+(writable?'<form id="attach"><div class="field"><label for="evidence-file">PDF, image or text file (up to 2 MiB)</label><input type="file" id="evidence-file" name="upload" accept=".pdf,.png,.jpg,.jpeg,.txt" required></div><div class="field"><label for="file-scope">Visibility</label><select name="visibility" id="file-scope"><option>Internal</option><option>Employee shared</option></select></div><p class="form-error" role="alert"></p><button class="button secondary" type="submit">Upload for scanning</button></form>':'')+'</div></section>';}
function detail(){
 const r=state.detail;if(!r)return '<div class="empty">Record unavailable.</div>';
 return '<button class="text-btn back" data-nav="'+escape(section)+'">← Back to '+escape(navLabel(section))+'</button>'+heading(r.title,navLabel(r.type)+' · Revision '+r.version,tag(r.status))+scorePanel(r)+(r.related?.length?'<div class="panel"><div class="panel-head"><h2>Employee reviews and actions</h2></div>'+rowTable(r.related)+'</div>':'')+'<div class="detail-grid"><section><div class="panel"><div class="panel-head"><h2>Record details</h2></div><div class="panel-body">'+valueView(r.data)+'</div></div>'+evidencePanel(r)+'</section><aside><div class="panel"><div class="panel-head"><h2>Available actions</h2></div><div class="panel-body action-stack">'+(commands(section,r)||'<p class="muted">No action is due from your role at this stage.</p>')+(r.type==='merit'&&['Exported','Reconciled'].includes(r.status)&&state.actor.role==='finance'?button('Download payroll instructions','data-export="payroll"',true):'')+'</div></div><div class="panel"><div class="panel-head"><h2>Activity</h2></div><div class="panel-body timeline">'+(r.history.map(e=>'<div class="event"><b>'+escape(e.to??label(e.action.split('.').at(-1)))+'</b><p>'+escape(e.actor)+'</p><time>'+escape(fmtDate(e.at))+'</time></div>').join('')||'<p class="muted">No visible events.</p>')+'</div></div></aside></div>';
}
const reportFilters={cycle:'',frequency:'',company:'',department:'',manager:''};
function operationsReport(){
 const all=state.operations || [];
 if(!all.length)return '';
 const rows=all.filter(r=>Object.entries(reportFilters).every(([key,value])=>!value||r[key]===value));
 const selects=Object.keys(reportFilters).map(key=>'<label>'+escape(label(key))+'<select data-report-filter="'+key+'"><option value="">All</option>'+
   [...new Set(all.map(r=>r[key]))].sort().map(value=>'<option '+(value===reportFilters[key]?'selected':'')+'>'+escape(value)+'</option>').join('')+'</select></label>').join('');
 const n=rows.length;
 const rate=key=>n?Math.round(100*rows.filter(r=>r[key]).length/n)+'%':'—';
 const stages=['baseline','midpoint','supervisor_scored','calibrated','released','conversation','acknowledged','completed'];
 const issues=rows.filter(r=>r.overdue||r.diagnostic);
 return '<section class="panel"><div class="panel-head"><h2>Cycle operations</h2></div><div class="panel-body"><div class="filters">'+selects+'</div>'+
   grid([['Eligible',n],['Completed',rate('completed')],['Administratively resolved',rate('resolved')],['Overdue',rows.filter(r=>r.overdue).length]])+
   stages.map(key=>'<div class="bar-row"><span>'+escape(label(key))+'</span><progress value="'+rows.filter(r=>r[key]).length+'" max="'+(n||1)+'"></progress><strong>'+rate(key)+'</strong></div>').join('')+
   (issues.length?'<h3>Items requiring attention</h3><ul>'+issues.map(r=>'<li>'+escape([r.employee,r.status,r.diagnostic,r.due].filter(Boolean).join(' · '))+'</li>').join('')+'</ul>':'')+'</div></section>';
}
app.addEventListener('change',event=>{
 const key=event.target.dataset.reportFilter;
 if(key&&Object.hasOwn(reportFilters,key)){reportFilters[key]=event.target.value;render();}
});
function trendsReport(){
 if(!state.trends?.length)return '';
 const names={month:'Month',appeals:'Appeals filed',cases:'Cases opened',pips:'PIPs started',confirmations:'Probation decisions',commercialBelowTarget:'Commercial months below target',approvedMeritNGN:'Approved annual merit (NGN)'};
 return '<section class="panel"><div class="panel-head"><h2>Outcomes by month</h2>'+button('Export monthly outcomes','data-export="trends"',true)+'</div><div class="table-scroll"><table><thead><tr>'+
   Object.values(names).map(name=>'<th>'+escape(name)+'</th>').join('')+'</tr></thead><tbody>'+state.trends.map(row=>'<tr>'+Object.keys(names).map(k=>'<td>'+escape(row[k]?.toLocaleString())+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>';
}
function reports(){
 const reviews=state.rows.review,group={};for(const r of reviews)group[r.department]??={total:0,closed:0,exceptions:0};for(const r of reviews){group[r.department].total++;if(r.status==='Closed')group[r.department].closed++;if(r.status==='Approved exception')group[r.department].exceptions++;}
 const staff=['pm','hod','manager','executive','auditor'].includes(state.actor.role),exportScore=['pm','executive','auditor'].includes(state.actor.role);
 return heading('Performance reports','Results in your authorised scope.',(staff?button('Export completion','data-export="completion"',true):'')+(exportScore?button('Export score register','data-export="scores"',true):''))+grid([['Quarterly records',reviews.length],['Commercial months',state.rows.commercial.length],['Confirmation plans',state.rows.probation.length],['Open appeals',state.rows.appeal.filter(r=>r.status!=='Closed').length]])+operationsReport()+trendsReport()+'<div class="panel"><div class="panel-head"><h2>Closed quarterly rating distribution</h2></div><div class="panel-body">'+state.aggregates.ratingBands.map((n,i)=>'<div class="bar-row"><span>Rating '+(i+1)+'</span><progress value="'+n+'" max="'+(reviews.length||1)+'"></progress><strong>'+n+'</strong></div>').join('')+'</div></div><div class="panel"><div class="panel-head"><h2>Quarterly completion by department</h2></div><div class="table-scroll"><table><thead><tr><th>Department</th><th>Eligible</th><th>Closed</th><th>Approved exceptions</th><th>Open</th><th>Completed</th><th>Administratively resolved</th></tr></thead><tbody>'+Object.entries(group).map(([d,g])=>'<tr><td>'+escape(d)+'</td><td>'+g.total+'</td><td>'+g.closed+'</td><td>'+g.exceptions+'</td><td>'+(g.total-g.closed-g.exceptions)+'</td><td>'+Math.round(100*g.closed/g.total)+'%</td><td>'+Math.round(100*(g.closed+g.exceptions)/g.total)+'%</td></tr>').join('')+'</tbody></table></div></div>'+Object.entries(state.rows).filter(([k,rs])=>rs.length&&['review','commercial','probation','capability','talent','merit'].includes(k)).map(([type,rs])=>{const counts={};for(const r of rs)counts[r.status]=(counts[r.status]??0)+1;return '<div class="panel"><div class="panel-head"><h2>'+escape(navLabel(type))+'</h2></div><div class="panel-body">'+Object.entries(counts).map(([s,n])=>'<div class="bar-row"><span>'+escape(s)+'</span><progress value="'+n+'" max="'+rs.length+'"></progress><strong>'+n+'</strong></div>').join('')+'</div></div>';}).join('');
}
function audit(){return heading('Audit trail','Recent authorised changes')+'<div class="panel table-scroll"><table><thead><tr><th>Time · Lagos</th><th>Action</th><th>Actor</th><th>Transition</th></tr></thead><tbody>'+(state.audit??[]).map(e=>'<tr><td>'+escape(fmtDate(e.at))+'</td><td>'+escape(e.action)+'</td><td>'+escape(e.actor)+'</td><td>'+escape([e.from,e.to].filter(Boolean).join(' → '))+'</td></tr>').join('')+'</tbody></table></div>';}
function accountsPage(){return heading('User accounts','Provision and deactivate platform access.',button('Create account','data-account="new"'))+'<div class="panel table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>'+accounts.users.map(u=>'<tr><td>'+escape(u.name)+'</td><td>'+escape(u.email)+'</td><td>'+escape(state.roles[u.role])+'</td><td>'+tag(u.active?'Active':'Inactive')+'</td><td>'+(u.active&&u.id!==state.actor.id?button('Deactivate','data-disable="'+escape(u.id)+'"',true):'')+'</td></tr>').join('')+'</tbody></table></div>';}
function roleSelector(){const roles=state.actor.grantedRoles??[];return roles.length>1?'<select id="active-role" aria-label="Active role">'+roles.map(k=>'<option value="'+escape(k)+'" '+(k===state.actor.role?'selected':'')+'>'+escape(state.roles[k])+'</option>').join('')+'</select>':'';}
function render(){
 const content=selected?detail():section==='home'?home():section==='reports'?reports():section==='audit'?audit():section==='accounts'?accountsPage():listing();
 const groups=navigation(),current=groups.find(g=>g.keys.includes(section));
 const link=(key,title,ic,active)=>'<a href="#'+key+'" class="nav-link '+(active?'active':'')+'" '+(active?'aria-current="'+(key===section?'page':'location')+'"':'')+'>'+navIcon(ic)+escape(title)+'</a>';
 const tabs=current&&current.keys.length>1?'<nav class="section-tabs" aria-label="'+escape(current.title)+'">'+current.keys.map(k=>'<a href="#'+k+'" '+(k===section?'aria-current="page"':'')+'>'+escape(navLabel(k))+'</a>').join('')+'</nav>':'';
 const sidebar='<aside id="primary-sidebar" class="sidebar">'+logo()+'<button class="drawer-close" data-menu aria-label="Close navigation">×</button><nav class="sidebar-scroll" aria-label="Main navigation">'+
   link('home','Home','home',section==='home')+link('inbox','My tasks','inbox',section==='inbox')+
   '<div class="nav-caption">'+escape(state.roles[state.actor.role])+'</div>'+groups.map(g=>link(g.keys[0],g.title,g.icon,g===current)).join('')+
   '</nav><div class="side-bottom"><button class="text-btn" data-signout>Sign out</button></div></aside>';
 app.innerHTML='<div class="shell '+(menuOpen?'menu-open':'')+'">'+sidebar+(menuOpen?'<button class="drawer-shade" data-menu aria-label="Dismiss navigation"></button>':'')+
   '<div class="workspace"><header class="topbar"><div class="breadcrumbs"><button class="mobile-menu" data-menu aria-label="Open navigation" aria-controls="primary-sidebar" aria-expanded="'+menuOpen+'">☰</button><span>Performance</span><span>/</span><strong>'+escape(current?.title??navLabel(section))+'</strong></div><div class="user-top">'+roleSelector()+'<div class="avatar">'+escape(state.actor.name.split(' ').slice(0,2).map(n=>n[0]).join(''))+'</div><div class="user-info"><strong>'+escape(state.actor.name)+'</strong><small>'+escape(state.roles[state.actor.role])+'</small></div></div></header>'+
   (info.mode!=='live'?'<div class="demo-banner">Acceptance workspace · Fictional employee records</div>':'')+tabs+'<main id="main" tabindex="-1" class="content">'+content+'</main></div></div>';

}
function input(f){
 const id='f-'+f.key,attrs=' name="'+escape(f.key)+'" id="'+escape(id)+'" '+(f.optional?'':'required')+' ';
 let control;
 if(f.type==='select')control='<select '+attrs+'>'+ (f.optional?'<option value="">None</option>':'')+f.choices.map(c=>{const val=c.value??c;return '<option value="'+escape(val)+'" '+(String(f.default)===String(val)?'selected':'')+'>'+escape(c.label??c)+'</option>';}).join('')+'</select>';
 else if(f.type==='textarea')control='<textarea '+attrs+' maxlength="'+(f.limit??8000)+'">'+escape(f.default??'')+'</textarea>';
 else control='<input '+attrs+' type="'+escape(f.type??'text')+'" '+(f.type==='number'?'min="'+f.min+'" max="'+f.max+'" step="'+(f.integer?'1':'any')+'"':'')+' value="'+escape(f.default??'')+'">';
 return '<div class="field"><label for="'+id+'">'+escape(f.label)+(f.optional?' (optional)':'')+'</label>'+control+(f.hint?'<small class="hint">'+escape(f.hint)+'</small>':'')+'</div>';
}
function finalPreview(){
 const base=state.detail.data.calibratedScore??state.detail.data.supervisorScore;
 const input=dialog.querySelector('[name="deduction"]');
 const points=Number(input?.value||0);
 const final=Math.max(1,(Math.round(base*100)-Math.round(points*100))/100);
 const el=dialog.querySelector('[data-final-preview]');
 if(el)el.textContent=Number.isFinite(final)&&final>=1&&final<=5?final.toFixed(2)+' / 5 · Rating '+(final>=4.5?5:final>=3.75?4:final>=2.75?3:final>=2?2:1):'Check deduction';
}
function openForm(form,kind='workflow'){currentForm={...form,kind,requestId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')};dialog.innerHTML='<h2 id="dialog-title">'+escape(form.label)+'</h2><form id="operation">'+(form.id==='review.lock'?'<div class="notice"><div>Supervisor '+escape(state.detail.data.supervisorScore.toFixed(2))+' · Calibrated '+escape((state.detail.data.calibratedScore??state.detail.data.supervisorScore).toFixed(2))+'<br>Final score: <strong data-final-preview></strong>'+(form.fields.some(f=>f.key==='deduction')?'':'<br>Deduction 0.00 · Disabled by cycle policy')+'</div></div>':'')+form.fields.map(input).join('')+'<p class="form-error" role="alert"></p><div class="actions">'+button('Cancel','type="button" data-cancel',true)+'<button type="submit" class="button teal">'+escape(form.label)+'</button></div></form>';dialog.showModal();if(form.id==='review.lock')finalPreview();}
async function download(report){
 const response=await fetch('/api/platform/export?report='+encodeURIComponent(report)+'&id='+encodeURIComponent(selected));if(!response.ok)throw Error((await response.json()).error);
 const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=report+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',async e=>{
 const route=e.target.closest('.nav-link,.section-tabs a');
 if(route&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();if(!working)go(route.hash.slice(1));return;}
 const b=e.target.closest('button');if(!b||working)return;
 try{
  if(b.hasAttribute('data-menu')){menuOpen=!menuOpen;render();document.querySelector(menuOpen?'.drawer-close':'.mobile-menu')?.focus();}
  else if(b.hasAttribute('data-signout')){await api('logout',{});location.hash='';login();}
  else if(b.dataset.nav)go(b.dataset.nav);
  else if(b.dataset.record)go(b.dataset.type,b.dataset.record);
  else if(b.dataset.command){const options=selected?state.detail.actions:state.available[section];openForm(options.find(x=>x.id===b.dataset.command));}
  else if(b.hasAttribute('data-cancel'))dialog.close();
  else if(b.dataset.export)await download(b.dataset.export);
  else if(b.dataset.account)openForm({label:'Create account',fields:[
    {key:'name',label:'Full name'},{key:'email',label:'Work email',type:'email'},{key:'role',label:'Role',type:'select',choices:Object.entries(accounts.roles).map(([value,label])=>({value,label}))},
    {key:'additionalRoles',label:'Additional role codes (comma-separated)',optional:true,hint:'Use approved role codes from the integration guide.'},{key:'department',label:'Department'},{key:'company',label:'Company scope',optional:true},{key:'employeeId',label:'Linked employee',type:'select',optional:true,choices:accounts.employees.map(e=>({value:e.id,label:e.title}))},
    {key:'password',label:'Local password (at least 12 characters)',type:'password',optional:true},{key:'subject',label:'SSO subject',optional:true}
  ]},'account');
  else if(b.dataset.disable)openForm({label:'Deactivate account',target:b.dataset.disable,fields:[]},'disable');
 }catch(err){say(err.message,true);}
});
document.addEventListener('input',e=>{if(e.target.name==='deduction')finalPreview();if(e.target.id==='query'){query=e.target.value;document.querySelector('#results').innerHTML=rowTable(filtered(),section==='inbox'?null:section);}});
document.addEventListener('change',async e=>{if(e.target.id==='active-role'){try{const a=await api('role',{role:e.target.value});csrf=a.csrf;go('home');}catch(err){say(err.message,true);}return;}if(['stage','dept','cycle','manager'].includes(e.target.id)){if(e.target.id==='stage')filter=e.target.value;if(e.target.id==='dept')department=e.target.value;if(e.target.id==='cycle')cycle=e.target.value;if(e.target.id==='manager')manager=e.target.value;document.querySelector('#results').innerHTML=rowTable(filtered(),section==='inbox'?null:section);}});
document.addEventListener('submit',async e=>{
 e.preventDefault();if(working)return;working=true;const form=e.target,submit=form.querySelector('button[type=submit]');submit.disabled=true;
 try{
  const values=Object.fromEntries(new FormData(form));
  if(form.id==='attach'){
    const file=values.upload;if(file.size>2*1024*1024)throw Error('Maximum file size is 2 MiB.');
    const buffer=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=16384)binary+=String.fromCharCode(...buffer.subarray(i,i+16384));
    await api('files',{entity:selected,name:file.name,base64:btoa(binary),visibility:values.visibility});await reload();say('File quarantined for scanning.');
  }else if(form.id==='signin'){const auth=await api('login',values);csrf=auth.csrf;section='home';selected='';location.hash='home';await reload();}
  else if(form.id==='operation'){
    if(currentForm.kind==='account'||currentForm.kind==='disable'){if(currentForm.kind==='account')values.additionalRoles=(values.additionalRoles||'').split(',').map(x=>x.trim()).filter(Boolean);await api('accounts',currentForm.kind==='disable'?{disable:currentForm.target}:values);dialog.close();await reload();}
    else{const result=await api('command',{type:section,id:selected||undefined,version:selected?state.detail.version:0,action:currentForm.id,values,requestId:currentForm.requestId});dialog.close();section=result.type;selected=result.id;location.hash=section+'/'+selected;try{await reload();}catch(err){if(err.status!==404)throw err;selected='';section='home';location.hash='home';await reload();}}
    say('Saved.');
  }
 }catch(err){form.querySelector('.form-error').textContent=err.message;}finally{working=false;if(submit.isConnected)submit.disabled=false;}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&menuOpen){menuOpen=false;render();document.querySelector('.mobile-menu')?.focus();}
});
window.addEventListener('hashchange',()=>{
 if(!state||location.hash==='#main')return;
 const [type='home',id='']=location.hash.slice(1).split('/');
 if(section===(type||'home')&&selected===id)return;
 section=type||'home';selected=id;menuOpen=false;query='';filter=department=cycle=manager='All';
 reload().catch(e=>say(e.message,true));
});
try{info=await api('info');try{const [type,id]=location.hash.slice(1).split('/');section=type||'home';selected=id??'';await reload();}catch(e){if(e.status===401)login();else throw e;}}catch(e){app.innerHTML='<main class="loading" id="main"><h1>Workspace unavailable</h1><p>'+escape(e.message)+'</p></main>';}
