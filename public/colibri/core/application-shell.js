import { trackController } from "./util.js";
// Optional responsive navigation for the public Colibri application shell.
// Presentation remains in @colibri-kit/css/applications. Business routes are caller-owned.
export function createApplicationShell(root, options = {}) {
 if(root.__colibriApplicationShell)return root.__colibriApplicationShell;
 const sidebar=options.sidebar||root.querySelector('[data-app-part=sidebar]');
 const trigger=options.trigger||root.querySelector('[data-app-part=trigger]');
 const close=options.close||root.querySelector('[data-app-part=close]');
 const backdrop=options.backdrop||root.querySelector('[data-app-part=backdrop]');
 if(!sidebar||!trigger||!close||!backdrop)throw new Error('Application shell requires sidebar, trigger, close and backdrop parts.');
 const doc=root.ownerDocument, win=doc.defaultView, media=win.matchMedia(options.breakpoint||'(max-width:900px)');
 const abort=new win.AbortController(),listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:abort.signal});
 sidebar.id ||= 'colibri-navigation-'+Math.random().toString(36).slice(2,9);
 trigger.setAttribute('aria-controls',sidebar.id);
 const original={inert:sidebar.inert,role:sidebar.getAttribute('role'),modal:sidebar.getAttribute('aria-modal'),label:sidebar.getAttribute('aria-label')};
 const background=new Map();
 const restoreAttribute=(name,value)=>value==null?sidebar.removeAttribute(name):sidebar.setAttribute(name,value);
 function restoreBackground(){for(const [el,inert] of background)el.inert=inert;background.clear();}
 function setOpen(open,focus=false){
  restoreBackground();
  const modal=media.matches&&open;
  if(modal){
   for(let branch=sidebar;branch.parentElement;branch=branch.parentElement){for(const el of branch.parentElement.children)if(el!==branch&&el!==backdrop){background.set(el,el.inert);el.inert=true;}if(branch.parentElement===doc.body)break;}
   sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-label',original.label||'Navigation');
  }else{restoreAttribute('role',original.role);restoreAttribute('aria-modal',original.modal);restoreAttribute('aria-label',original.label);}

  root.toggleAttribute('data-open',open);root.toggleAttribute('data-nav-open',open);
  trigger.setAttribute('aria-expanded',String(open));sidebar.inert=media.matches&&!open;backdrop.hidden=!media.matches||!open;
  if(focus)(open?close:trigger).focus({preventScroll:true});
 }
 listen(trigger,'click',()=>setOpen(trigger.getAttribute('aria-expanded')!=='true',true));
 listen(close,'click',()=>setOpen(false,true));listen(backdrop,'click',()=>setOpen(false,true));
 listen(sidebar,'click',event=>{if(event.target.closest('a[href],[data-app-action=navigate]'))setOpen(false);});
 listen(doc,'keydown',event=>{
  if(!media.matches||trigger.getAttribute('aria-expanded')!=='true'||doc.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){event.preventDefault();setOpen(false,true);}
  if(event.key==='Tab'){
   const items=[...sidebar.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
  }
 });
 listen(media,'change',()=>setOpen(false));setOpen(false);
 const controller={open:()=>setOpen(true,true),close:()=>setOpen(false,true),destroy(){abort.abort();restoreBackground();sidebar.inert=original.inert;restoreAttribute('role',original.role);restoreAttribute('aria-modal',original.modal);restoreAttribute('aria-label',original.label);backdrop.hidden=true;root.removeAttribute('data-open');root.removeAttribute('data-nav-open');trigger.setAttribute('aria-expanded','false');delete root.__colibriApplicationShell;}};
 root.__colibriApplicationShell=trackController(root,controller);return root.__colibriApplicationShell;
}
