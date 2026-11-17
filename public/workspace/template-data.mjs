// @ts-check
import {goalHeaders} from './goal-import.mjs';
/** @param {any} state @param {any} actor @param {any} review */
export function templateData(state,actor,review){
 const objectives=state.records.filter(o=>o.type==='strategy'&&o.level==='Individual'&&o.status==='Approved'&&(!actor.company||!o.company||o.company===actor.company)).map(o=>[o.id,o.title]);
 const example=['Example service quality',objectives[0]?.[0]??'','Customer',20,95,'percent','Resolve cases on time',90,'Higher is better','','Service register','Monthly report','No',5,'',review.snapshot.staffId];
 return {headers:[...goalHeaders,'staffId'],example,objectives};
}
