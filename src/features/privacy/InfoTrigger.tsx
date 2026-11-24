import {createContext,useContext,type ReactNode} from 'react';

export const infoTitles={privacy:'Privacidade',terms:'Termos de uso',cookies:'Cookies e preferências',install:'Instalar aplicativo',copyright:'Escritório JN',app:'App'} as const;
export type InfoSection=keyof typeof infoTitles;
export const InfoContext=createContext<(section:InfoSection)=>void>(()=>{});

export function InfoTrigger({section,children,className,disabled,onOpen}:{
 section:InfoSection;children?:ReactNode;className?:string;disabled?:boolean;onOpen?:()=>void;
}){
 const open=useContext(InfoContext);
 return <button type="button" className={className} disabled={disabled} aria-haspopup="dialog" onClick={()=>{
  onOpen?.();open(section);
 }}>{children??infoTitles[section]}</button>;
}
