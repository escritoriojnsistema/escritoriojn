// PostgreSQL btrim(text) trims ASCII spaces; char_length counts code points.
// Preserve stored evidence exactly, including Unicode spaces accepted by the RPC.
// Input forms keep their separate normalization rules.
export function storedFinancialText(value:unknown,min:number,max:number):value is string {
 if(typeof value!=='string'||value!==value.replace(/^ +| +$/g,'')||/[\u0000-\u001f\u007f]/.test(value))return false;
 const length=Array.from(value).length;return length>=min&&length<=max;
}
