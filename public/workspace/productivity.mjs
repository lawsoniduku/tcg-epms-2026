// @ts-check
import {hundredths,requireThat} from '../shared/domain.mjs';
/** Apply the approved whole-percentage rule to an exact 1–5 score.
 * @param {{numerator:string,denominator:string}} score
 * @param {number} deduction */
export function productivityResult(score,deduction){
 const n=BigInt(score.numerator),d=BigInt(score.denominator);
 requireThat(d>0n&&n>=d&&n<=5n*d,'Invalid appraisal score.');
 const deducted=n*100n-BigInt(hundredths(deduction))*d;
 const denominator=d*100n;
 const numerator=deducted<denominator?denominator:deducted;
 const finalPercentage=Number((40n*numerator+denominator)/(2n*denominator));
 const productivityUnlockPercent=finalPercentage<60?0:finalPercentage<=70?50:finalPercentage<=90?75:100;
 return {finalPercentage,productivityUnlockPercent,productivityRule:'whole-percent-half-up-v1',
  exactFinalScore:{numerator:String(numerator),denominator:String(denominator)}};
}
/** Historical scores may be displayed as percentages without assigning retrospective entitlement.
 * @param {any} revision */
export function percentageFor(revision){
 if(!revision)return undefined;
 return revision.finalPercentage??Math.floor((hundredths(revision.finalScore)+2)/5);
}
