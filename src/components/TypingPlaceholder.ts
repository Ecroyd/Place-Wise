"use client";
import {useEffect,useState} from 'react';

// Types example destinations into an empty field's placeholder and deletes them again,
// showing people what to enter. Stops while the field is focused or filled, and shows a
// static hint for people who prefer reduced motion.
export const EXAMPLE_DESTINATIONS=['Hammersmith','Edinburgh','M1 1AE','Leeds city centre','Cardiff Bay','Brighton station'];
export const STATIC_HINT='e.g. Hammersmith, Edinburgh or M1 1AE';
export function useTypingPlaceholder(active:boolean,examples=EXAMPLE_DESTINATIONS){
 const [text,setText]=useState('');
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{
  const query=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReduced(query.matches);update();
  query.addEventListener('change',update);return()=>query.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  if(!active||reduced)return;
  let example=0,length=0,deleting=false,timer:ReturnType<typeof setTimeout>;
  const tick=()=>{
   const word=examples[example];
   if(!deleting){length++;if(length>=word.length){deleting=true;setText(word);timer=setTimeout(tick,1500);return;}}
   else{length--;if(length<=0){deleting=false;example=(example+1)%examples.length;setText('');timer=setTimeout(tick,450);return;}}
   setText(word.slice(0,length));
   timer=setTimeout(tick,deleting?45:95);
  };
  timer=setTimeout(tick,600);
  return()=>clearTimeout(timer);
 },[active,reduced,examples]);
 if(reduced)return STATIC_HINT;
 return active?text:'Town, postcode or address';
}
