(function(){
  'use strict';
  const menu=document.getElementById('export-menu'),toggle=document.getElementById('export-toggle'),panel=document.getElementById('export-panel');
  function setOpen(open){panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));}
  toggle.addEventListener('click',()=>setOpen(panel.hidden));
  document.addEventListener('click',event=>{if(!menu.contains(event.target))setOpen(false);});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();setOpen(false);toggle.focus();}});
  menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget))setOpen(false);});
  panel.addEventListener('click',event=>{if(event.target.closest('button')){setOpen(false);toggle.focus();}});
})();
