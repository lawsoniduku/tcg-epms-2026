import { initialState } from './shared/fixtures.mjs';
import { bootstrap, mutateAppraisal, reconciliationRows, csvFromRows } from './shared/workflow.mjs';
let mode=null,actor=null,csrf=null;
const key='tcg-epms-demo-v1';
let state;
function demoStore() {
  if(!state){try{state=JSON.parse(localStorage.getItem(key));}catch{}if(state?.schemaVersion!==1)state=initialState();}
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{throw new Error('Browser storage is unavailable. Changes cannot be saved.');}};
  return {meta:k=>state[k],all:k=>structuredClone(state[k]),getAppraisal:id=>structuredClone(state.appraisals.find(a=>a.id===id)),saveAppraisal:a=>{state.appraisals[state.appraisals.findIndex(x=>x.id===a.id)]=structuredClone(a);},addRevision:()=>{},events:()=>structuredClone(state.audit).reverse(),audit:(user,id,action,before,after)=>{state.audit.push({id:crypto.randomUUID(),at:new Date().toISOString(),actorId:user.id,actorName:user.name,entityId:id,action,before:structuredClone(before),after:structuredClone(after)});},transaction:fn=>{const snapshot=structuredClone(state);try{const r=fn();save();return r;}catch(e){state=snapshot;throw e;}}};
}
async function request(path,body) {
  const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':csrf||''}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
export async function discover() {
  // Static publishing explicitly opts into browser demonstration mode; a failed server never silently falls back.
  const staticDemo=document.querySelector('meta[name="epms-mode"]')?.content==='browser-demo';
  mode=staticDemo?'browser':'server';
  if(mode==='server')return (await request('/api/demo/users')).users;
  return demoStore().all('users');
}
export async function login(userId) {
  if(mode==='server'){const data=await request('/api/demo/login',{userId});actor=data.actor;csrf=data.csrf;}
  else actor=demoStore().all('users').find(u=>u.id===userId);
  return load();
}
export async function load() {
  if(mode==='server'){const data=await request('/api/bootstrap');actor=data.actor;csrf=data.csrf;return {...data,storageMode:'Server / SQLite'};}
  return {...bootstrap(demoStore(),actor),storageMode:'Browser demonstration'};
}
export async function command(id,action,input) {
  if(mode==='server')return request(`/api/appraisals/${encodeURIComponent(id)}/${action}`,input);
  return mutateAppraisal(demoStore(),actor,id,action,input);
}
export async function logout() {if(mode==='server')await request('/api/logout',{});actor=null;}
export async function exportScores() {
  if(mode==='server'){const r=await fetch('/api/reports/final-scores.csv');if(!r.ok)throw new Error((await r.json()).error);return r.blob();}
  return new Blob([csvFromRows(reconciliationRows(demoStore(),actor))],{type:'text/csv'});
}
export const storageMode=()=>mode;
