// Fictional people and illustrative scores only. Never substitute real HR data here.
export function initialState() {
  const users = [
    {id:'u-pm',name:'Demo PM Officer',role:'pm',department:'People & Culture'},
    {id:'u-manager',name:'Demo Line Manager',role:'manager',department:'People & Culture',employeeId:'E010'},
    {id:'u-hod',name:'Demo Head of Function',role:'hod',department:'People & Culture'},
    {id:'u-employee',name:'Demo Employee',role:'employee',department:'People & Culture',employeeId:'E001'},
    {id:'u-exec',name:'Demo Executive',role:'executive',department:'Executive'},
    {id:'u-audit',name:'Demo Auditor',role:'auditor',department:'Audit'}
  ];
  const rows = [
    ['E001','Ada Okeke','People & Culture','People Operations Specialist','TCG','u-manager',true,false,4.2,null,true,'awaiting_finalisation'],
    ['E002','Tunde Balogun','People & Culture','People Analytics Specialist','TCG','u-manager',true,false,4.2,4,true,'awaiting_finalisation'],
    ['E003','Zainab Bello','Finance','Financial Analyst','Rosabon Financial Services','u-finance',true,false,3.6,null,false,'awaiting_calibration'],
    ['E004','David Eze','Technology','Software Engineer','Concept Nova','u-tech',true,false,null,null,false,'self_assessment'],
    ['E005','Chioma Nwosu','Operations','Operations Associate','Rosabon Financial Services','u-ops',true,false,3.25,null,true,'awaiting_finalisation'],
    ['E006','Femi Adeyemi','People & Culture','Learning Specialist','TCG','u-manager',true,false,4.65,4.5,true,'awaiting_finalisation'],
    ['E007','Amina Yusuf','Commercial','Relationship Officer','Rosabon Financial Services','u-sales',true,true,null,null,false,'monthly_review'],
    ['E008','Ifeanyi Obi','Commercial','Treasury Associate','Rosabon Financial Services','u-sales',false,true,null,null,false,'probation'],
    ['E009','Sade Williams','Technology','Product Designer','Concept Nova','u-tech',false,false,null,null,false,'probation'],
    ['E010','Daniel Ojo','People & Culture','People Operations Manager','TCG','u-hod',true,false,3.8,null,false,'awaiting_calibration'],
    ['E011','Nneka Umeh','Finance','Control Officer','TCG','u-finance',true,false,2.6,2.75,true,'awaiting_finalisation'],
    ['E012','Emeka James','Operations','Service Delivery Analyst','Concept Nova','u-ops',true,false,null,null,false,'manager_review']
  ];
  const employees = rows.map(([id,name,department,jobTitle,company,managerId,confirmed,commercial]) => ({id,name,department,jobTitle,company,managerId,managerName:users.find(u=>u.id===managerId)?.name || 'Assigned demo manager',confirmed,commercial,email:`${id.toLowerCase()}@example.invalid`,joinedAt:confirmed?'2024-02-12':'2026-07-01',grade:'Professional',active:true}));
  const appraisals = rows.filter(r=>r[6]&&!r[7]).map(r=>({id:`APP-${r[0]}`,employeeId:r[0],cycleId:'2026-Q4',track:'A',supervisorScore:r[8],calibratedScore:r[9],calibrationComplete:r[10],status:r[11],version:1,revisions:[],calibrations:r[9]==null?[]:[{score:r[9],previousScore:r[8],reason:'Illustrative evidence review for demonstration.',approvedBy:'Demo Head of Function',at:'2026-11-02T10:00:00Z'}],checkIns:[],selfReview:null,goals:[]}));
  return {schemaVersion:1,synthetic:true,users,employees,appraisals,
    cycle:{id:'2026-Q4',name:'Q4 2026',period:'1 Oct – 31 Dec 2026',status:'demonstration',policyVersion:'Draft policy / PRD manual-finalisation addendum',templateApproved:false},
    deductionPolicy:{mode:'disabled',approvalReference:null,approvedBy:null,tracks:[],maxPoints:null,floor:null,evidenceRequired:true},
    decisions:[
      {id:'D01',title:'BSC perspective weights',detail:'Section 10.2: 20/20/50/10. Appendix C: 20/20/40/20. HR and Executive decision required.',owner:'HR + Executive',status:'Blocked'},
      {id:'D-FIN',title:'Score deduction controls',detail:'Define event basis, cap, floor, applicable tracks, authority and employee appeal treatment.',owner:'HR + Executive',status:'Disabled'},
      {id:'D03 / D04',title:'Merit review and reward matrix',detail:'Choose H1/H2 or annual timing; approve rates, budget, salary-position factors and caps.',owner:'Finance + Executive',status:'Draft'},
      {id:'D05 / D08',title:'Commercial scorecards and recovery',detail:'Approve role schedules, minimum thresholds and ramp-up/reset rules.',owner:'Commercial + HR / ER',status:'Blocked'},
      {id:'D06 / D11',title:'360 evidence and redistribution',detail:'Approve quarterly evidence freshness and redistribution when anonymous categories are suppressed.',owner:'HR + Privacy',status:'Blocked'},
      {id:'D09 / D15',title:'Delegation and employment decisions',detail:'Approve authority matrix and HR/ER/legal safeguards. No automatic pay, suspension or exit.',owner:'HR + Executive + Legal',status:'Blocked'}
    ],
    audit:[]};
}
