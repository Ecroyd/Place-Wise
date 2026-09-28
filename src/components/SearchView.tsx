"use client";
import {createContext,useContext,useState,type Dispatch,type SetStateAction} from 'react';
import {defaultView,type SearchView} from '@/src/lib/account/view';
const Context=createContext<{view:SearchView;setView:Dispatch<SetStateAction<SearchView>>}|null>(null);
export function SearchViewProvider({children}:{children:React.ReactNode}){const [view,setView]=useState(defaultView);return <Context.Provider value={{view,setView}}>{children}</Context.Provider>}
export function useSearchView(){const context=useContext(Context);if(!context)throw Error('Search view provider missing');return context;}
export function useViewField<K extends keyof SearchView>(key:K):[SearchView[K],Dispatch<SetStateAction<SearchView[K]>>]{const {view,setView}=useSearchView();return [view[key],value=>setView(old=>({...old,[key]:typeof value==='function'?(value as (previous:SearchView[K])=>SearchView[K])(old[key]):value}))];}
