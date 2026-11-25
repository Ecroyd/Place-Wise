import {LEGACY_GRADES,NEW_GRADES} from '@/src/lib/data/layers';
// The Ofsted choices: "or better" first (what most people want), then exact grades.
export function RatingOptions(){
  return <>
    <option value="all">Any result</option>
    <optgroup label="Overall grade">{LEGACY_GRADES.slice(0,3).map(([value,label])=><option key={'up'+value} value={'legacy-up:'+value}>{value==='1'?'Outstanding only':label+' or better'}</option>)}</optgroup>
    <optgroup label="New report card (2025 onwards)">{NEW_GRADES.slice(0,4).map(grade=><option key={'up'+grade} value={'new-up:'+grade}>{grade==='Exceptional'?'Exceptional only':grade+' or better'}</option>)}</optgroup>
    <optgroup label="Exact overall grade">{LEGACY_GRADES.map(([value,label])=><option key={value} value={'legacy:'+value}>{label}</option>)}</optgroup>
    <optgroup label="Exact report-card grade">{NEW_GRADES.map(grade=><option key={grade} value={'new:'+grade}>{grade}</option>)}</optgroup>
  </>;
}
