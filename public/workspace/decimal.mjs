// @ts-check
/** Convert a finite displayed decimal to an exact base-ten fraction.
 * @param {number} value @returns {[bigint,bigint]} */
function fraction(value){
 if(!Number.isFinite(value))throw RangeError('Expected a finite decimal.');
 const [mantissa,exponent='0']=String(value).split('e');
 const scale=(mantissa.split('.')[1]?.length??0)-Number(exponent);
 const digits=BigInt(mantissa.replace('.',''));
 return scale<0?[digits*10n**BigInt(-scale),1n]:[digits,10n**BigInt(scale)];
}
/** @param {bigint} n @param {bigint} d */
function halfUp(n,d){
 if(d<=0n)throw RangeError('Expected a positive denominator.');
 const magnitude=n<0n?-n:n;
 return Number((n<0n?-1n:1n)*((200n*magnitude+d)/(2n*d)))/100;
}
/** @param {number} value */
export function rounded(value){return halfUp(...fraction(value));}
/** @param {number[]} values @param {number[]} weights @param {number} divisor */
function sumProducts(values,weights,divisor){
 if(values.length!==weights.length)throw RangeError('Expected a weight for each score.');
 let n=0n,d=1n;
 for(const [i,value] of values.entries()){
  const [a,b]=fraction(value),[w,v]=fraction(weights[i]),den=b*v;
  const scale=d>den?d:den;
  n=n*(scale/d)+a*w*(scale/den);d=scale;
 }
 return halfUp(n,d*BigInt(divisor));
}
/** @param {number[]} values */
export function mean(values){return sumProducts(values,values.map(()=>1),values.length);}
/** @param {number[]} values @param {number[]} weights */
export function weighted(values,weights){return sumProducts(values,weights,100);}
/** @param {number} actual @param {number} target */
export function percent(actual,target){
 const [a,b]=fraction(actual),[c,d]=fraction(target);
 return halfUp(100n*a*d,b*c);
}
/** Growth after adjusting for an index change. @param {number} nominal @param {number} start @param {number} end */
export function adjustedGrowth(nominal,start,end){
 const [n,d]=fraction(nominal),[a,b]=fraction(start),[c,e]=fraction(end);
 return halfUp((100n*d+n)*a*e-100n*d*b*c,d*b*c);
}
